"""
Q-SPECTRA // Universal Quantum Home & Simulation Platform FastAPI Microservice
Provides:
  1. POST /api/physics/rydberg-master-eq  (4-level ladder EIT/AT susceptibility via QuTiP or NumPy)
  2. POST /api/chat                       (Unified Ollama / Hugging Face Pro proxy with <think> parser)
  3. GET  /api/health                     (Backend capability & solver telemetry)
"""

from __future__ import annotations

import asyncio
import math
import re
from functools import lru_cache
from typing import Any, Literal, Optional

import httpx
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from intel_harvester import harvest_intel_feed, synthesize_quantum_challenge
from sdr_processor import analyze_iq_samples, decode_iq_bytes, generate_synthetic_iq

try:
    import qutip as qt  # type: ignore

    QUTIP_AVAILABLE = True
except ImportError:
    qt = None
    QUTIP_AVAILABLE = False

PLANCK_H = 6.62607015e-34
BOHR_RADIUS = 5.29177210903e-11
ELEMENTARY_CHARGE = 1.602176634e-19

app = FastAPI(
    title="Q-SPECTRA Universal Quantum Home Bridge",
    version="2.3.0",
    description="FastAPI physics & LLM inference bridge for Q-SPECTRA Quantum Home",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RydbergRequest(BaseModel):
    n_principal: int = Field(58, ge=25, le=110)
    rf_power_dbm: float = Field(-15.0, ge=-90.0, le=50.0)
    species: Literal["Rb85", "Cs133"] = "Rb85"
    regime: Literal["thermal_300k", "mot_100uk"] = "thermal_300k"
    detuning_span_mhz: float = Field(300.0, ge=40.0, le=800.0)
    num_points: int = Field(241, ge=51, le=1001)
    omega_p_mhz: float = Field(1.5, ge=0.1, le=20.0)
    omega_c_mhz: float = Field(12.0, ge=1.0, le=60.0)
    gamma_2_mhz: float = Field(6.0, ge=0.5, le=30.0)
    gamma_3_mhz: float = Field(0.5, ge=0.05, le=10.0)
    gamma_4_mhz: float = Field(0.3, ge=0.05, le=10.0)


class ChatRequest(BaseModel):
    prompt: str
    mode: Literal["offline", "ollama", "hf_pro"] = "offline"
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "qwen-quantum-copilot"
    hf_token: str = ""
    hf_model: str = "Qwen/Qwen2.5-32B-Instruct"
    system_context: str = (
        "You are Q-SPECTRA, a universal Quantum Physics, Quantum Computing, and Quantum Sensing "
        "AI Co-Pilot fine-tuned via Unsloth."
    )
    telemetry: Optional[dict[str, Any]] = None


def parse_think_blocks(raw_text: str) -> dict[str, Any]:
    """Extract <think>...</think> reasoning blocks into structured fields."""
    think_matches = re.findall(r"<think>(.*?)</think>", raw_text, flags=re.DOTALL | re.IGNORECASE)
    thinking = "\n\n".join(m.strip() for m in think_matches if m.strip())
    answer = re.sub(r"<think>.*?</think>", "", raw_text, flags=re.DOTALL | re.IGNORECASE).strip()
    return {
        "raw_content": raw_text,
        "thinking": thinking,
        "answer": answer if answer else raw_text.strip(),
        "has_thinking": len(think_matches) > 0,
    }


def _compute_dipole_and_splitting(n_principal: int, rf_power_dbm: float, species: str) -> tuple[float, float, float]:
    species_scale = 1.14 if species == "Cs133" else 1.0
    dipole_cm = (n_principal ** 2) * species_scale * ELEMENTARY_CHARGE * BOHR_RADIUS
    power_watts = 10.0 ** ((rf_power_dbm - 30.0) / 10.0)
    e_field_vm = math.sqrt(power_watts * 377.0) * 0.45
    splitting_mhz = min(250.0, max(0.05, ((dipole_cm * e_field_vm) / PLANCK_H) / 1e6))
    dipole_debye = dipole_cm / 3.33564e-30
    return dipole_debye, e_field_vm, splitting_mhz


def _solve_4level_qutip(
    detuning_mhz: np.ndarray,
    omega_p: float,
    omega_c: float,
    omega_rf: float,
    gamma_2: float,
    gamma_3: float,
    gamma_4: float,
) -> np.ndarray:
    """Solve 4-level ladder steady-state density matrix rho_12 via QuTiP."""
    b1, b2, b3, b4 = [qt.basis(4, i) for i in range(4)]
    s12 = b1 * b2.dag()
    s23 = b2 * b3.dag()
    s34 = b3 * b4.dag()
    s22 = b2 * b2.dag()
    s33 = b3 * b3.dag()
    s44 = b4 * b4.dag()

    c_ops = [
        math.sqrt(gamma_2) * s12,
        math.sqrt(gamma_3) * s23,
        math.sqrt(gamma_4) * s34,
    ]
    h_int = (
        0.5 * omega_p * (s12 + s12.dag())
        + 0.5 * omega_c * (s23 + s23.dag())
        + 0.5 * omega_rf * (s34 + s34.dag())
    )

    absorption = np.zeros_like(detuning_mhz, dtype=float)
    for idx, delta_p in enumerate(detuning_mhz):
        h_total = h_int - float(delta_p) * (s22 + s33 + s44)
        rho_ss = qt.steadystate(h_total, c_ops)
        absorption[idx] = float(np.imag(rho_ss[1, 0]))

    max_val = float(np.max(np.abs(absorption)))
    if max_val > 1e-12:
        absorption = np.abs(absorption) / max_val
    return absorption


def _solve_4level_numpy(
    detuning_mhz: np.ndarray,
    omega_p: float,
    omega_c: float,
    omega_rf: float,
    gamma_2: float,
    gamma_3: float,
    gamma_4: float,
) -> np.ndarray:
    """
    Analytical 4-level ladder weak-probe steady-state susceptibility Im(rho_21):
      chi''(Delta_p) ~ Im[ 1 / (gamma_21 - i*Delta_p + (Omega_c^2 / 4) / (gamma_31 - i*Delta_p + (Omega_rf^2 / 4) / (gamma_41 - i*Delta_p))) ]
    """
    g21 = gamma_2 * 0.5
    g31 = gamma_3 * 0.5 + 0.15
    g41 = gamma_4 * 0.5 + 0.1

    delta = detuning_mhz.astype(np.complex128)
    term_rf = (0.25 * (omega_rf ** 2)) / (g41 - 1j * delta)
    term_c = (0.25 * (omega_c ** 2)) / (g31 - 1j * delta + term_rf)
    rho_21 = (1j * 0.5 * omega_p) / (g21 - 1j * delta + term_c)

    absorption = np.imag(rho_21)
    absorption = np.maximum(0.0, absorption)
    max_val = float(np.max(absorption))
    if max_val > 1e-12:
        absorption = absorption / max_val
    return absorption


@app.get("/api/health")
def health_check() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "q-spectra-quantum-home",
        "qutip_available": QUTIP_AVAILABLE,
        "physics_solver": "qutip_4level_lindblad" if QUTIP_AVAILABLE else "numpy_4level_bloch",
    }


@lru_cache(maxsize=256)
def _cached_rydberg_solve(
    n_principal: int,
    rf_power_dbm: float,
    species: str,
    detuning_span_mhz: float,
    num_points: int,
    omega_p_mhz: float,
    omega_c_mhz: float,
    gamma_2_mhz: float,
    gamma_3_mhz: float,
    gamma_4_mhz: float,
) -> dict[str, Any]:
    dipole_debye, e_field_vm, splitting_mhz = _compute_dipole_and_splitting(
        n_principal, rf_power_dbm, species
    )

    half_span = detuning_span_mhz / 2.0
    detuning_mhz = np.linspace(-half_span, half_span, num_points)

    if QUTIP_AVAILABLE:
        absorption = _solve_4level_qutip(
            detuning_mhz,
            omega_p_mhz,
            omega_c_mhz,
            splitting_mhz,
            gamma_2_mhz,
            gamma_3_mhz,
            gamma_4_mhz,
        )
        solver = "qutip"
    else:
        absorption = _solve_4level_numpy(
            detuning_mhz,
            omega_p_mhz,
            omega_c_mhz,
            splitting_mhz,
            gamma_2_mhz,
            gamma_3_mhz,
            gamma_4_mhz,
        )
        solver = "numpy_4level"

    return {
        "solver": solver,
        "species": species,
        "n_principal": n_principal,
        "rf_power_dbm": rf_power_dbm,
        "dipole_moment_debye": round(dipole_debye, 2),
        "e_field_vm": round(e_field_vm, 5),
        "splitting_mhz": round(splitting_mhz, 2),
        "detuning_mhz": [round(float(x), 2) for x in detuning_mhz],
        "absorption": [round(float(y), 5) for y in absorption],
    }


@app.post("/api/physics/rydberg-master-eq")
async def rydberg_master_eq(req: RydbergRequest) -> dict[str, Any]:
    effective_gamma_2 = 0.6 if req.regime == "mot_100uk" else max(6.2, req.gamma_2_mhz)
    effective_gamma_3 = 0.12 if req.regime == "mot_100uk" else req.gamma_3_mhz
    return await asyncio.to_thread(
        _cached_rydberg_solve,
        req.n_principal,
        round(req.rf_power_dbm, 2),
        req.species,
        round(req.detuning_span_mhz, 2),
        req.num_points,
        round(req.omega_p_mhz, 2),
        round(req.omega_c_mhz, 2),
        round(effective_gamma_2, 2),
        round(effective_gamma_3, 2),
        round(req.gamma_4_mhz, 2),
    )


class SynthesizeChallengeRequest(BaseModel):
    text: str
    title: str = ""
    source_citation: str = "OSINT Literature"
    mode: Literal["offline", "ollama", "hf_pro"] = "offline"
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "qwen-quantum-copilot"
    hf_token: str = ""
    hf_model: str = "Qwen/Qwen2.5-32B-Instruct"


@app.get("/api/intel/feed")
async def get_intel_feed(
    topic: Literal["rydberg", "radar", "magnav", "challenges"] = Query("rydberg"),
    force_refresh: bool = Query(False),
) -> dict[str, Any]:
    return await harvest_intel_feed(topic, force_refresh=force_refresh)


@app.post("/api/sdr/analyze-iq")
async def post_analyze_iq(
    file: Optional[UploadFile] = File(None),
    waveform_type: Literal["lpi_fhss", "lfm_chirp", "drfm_repeater", "hpm_emp_burst"] = Form("lpi_fhss"),
    snr_db: float = Form(15.0),
    sample_rate_mhz: float = Form(120.0),
    iq_format: Literal["complex64", "int16"] = Form("complex64"),
    n_principal: int = Form(58),
    species: Literal["Rb85", "Cs133"] = Form("Rb85"),
    nominal_peak_dbm: float = Form(0.0),
) -> dict[str, Any]:
    if file is not None:
        raw_bytes = await file.read()
        try:
            samples = decode_iq_bytes(raw_bytes, iq_format=iq_format)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        peak_dbm = nominal_peak_dbm
        source_label = file.filename or "uploaded.iq"
    else:
        samples, peak_dbm = generate_synthetic_iq(
            waveform_type=waveform_type,
            snr_db=snr_db,
            sample_rate_mhz=sample_rate_mhz,
        )
        source_label = f"synthetic:{waveform_type}"

    result = await asyncio.to_thread(
        analyze_iq_samples,
        samples,
        sample_rate_mhz,
        n_principal,
        species,
        peak_dbm,
    )
    return {"source": source_label, **result}


@app.post("/api/intel/synthesize-challenge")
async def post_synthesize_challenge(req: SynthesizeChallengeRequest) -> dict[str, Any]:
    return await synthesize_quantum_challenge(
        text=req.text,
        title=req.title,
        source_citation=req.source_citation,
        mode=req.mode,
        ollama_url=req.ollama_url,
        ollama_model=req.ollama_model,
        hf_token=req.hf_token,
        hf_model=req.hf_model,
    )


@app.post("/api/chat")
async def chat_proxy(req: ChatRequest) -> dict[str, Any]:
    telemetry_block = ""
    if req.telemetry:
        telemetry_block = f"\n\n[LIVE WORKBENCH TELEMETRY]\n{req.telemetry}"

    full_system = f"{req.system_context}{telemetry_block}"

    if req.mode == "offline":
        ryd = (req.telemetry or {}).get("rydberg", {})
        rad = (req.telemetry or {}).get("radar", {})
        pnt = (req.telemetry or {}).get("pnt", {})
        raw = (
            "<think>\n"
            f"1. Inspecting live Quantum Home telemetry: Rydberg n={ryd.get('nPrincipal', 58)} "
            f"({ryd.get('species', 'Rb85')}) at {ryd.get('effectivePowerDbm', -15)} dBm -> "
            f"AT splitting {ryd.get('splittingMHz', 'N/A')} MHz.\n"
            f"2. Quantum Radar: Ns={rad.get('nsPhotons', 0.02)}, Nb={rad.get('nbThermal', 1200)}, "
            f"DRFM={'ACTIVE' if rad.get('drfmSpoofActive', True) else 'OFF'}, "
            f"Advantage=+{rad.get('advantageDb', 'N/A')} dB.\n"
            f"3. Quantum PNT: t={pnt.get('missionHours', 2.5)}h, MagNav Lock={'ON' if pnt.get('magNavLock', True) else 'OFF'}, "
            f"CEP={pnt.get('quantumPntErrorMeters', '4.2')} m.\n"
            "</think>\n"
            "**Physics Assessment (Q-SPECTRA Quantum Home Offline Reference):**\n"
            f"- **Rydberg ES ({ryd.get('species', 'Rb85')}, n={ryd.get('nPrincipal', 58)}):** "
            f"Measured Autler-Townes splitting is **{ryd.get('splittingMHz', 'N/A')} MHz** "
            f"({ryd.get('eFieldVm', 'N/A')} V/m). Classical LNA status: "
            f"**{'BURNOUT / SATURATED' if ryd.get('lnaBurnout') else 'NOMINAL'}**.\n"
            f"- **Quantum EP Radar:** SPDC entangled idler correlation yields **+{rad.get('advantageDb', 'N/A')} dB** "
            "advantage over classical coherent radar while rejecting uncorrelated DRFM ghost targets.\n"
            f"- **Contested PNT:** Cold-Atom INS + NV-Diamond MagNav maintains **{pnt.get('quantumPntErrorMeters', '4.2')} m CEP** "
            f"vs. classical INS drift ({pnt.get('classicalInsDriftMeters', 'N/A')} m)."
        )
        parsed = parse_think_blocks(raw)
        return {**parsed, "mode": "offline"}

    if req.mode == "ollama":
        url = f"{req.ollama_url.rstrip('/')}/api/chat"
        payload = {
            "model": req.ollama_model,
            "stream": False,
            "messages": [
                {"role": "system", "content": full_system},
                {"role": "user", "content": req.prompt},
            ],
        }
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Ollama proxy error: {exc}") from exc

        raw = data.get("message", {}).get("content", "") or "No response from Ollama endpoint."
        parsed = parse_think_blocks(raw)
        return {**parsed, "mode": "ollama"}

    if req.mode == "hf_pro":
        if not req.hf_token:
            raise HTTPException(status_code=400, detail="Hugging Face Pro API token required.")
        url = f"https://api-inference.huggingface.co/models/{req.hf_model}/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {req.hf_token}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": req.hf_model,
            "messages": [
                {"role": "system", "content": full_system},
                {"role": "user", "content": req.prompt},
            ],
            "max_tokens": 700,
            "temperature": 0.3,
        }
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"HF Pro proxy error: {exc}") from exc

        raw = (
            data.get("choices", [{}])[0].get("message", {}).get("content", "")
            or "No completion returned."
        )
        parsed = parse_think_blocks(raw)
        return {**parsed, "mode": "hf_pro"}

    raise HTTPException(status_code=400, detail=f"Unsupported mode: {req.mode}")
