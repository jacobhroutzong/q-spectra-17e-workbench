"""
Q-SPECTRA // SigMF & Raw IQ SDR Processor
Computes chunked FFT/PSD spectrogram frames and compares:
  1. Classical GaAs LNA + Superhet (3rd-order IMD & saturation clipping above +15 dBm)
  2. Rydberg Atomic Vapor Cell Demodulator (direct optical Δf_AT(t) = μ|E(t)|/h without clipping)
"""

from __future__ import annotations

import math
from typing import Any, Literal

import numpy as np

PLANCK_H = 6.62607015e-34
BOHR_RADIUS = 5.29177210903e-11
ELEMENTARY_CHARGE = 1.602176634e-19


def generate_synthetic_iq(
    waveform_type: Literal["lpi_fhss", "lfm_chirp", "drfm_repeater", "hpm_emp_burst"] = "lpi_fhss",
    snr_db: float = 15.0,
    sample_rate_mhz: float = 120.0,
    num_samples: int = 8192,
) -> tuple[np.ndarray, float]:
    """Generate complex baseband IQ samples and nominal peak incident power (dBm)."""
    rng = np.random.default_rng(42)
    t = np.arange(num_samples, dtype=np.float64) / (sample_rate_mhz * 1e6)
    noise_sigma = 10.0 ** (-snr_db / 20.0)
    noise = (rng.normal(0, noise_sigma, num_samples) + 1j * rng.normal(0, noise_sigma, num_samples)) / math.sqrt(2.0)

    if waveform_type == "lpi_fhss":
        # 8-hop LPI frequency-hopping spread spectrum across -50..+50 MHz baseband
        hop_freqs = np.array([-42e6, -18e6, 26e6, -31e6, 44e6, 11e6, -8e6, 35e6])
        hop_len = num_samples // len(hop_freqs)
        sig = np.zeros(num_samples, dtype=np.complex128)
        for i, f_hop in enumerate(hop_freqs):
            s = i * hop_len
            e = (i + 1) * hop_len if i < len(hop_freqs) - 1 else num_samples
            sig[s:e] = 0.85 * np.exp(1j * 2.0 * np.pi * f_hop * t[s:e])
        peak_dbm = -8.0
    elif waveform_type == "lfm_chirp":
        # Wideband Linear FM chirp (-48 MHz to +48 MHz)
        bw = 96e6
        dur = t[-1] if t[-1] > 0 else 1e-6
        k = bw / dur
        phase = 2.0 * np.pi * (-bw * 0.5 * t + 0.5 * k * (t ** 2))
        sig = 1.0 * np.exp(1j * phase)
        peak_dbm = 2.0
    elif waveform_type == "drfm_repeater":
        # True target tone + 4 coherent DRFM ghost comb tones
        freqs = [14e6, -28e6, -12e6, 29e6, 41e6]
        amps = [0.55, 0.9, 0.85, 0.92, 0.88]
        sig = np.zeros(num_samples, dtype=np.complex128)
        for f, a in zip(freqs, amps):
            sig += a * np.exp(1j * 2.0 * np.pi * f * t)
        peak_dbm = 8.0
    else:
        # hpm_emp_burst: intense +28 dBm HPM pulse in middle frames
        sig = 0.25 * np.exp(1j * 2.0 * np.pi * 18e6 * t)
        burst_start = int(num_samples * 0.25)
        burst_end = int(num_samples * 0.72)
        sig[burst_start:burst_end] += 4.5 * np.exp(1j * 2.0 * np.pi * (-14e6) * t[burst_start:burst_end])
        peak_dbm = 28.0

    return (sig + noise).astype(np.complex64), peak_dbm


def decode_iq_bytes(raw_bytes: bytes, iq_format: Literal["complex64", "int16"] = "complex64") -> np.ndarray:
    """Decode raw .iq / .sigmf-data bytes into complex64 samples."""
    if iq_format == "int16":
        arr = np.frombuffer(raw_bytes, dtype=np.int16)
        usable = (len(arr) // 2) * 2
        if usable < 256:
            raise ValueError("IQ file too short for int16 complex pairs.")
        pairs = arr[:usable].reshape(-1, 2).astype(np.float32) / 32768.0
        return (pairs[:, 0] + 1j * pairs[:, 1]).astype(np.complex64)

    arr = np.frombuffer(raw_bytes, dtype=np.complex64)
    if len(arr) < 128:
        raise ValueError("IQ file too short for complex64 samples.")
    return arr


def analyze_iq_samples(
    samples: np.ndarray,
    sample_rate_mhz: float = 120.0,
    n_principal: int = 58,
    species: str = "Rb85",
    nominal_peak_dbm: float = 0.0,
    fft_size: int = 128,
    max_frames: int = 36,
) -> dict[str, Any]:
    """
    Compute chunked PSD spectrogram frames and compare Classical LNA vs. Rydberg demodulation.
    """
    # Limit samples for fast interactive response
    max_samples = fft_size * max_frames
    if len(samples) > max_samples:
        samples = samples[:max_samples]

    num_frames = max(1, len(samples) // fft_size)
    usable = samples[: num_frames * fft_size].reshape(num_frames, fft_size)

    # Instantaneous envelope |x(t)| scaled to physical E-field (V/m)
    env = np.abs(usable)
    max_env = float(np.max(env)) or 1e-6
    power_watts_peak = 10.0 ** ((nominal_peak_dbm - 30.0) / 10.0)
    peak_e_field_vm = math.sqrt(power_watts_peak * 377.0) * 0.45
    e_field_frames = (env / max_env) * peak_e_field_vm

    # Rydberg instantaneous Autler-Townes splitting Δf_AT(t) = μ |E(t)| / h
    species_scale = 1.14 if species == "Cs133" else 1.0
    dipole_cm = (n_principal ** 2) * species_scale * ELEMENTARY_CHARGE * BOHR_RADIUS
    at_splitting_frames = ((dipole_cm * e_field_frames) / PLANCK_H) / 1e6  # MHz

    # Classical GaAs LNA non-linear saturation & ADC clipping above +15 dBm
    lna_saturated = nominal_peak_dbm >= 15.0
    drive_gain = 10.0 ** (max(0.0, nominal_peak_dbm - 10.0) / 20.0)
    scaled_iq = usable * drive_gain
    # Soft-clipping + hard ADC rail at amplitude 1.2
    classical_iq = np.tanh(np.real(scaled_iq)) + 1j * np.tanh(np.imag(scaled_iq))
    clipped_mask = np.abs(scaled_iq) > 1.15
    clipped_ratio = float(np.mean(clipped_mask))

    # Windowed FFT PSD for both channels
    win = np.hanning(fft_size).astype(np.float32)

    def _compute_psd_frames(iq_mat: np.ndarray, add_imd_floor: bool = False) -> list[list[float]]:
        spec = np.fft.fftshift(np.fft.fft(iq_mat * win, axis=1), axes=1)
        mag = np.abs(spec) + 1e-6
        db = 20.0 * np.log10(mag)
        if add_imd_floor and lna_saturated:
            # Simulate broadband saturation noise-floor blanking on saturated frames
            frame_peaks = np.max(np.abs(iq_mat), axis=1, keepdims=True)
            sat_rows = (frame_peaks > 0.85).astype(np.float32)
            db = db + sat_rows * 18.0
        lo = float(np.percentile(db, 10))
        hi = float(np.max(db))
        span = max(6.0, hi - lo)
        norm = np.clip((db - lo) / span, 0.0, 1.0)
        return [[round(float(v), 3) for v in row] for row in norm]

    rydberg_frames = _compute_psd_frames(usable, add_imd_floor=False)
    classical_frames = _compute_psd_frames(classical_iq, add_imd_floor=True)

    rydberg_at_trace = [round(float(np.mean(row)), 2) for row in at_splitting_frames]

    return {
        "sample_rate_mhz": sample_rate_mhz,
        "fft_size": fft_size,
        "num_frames": num_frames,
        "nominal_peak_dbm": round(nominal_peak_dbm, 2),
        "peak_e_field_vm": round(peak_e_field_vm, 4),
        "peak_at_splitting_mhz": round(float(np.max(at_splitting_frames)), 2),
        "lna_saturated": lna_saturated,
        "classical_clipped_percent": round(clipped_ratio * 100.0, 1),
        "rydberg_at_trace_mhz": rydberg_at_trace,
        "rydberg_frames": rydberg_frames,
        "classical_frames": classical_frames,
    }
