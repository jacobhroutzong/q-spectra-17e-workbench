import React, { useEffect, useRef, useState } from 'react';
import { Zap, Activity, Upload, Waves, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { fetchRydbergMasterEq } from '../services/llmBridge';
import { prepareHiDpiCanvas } from '../utils/canvasHiDpi';
import {
  analyzeIqClient,
  decodeIqArrayBuffer,
  generateSyntheticIqClient
} from '../physics/sdrEngine';

function powerToRgb(norm, isBurnedOut = false) {
  const v = Math.max(0, Math.min(1, norm));
  if (isBurnedOut) {
    const r = Math.floor(175 + v * 80);
    const g = Math.floor(24 + v * 72);
    const b = Math.floor(38 + v * 60);
    return [r, g, b];
  }
  if (v < 0.25) {
    const t = v / 0.25;
    return [9, Math.floor(9 + t * 22), Math.floor(14 + t * 48)];
  }
  if (v < 0.55) {
    const t = (v - 0.25) / 0.3;
    return [8, Math.floor(31 + t * 145), Math.floor(62 + t * 175)];
  }
  if (v < 0.82) {
    const t = (v - 0.55) / 0.27;
    return [Math.floor(8 + t * 235), Math.floor(176 + t * 20), Math.floor(237 - t * 120)];
  }
  const t = (v - 0.82) / 0.18;
  return [250, Math.floor(196 + t * 54), Math.floor(117 + t * 133)];
}

export default function RydbergLab({
  species,
  setSpecies,
  vaporRegime,
  setVaporRegime,
  nPrincipal,
  setNPrincipal,
  rfPowerDbm,
  setRfPowerDbm,
  rfFreqGhz,
  setRfFreqGhz,
  hpmPulseActive,
  setHpmPulseActive,
  effectivePowerDbm,
  rydbergStats,
  backendUrl
}) {
  const spectrumCanvasRef = useRef(null);
  const waterfallCanvasRef = useRef(null);

  const [useMasterEq, setUseMasterEq] = useState(false);
  const [masterEqData, setMasterEqData] = useState(null);
  const [solverStatus, setSolverStatus] = useState('Analytical');
  const [hoverXRatio, setHoverXRatio] = useState(null);

  const [showSdrDrawer, setShowSdrDrawer] = useState(false);
  const [iqFormat, setIqFormat] = useState('complex64');
  const [sdrResult, setSdrResult] = useState(null);
  const [sdrLoading, setSdrLoading] = useState(false);
  const [isDraggingIq, setIsDraggingIq] = useState(false);
  const sdrPlaybackRef = useRef({ active: false, frameIdx: 0, result: null });
  const fileInputRef = useRef(null);

  useEffect(() => {
    sdrPlaybackRef.current = {
      active: Boolean(sdrResult?.rydberg_frames?.length),
      frameIdx: 0,
      result: sdrResult
    };
  }, [sdrResult]);

  const runSdrIngest = async ({ file = null, waveformType = 'lpi_fhss' }) => {
    setSdrLoading(true);
    try {
      const form = new FormData();
      if (file) form.append('file', file);
      form.append('waveform_type', waveformType);
      form.append('iq_format', iqFormat);
      form.append('n_principal', String(nPrincipal));
      form.append('species', species);
      form.append('nominal_peak_dbm', String(effectivePowerDbm));

      const base = backendUrl ? backendUrl.replace(/\/$/, '') : '';
      const res = await fetch(`${base}/api/sdr/analyze-iq`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSdrResult(data);
    } catch {
      // Seamless zero-latency fallback to pure JS Radix-2 FFT DSP engine
      if (file) {
        const buf = await file.arrayBuffer();
        const { re, im } = decodeIqArrayBuffer(buf, iqFormat);
        setSdrResult(
          analyzeIqClient({
            re,
            im,
            nPrincipal,
            species,
            nominalPeakDbm: effectivePowerDbm,
            source: `${file.name} (client DSP)`
          })
        );
      } else {
        const { re, im, nominalPeakDbm } = generateSyntheticIqClient(waveformType, 15.0, 120.0);
        setSdrResult(
          analyzeIqClient({
            re,
            im,
            nPrincipal,
            species,
            nominalPeakDbm,
            source: `synthetic:${waveformType} (client DSP)`
          })
        );
      }
    } finally {
      setSdrLoading(false);
    }
  };

  const simStateRef = useRef({
    rfFreqGhz,
    effectivePowerDbm,
    lnaBurnout: rydbergStats.lnaBurnout,
    nPrincipal
  });
  useEffect(() => {
    simStateRef.current = {
      rfFreqGhz,
      effectivePowerDbm,
      lnaBurnout: rydbergStats.lnaBurnout,
      nPrincipal
    };
  }, [rfFreqGhz, effectivePowerDbm, rydbergStats.lnaBurnout, nPrincipal]);

  // Debounced 120ms live 4-level Master Equation fetch
  useEffect(() => {
    if (!useMasterEq) {
      setMasterEqData(null);
      setSolverStatus('Analytical');
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setSolverStatus('Solving...');
      fetchRydbergMasterEq(backendUrl, {
        n_principal: nPrincipal,
        rf_power_dbm: effectivePowerDbm,
        species,
        regime: vaporRegime
      })
        .then((data) => {
          if (!cancelled) {
            setMasterEqData(data);
            setSolverStatus(data.solver === 'qutip' ? 'QuTiP Lindblad' : 'NumPy 4-Level');
          }
        })
        .catch(() => {
          if (!cancelled) {
            setMasterEqData(null);
            setSolverStatus('Analytical (Offline)');
          }
        });
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [useMasterEq, nPrincipal, effectivePowerDbm, species, vaporRegime, backendUrl]);

  // 1. HiDPI Autler-Townes Spectrum Canvas + Interactive Crosshair & Peak Caliper
  useEffect(() => {
    const hi = prepareHiDpiCanvas(spectrumCanvasRef.current, 640, 180);
    if (!hi) return;
    const { ctx, width: w, height: h } = hi;

    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, w, h);

    // Hairline grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 36) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const spanMhz = 300; // -150 to +150 MHz
    const center = w / 2;
    const pxPerMhz = w / spanMhz;
    const splittingMhz = masterEqData
      ? Number(masterEqData.splitting_mhz)
      : parseFloat(rydbergStats.splittingMHz);
    const gammaMhz = rydbergStats.linewidthMhz || (vaporRegime === 'mot_100uk' ? 0.6 : 6.2);
    const gammaPx = Math.max(3.5, gammaMhz * pxPerMhz * 2.2);
    const splitPx = Math.min(w * 0.72, splittingMhz * pxPerMhz);

    const evalTransmissionAtX = (x) => {
      if (masterEqData?.absorption?.length) {
        const pts = masterEqData.absorption;
        const idx = Math.min(pts.length - 1, Math.max(0, Math.round((x / w) * (pts.length - 1))));
        return pts[idx];
      }
      const d1 = x - (center - splitPx / 2);
      const d2 = x - (center + splitPx / 2);
      const l1 = (gammaPx * gammaPx) / (d1 * d1 + gammaPx * gammaPx);
      const l2 = (gammaPx * gammaPx) / (d2 * d2 + gammaPx * gammaPx);
      return Math.min(1, l1 + l2);
    };

    ctx.save();
    ctx.shadowColor = 'rgba(56, 189, 248, 0.45)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;

    for (let x = 0; x <= w; x++) {
      const val = evalTransmissionAtX(x);
      const y = h - 26 - val * (h * 0.62);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // Dressed-state |-> and |+> Peak Caliper Bar
    const leftPeakX = center - splitPx / 2;
    const rightPeakX = center + splitPx / 2;
    const caliperY = 30;

    ctx.strokeStyle = 'rgba(250, 250, 250, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(leftPeakX, caliperY);
    ctx.lineTo(rightPeakX, caliperY);
    ctx.moveTo(leftPeakX, caliperY - 4);
    ctx.lineTo(leftPeakX, caliperY + 4);
    ctx.moveTo(rightPeakX, caliperY - 4);
    ctx.lineTo(rightPeakX, caliperY + 4);
    ctx.stroke();

    // Vertical dashed guides to peaks
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(leftPeakX, caliperY + 4);
    ctx.lineTo(leftPeakX, h - 26);
    ctx.moveTo(rightPeakX, caliperY + 4);
    ctx.lineTo(rightPeakX, h - 26);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#fafafa';
    ctx.font = '11px monospace';
    ctx.fillText(
      `Δf_AT = ${splittingMhz.toFixed(2)} MHz  |  E_RF = ${rydbergStats.eFieldVm} V/m`,
      center - 115,
      18
    );

    // Interactive Crosshair on Hover
    if (hoverXRatio !== null) {
      const hx = Math.max(0, Math.min(w, hoverXRatio * w));
      const detuningMhz = (hoverXRatio - 0.5) * spanMhz;
      const transVal = evalTransmissionAtX(hx);
      const hy = h - 26 - transVal * (h * 0.62);

      ctx.strokeStyle = 'rgba(250, 250, 250, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, 0);
      ctx.lineTo(hx, h - 20);
      ctx.stroke();

      ctx.fillStyle = '#34d399';
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fill();

      const label = `Δν: ${detuningMhz >= 0 ? '+' : ''}${detuningMhz.toFixed(1)} MHz • T: ${(
        transVal * 100
      ).toFixed(1)}%`;
      const lx = Math.min(w - 175, Math.max(8, hx + 8));
      ctx.fillStyle = 'rgba(9, 9, 11, 0.88)';
      ctx.fillRect(lx - 4, hy - 22, 172, 17);
      ctx.fillStyle = '#34d399';
      ctx.font = '10px monospace';
      ctx.fillText(label, lx, hy - 10);
    }

    ctx.fillStyle = '#71717a';
    ctx.font = '10px monospace';
    ctx.fillText('-150 MHz', 10, h - 8);
    ctx.fillText('0 MHz', center - 16, h - 8);
    ctx.fillText('+150 MHz', w - 58, h - 8);
  }, [rydbergStats, masterEqData, vaporRegime, hoverXRatio]);

  // 2. HiDPI 60fps Waterfall Spectrogram (DC to 120 GHz) via 1x Offscreen Blit
  useEffect(() => {
    const canvas = waterfallCanvasRef.current;
    if (!canvas) return;
    const w = 640;
    const h = 220;

    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const octx = offscreen.getContext('2d');

    const topLabelH = 20;
    const midGapH = 22;
    const paneH = Math.floor((h - topLabelH - midGapH) / 2);
    const lnaY = topLabelH;
    const rydY = topLabelH + paneH + midGapH;

    const lnaRowImg = octx.createImageData(w, 1);
    const rydRowImg = octx.createImageData(w, 1);

    const hoppers = [
      { freq: 18.5, bw: 2.2, min: 8, max: 42 },
      { freq: 62.0, bw: 3.0, min: 45, max: 88 },
      { freq: 94.5, bw: 2.5, min: 80, max: 116 }
    ];

    let rafId = 0;
    let lastHopTime = performance.now();

    octx.fillStyle = '#09090b';
    octx.fillRect(0, 0, w, h);

    // Header bars on offscreen buffer
    octx.fillStyle = '#a1a1aa';
    octx.font = '10px monospace';
    octx.fillText('CLASSICAL GaAs LNA // DC–120 GHz', 8, 14);
    [0, 30, 60, 90, 120].forEach((ghz) => {
      const tx = Math.min(w - 30, Math.max(4, (ghz / 120) * w - 10));
      octx.fillStyle = '#52525b';
      octx.fillText(`${ghz}G`, tx, 14);
    });

    octx.fillStyle = '#09090b';
    octx.fillRect(0, lnaY + paneH, w, midGapH);
    octx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    octx.beginPath();
    octx.moveTo(0, lnaY + paneH);
    octx.lineTo(w, lnaY + paneH);
    octx.stroke();

    octx.fillStyle = '#38bdf8';
    octx.font = '10px monospace';
    octx.fillText('RYDBERG OPTICAL READOUT // DC–120 GHz', 8, lnaY + paneH + 15);

    const tick = (now) => {
      const { rfFreqGhz: tunedGhz, effectivePowerDbm: pwrDbm, lnaBurnout, nPrincipal: nVal } =
        simStateRef.current;

      if (now - lastHopTime > 240) {
        lastHopTime = now;
        hoppers.forEach((hp) => {
          hp.freq = hp.min + Math.random() * (hp.max - hp.min);
        });
      }

      octx.drawImage(offscreen, 0, lnaY, w, paneH - 2, 0, lnaY + 2, w, paneH - 2);
      octx.drawImage(offscreen, 0, rydY, w, paneH - 2, 0, rydY + 2, w, paneH - 2);

      const sigStrength = Math.max(0.25, Math.min(1.0, (pwrDbm + 70) / 85));
      const sensitivityBoost = 0.75 + (nVal - 30) / 160;
      const sdrPlay = sdrPlaybackRef.current;

      if (sdrPlay.active && sdrPlay.result) {
        const rFrames = sdrPlay.result.rydberg_frames;
        const cFrames = sdrPlay.result.classical_frames;
        const fIdx = sdrPlay.frameIdx % rFrames.length;
        sdrPlay.frameIdx = (fIdx + 1) % rFrames.length;
        const rBins = rFrames[fIdx];
        const cBins = cFrames[fIdx];
        const numBins = rBins.length;
        const sdrSat = Boolean(sdrPlay.result.lna_saturated) || lnaBurnout;

        for (let x = 0; x < w; x++) {
          const bin = Math.min(numBins - 1, Math.floor((x / w) * numBins));
          const [lr, lg, lb] = powerToRgb(cBins[bin], sdrSat);
          const idx = x * 4;
          lnaRowImg.data[idx] = lr;
          lnaRowImg.data[idx + 1] = lg;
          lnaRowImg.data[idx + 2] = lb;
          lnaRowImg.data[idx + 3] = 255;

          const [rr, rg, rb] = powerToRgb(Math.min(1, rBins[bin] * sensitivityBoost), false);
          rydRowImg.data[idx] = rr;
          rydRowImg.data[idx + 1] = rg;
          rydRowImg.data[idx + 2] = rb;
          rydRowImg.data[idx + 3] = 255;
        }
      } else {
        for (let x = 0; x < w; x++) {
          const freqGhz = (x / w) * 120.0;
          let signal = Math.random() * 0.14;

          const dTuned = Math.abs(freqGhz - tunedGhz);
          if (dTuned < 3.5) {
            signal += sigStrength * Math.exp(-(dTuned * dTuned) / 1.4);
          }

          for (let k = 0; k < hoppers.length; k++) {
            const dHop = Math.abs(freqGhz - hoppers[k].freq);
            if (dHop < 3.0) {
              signal += 0.65 * Math.exp(-(dHop * dHop) / (hoppers[k].bw * 0.45));
            }
          }

          const lnaNorm = lnaBurnout ? 0.45 + Math.random() * 0.55 : Math.min(1, signal);
          const [lr, lg, lb] = powerToRgb(lnaNorm, lnaBurnout);
          const idx = x * 4;
          lnaRowImg.data[idx] = lr;
          lnaRowImg.data[idx + 1] = lg;
          lnaRowImg.data[idx + 2] = lb;
          lnaRowImg.data[idx + 3] = 255;

          const rydNorm = Math.min(1, signal * sensitivityBoost);
          const [rr, rg, rb] = powerToRgb(rydNorm, false);
          rydRowImg.data[idx] = rr;
          rydRowImg.data[idx + 1] = rg;
          rydRowImg.data[idx + 2] = rb;
          rydRowImg.data[idx + 3] = 255;
        }
      }

      octx.putImageData(lnaRowImg, 0, lnaY);
      octx.putImageData(lnaRowImg, 0, lnaY + 1);
      octx.putImageData(rydRowImg, 0, rydY);
      octx.putImageData(rydRowImg, 0, rydY + 1);

      const markerX = Math.round((tunedGhz / 120.0) * w);
      octx.fillStyle = 'rgba(250, 250, 250, 0.8)';
      octx.fillRect(markerX - 1, lnaY, 2, 4);
      octx.fillRect(markerX - 1, rydY, 2, 4);

      if (lnaBurnout) {
        octx.fillStyle = 'rgba(24, 24, 27, 0.85)';
        octx.fillRect(w / 2 - 140, lnaY + paneH / 2 - 12, 280, 22);
        octx.fillStyle = '#fda4af';
        octx.font = '10px monospace';
        octx.fillText('LNA SATURATED // NOISE-FLOOR BLANKING', w / 2 - 122, lnaY + paneH / 2 + 3);
      }

      const hi = prepareHiDpiCanvas(canvas, w, h);
      if (hi) {
        hi.ctx.drawImage(offscreen, 0, 0, w, h);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Control Rail */}
      <div className="lg:col-span-4 bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
            Vapor Cell Controls
          </h2>
          <span className="text-[11px] font-mono text-zinc-500">SI-Traceable EIT</span>
        </div>

        {/* Species Segmented Pill */}
        <div className="space-y-2">
          <label className="block text-[11px] uppercase tracking-wider text-zinc-500">
            Alkali Species
          </label>
          <div className="grid grid-cols-2 bg-zinc-950/70 p-1 rounded-xl border border-white/[0.06]">
            {[
              { id: 'Rb85', label: '85-Rb' },
              { id: 'Cs133', label: '133-Cs' }
            ].map((sp) => (
              <button
                key={sp.id}
                onClick={() => setSpecies(sp.id)}
                className={`py-1.5 rounded-lg text-xs font-mono transition ${
                  species === sp.id ? 'bg-zinc-100 text-zinc-950 font-medium' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {sp.label}
              </button>
            ))}
          </div>
        </div>

        {/* Vapor Cell Regime Toggle */}
        <div className="space-y-2">
          <label className="block text-[11px] uppercase tracking-wider text-zinc-500">
            Vapor Cell Regime
          </label>
          <div className="grid grid-cols-2 bg-zinc-950/70 p-1 rounded-xl border border-white/[0.06]">
            {[
              { id: 'thermal_300k', label: '300K (6.2 MHz)' },
              { id: 'mot_100uk', label: 'MOT (0.6 MHz)' }
            ].map((rg) => (
              <button
                key={rg.id}
                onClick={() => setVaporRegime(rg.id)}
                className={`py-1.5 rounded-lg text-[11px] font-mono transition ${
                  vaporRegime === rg.id
                    ? 'bg-zinc-100 text-zinc-950 font-medium'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {rg.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sliders */}
        <div className="space-y-5">
          <div>
            <div className="flex justify-between text-xs mb-2">
              <span className="text-zinc-400">Principal Quantum (n)</span>
              <span className="font-mono tabular-nums text-zinc-100">{nPrincipal}</span>
            </div>
            <input
              type="range"
              min="30"
              max="90"
              value={nPrincipal}
              onChange={(e) => setNPrincipal(Number(e.target.value))}
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-2">
              <span className="text-zinc-400">Incident RF Power</span>
              <span className="font-mono tabular-nums text-zinc-100">{effectivePowerDbm} dBm</span>
            </div>
            <input
              type="range"
              min="-70"
              max="30"
              value={rfPowerDbm}
              onChange={(e) => setRfPowerDbm(Number(e.target.value))}
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-2">
              <span className="text-zinc-400">Carrier Frequency</span>
              <span className="font-mono tabular-nums text-zinc-100">{rfFreqGhz.toFixed(1)} GHz</span>
            </div>
            <input
              type="range"
              min="1"
              max="120"
              step="0.5"
              value={rfFreqGhz}
              onChange={(e) => setRfFreqGhz(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Threat Toggle */}
        <button
          onClick={() => setHpmPulseActive(!hpmPulseActive)}
          className={`w-full py-2.5 px-4 rounded-xl text-xs font-medium flex items-center justify-center gap-2 border transition ${
            hpmPulseActive
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-transparent border-white/10 text-zinc-300 hover:border-white/20'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          {hpmPulseActive ? 'HPM Pulse Active (+28 dBm)' : 'Inject +28 dBm HPM Pulse'}
        </button>

        {/* Backend Master Eq Toggle */}
        <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between">
          <button
            onClick={() => setUseMasterEq(!useMasterEq)}
            className="text-xs font-mono text-zinc-400 hover:text-zinc-200 flex items-center gap-2 transition"
          >
            <Activity className={`w-3.5 h-3.5 ${useMasterEq ? 'text-emerald-400' : 'text-zinc-500'}`} />
            <span>4-Level Solver: {solverStatus}</span>
          </button>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
              useMasterEq
                ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10'
                : 'border-white/10 text-zinc-500'
            }`}
          >
            {useMasterEq ? 'ON' : 'OFF'}
          </span>
        </div>
      </div>

      {/* Right Main Display */}
      <div className="lg:col-span-8 space-y-6">
        {/* Typographic KPI Strip */}
        <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 grid grid-cols-2 sm:grid-cols-4 gap-6 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]">
          <div className="pt-2 sm:pt-0">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">AT Splitting</div>
            <div className="font-mono tabular-nums text-2xl font-light text-zinc-100 mt-1">
              {masterEqData ? masterEqData.splitting_mhz : rydbergStats.splittingMHz}
              <span className="text-xs text-zinc-500 ml-1">MHz</span>
            </div>
          </div>
          <div className="pt-2 sm:pt-0 sm:pl-6">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">E-Field</div>
            <div className="font-mono tabular-nums text-2xl font-light text-zinc-100 mt-1">
              {rydbergStats.eFieldVm}
              <span className="text-xs text-zinc-500 ml-1">V/m</span>
            </div>
          </div>
          <div className="pt-2 sm:pt-0 sm:pl-6">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Doublet State</div>
            <div
              className={`font-mono text-sm font-medium mt-2 ${
                rydbergStats.doubletResolved ? 'text-emerald-400' : 'text-amber-300'
              }`}
            >
              {rydbergStats.doubletResolved ? 'Resolved' : 'Doppler Blended'}
            </div>
          </div>
          <div className="pt-2 sm:pt-0 sm:pl-6">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Classical LNA</div>
            <div
              className={`font-mono text-sm font-medium mt-2 ${
                rydbergStats.lnaBurnout ? 'text-rose-400' : 'text-zinc-300'
              }`}
            >
              {rydbergStats.lnaBurnout ? 'BURNOUT' : 'Nominal'}
            </div>
          </div>
        </div>

        {/* Canvases Card */}
        <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Autler-Townes Optical Readout (Hover for Caliper)</span>
              <span className="font-mono text-[11px] text-zinc-500">
                μ = {rydbergStats.dipoleMomentDebye} D • Γ = {rydbergStats.linewidthMhz} MHz
              </span>
            </div>
            <canvas
              ref={spectrumCanvasRef}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setHoverXRatio((e.clientX - rect.left) / rect.width);
              }}
              onMouseLeave={() => setHoverXRatio(null)}
              className="w-full h-44 bg-[#09090b] rounded-xl border border-white/[0.06] cursor-crosshair"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>60fps Wideband Waterfall (DC–120 GHz)</span>
              <span className="font-mono text-[11px] text-zinc-500">
                Carrier @ {rfFreqGhz.toFixed(1)} GHz
              </span>
            </div>
            <canvas
              ref={waterfallCanvasRef}
              className="w-full h-52 bg-[#09090b] rounded-xl border border-white/[0.06]"
            />
          </div>

          {/* Collapsible SDR IQ / SigMF Drawer */}
          <div className="border-t border-white/[0.06] pt-4">
            <button
              onClick={() => setShowSdrDrawer(!showSdrDrawer)}
              className="w-full flex items-center justify-between text-xs font-mono text-zinc-400 hover:text-zinc-200 transition"
            >
              <span className="flex items-center gap-2">
                <Waves className="w-3.5 h-3.5 text-sky-400" />
                SDR IQ / SigMF Ingest &amp; Waveform Injector
              </span>
              {showSdrDrawer ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>

            {showSdrDrawer && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {[
                      { id: 'lpi_fhss', label: 'LPI FHSS' },
                      { id: 'lfm_chirp', label: 'LFM Chirp' },
                      { id: 'drfm_repeater', label: 'DRFM Comb' },
                      { id: 'hpm_emp_burst', label: 'HPM Burst' }
                    ].map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => runSdrIngest({ waveformType: preset.id })}
                        className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-white/10 hover:border-white/25 text-[11px] font-mono text-zinc-300 transition"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={iqFormat}
                      onChange={(e) => setIqFormat(e.target.value)}
                      className="bg-zinc-950 border border-white/10 rounded-lg px-2 py-1 text-[11px] font-mono text-zinc-300"
                    >
                      <option value="complex64">complex64</option>
                      <option value="int16">int16</option>
                    </select>
                    {sdrResult && (
                      <button
                        onClick={() => setSdrResult(null)}
                        className="px-2 py-1 rounded-lg border border-white/10 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                      >
                        <XCircle className="w-3 h-3" /> Clear
                      </button>
                    )}
                  </div>
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingIq(true);
                  }}
                  onDragLeave={() => setIsDraggingIq(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingIq(false);
                    const dropped = e.dataTransfer.files?.[0];
                    if (dropped) runSdrIngest({ file: dropped });
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border border-dashed rounded-xl p-3 text-center cursor-pointer transition font-mono text-[11px] flex items-center justify-center gap-2 ${
                    isDraggingIq
                      ? 'border-sky-400 bg-sky-500/10 text-sky-200'
                      : 'border-white/10 bg-zinc-950/50 text-zinc-400 hover:border-white/25'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5 text-zinc-300" />
                  <span>{sdrLoading ? 'Computing FFT...' : 'Drop .iq / .sigmf-data or click to browse'}</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".iq,.sigmf-data,.bin,.raw"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) runSdrIngest({ file: f });
                    }}
                  />
                </div>

                {sdrResult && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] font-mono text-zinc-400 pt-1">
                    <div>
                      Source: <span className="text-zinc-200">{sdrResult.source}</span>
                    </div>
                    <div>
                      Peak |E(t)|: <span className="text-zinc-200">{sdrResult.peak_e_field_vm} V/m</span>
                    </div>
                    <div>
                      Δf_AT(t): <span className="text-sky-300">{sdrResult.peak_at_splitting_mhz} MHz</span>
                    </div>
                    <div>
                      LNA Clip:{' '}
                      <span className={sdrResult.lna_saturated ? 'text-rose-400' : 'text-zinc-200'}>
                        {sdrResult.classical_clipped_percent}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
