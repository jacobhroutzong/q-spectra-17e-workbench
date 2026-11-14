import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Radio } from 'lucide-react';
import { prepareHiDpiCanvas } from '../utils/canvasHiDpi';

const TRUE_TARGET = {
  id: 'true-1',
  label: 'TGT-01 (LOW-RCS STEALTH)',
  rangeKm: 86.4,
  dopplerMs: 185,
  isTrue: true
};

const DRFM_GHOSTS = [
  { id: 'ghost-1', label: 'DRFM-GHOST-A', rangeKm: 42.0, dopplerMs: 240, isTrue: false },
  { id: 'ghost-2', label: 'DRFM-GHOST-B', rangeKm: 64.5, dopplerMs: -140, isTrue: false },
  { id: 'ghost-3', label: 'DRFM-GHOST-C', rangeKm: 108.0, dopplerMs: 95, isTrue: false },
  { id: 'ghost-4', label: 'DRFM-GHOST-D', rangeKm: 124.5, dopplerMs: -255, isTrue: false }
];

// Complementary error function & Q-function for ROC curves
function erfcApprox(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const ans =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
    );
  return x >= 0 ? ans : 2.0 - ans;
}

function qFunc(x) {
  return 0.5 * erfcApprox(x / Math.SQRT2);
}

// Acklam inverse normal CDF for Phi^-1(1 - P_FA)
function normInv(p) {
  const clamped = Math.max(1e-12, Math.min(1 - 1e-12, p));
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (clamped < pLow) {
    const q = Math.sqrt(-2 * Math.log(clamped));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (clamped <= pHigh) {
    const q = clamped - 0.5;
    const r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - clamped));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

export default function QuantumRadarLab({
  nsPhotons,
  setNsPhotons,
  nbThermal,
  setNbThermal,
  kappaReflectivity,
  setKappaReflectivity,
  mModesExp,
  setMModesExp,
  drfmSpoofActive,
  setDrfmSpoofActive,
  quantumIdlerCorrelation,
  setQuantumIdlerCorrelation,
  radarStats
}) {
  const scopeCanvasRef = useRef(null);
  const rocCanvasRef = useRef(null);
  const [viewMode, setViewMode] = useState('scope'); // 'scope' | 'roc'
  const [selectedTarget, setSelectedTarget] = useState(TRUE_TARGET);
  const [hoverPfaRatio, setHoverPfaRatio] = useState(null);

  const stateRef = useRef({
    nsPhotons,
    nbThermal,
    kappaReflectivity,
    drfmSpoofActive,
    quantumIdlerCorrelation,
    selectedId: selectedTarget?.id
  });

  useEffect(() => {
    stateRef.current = {
      nsPhotons,
      nbThermal,
      kappaReflectivity,
      drfmSpoofActive,
      quantumIdlerCorrelation,
      selectedId: selectedTarget?.id
    };
  }, [
    nsPhotons,
    nbThermal,
    kappaReflectivity,
    drfmSpoofActive,
    quantumIdlerCorrelation,
    selectedTarget
  ]);

  const toCanvasCoords = (rangeKm, dopplerMs, w, h) => {
    const padX = 46;
    const padY = 24;
    const x = padX + (rangeKm / 150) * (w - padX - 20);
    const y = padY + ((400 - dopplerMs) / 800) * (h - padY - 28);
    return { x, y };
  };

  // View A: HiDPI Range-Doppler Scope
  useEffect(() => {
    if (viewMode !== 'scope') return;
    const canvas = scopeCanvasRef.current;
    if (!canvas) return;

    let rafId = 0;

    const render = (now) => {
      const hi = prepareHiDpiCanvas(canvas, 640, 270);
      if (!hi) return;
      const { ctx, width: w, height: h } = hi;

      const {
        nbThermal: nb,
        drfmSpoofActive: drfm,
        quantumIdlerCorrelation: idlerOn,
        selectedId
      } = stateRef.current;

      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, w, h);

      const padX = 46;
      const padY = 24;
      const plotW = w - padX - 20;
      const plotH = h - padY - 28;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      for (let r = 0; r <= 150; r += 30) {
        const x = padX + (r / 150) * plotW;
        ctx.beginPath();
        ctx.moveTo(x, padY);
        ctx.lineTo(x, padY + plotH);
        ctx.stroke();
        ctx.fillStyle = '#52525b';
        ctx.font = '10px monospace';
        ctx.fillText(`${r}km`, x - 12, h - 8);
      }

      for (let d = -400; d <= 400; d += 200) {
        const y = padY + ((400 - d) / 800) * plotH;
        ctx.beginPath();
        ctx.moveTo(padX, y);
        ctx.lineTo(padX + plotW, y);
        ctx.stroke();
        ctx.fillStyle = '#52525b';
        ctx.font = '10px monospace';
        ctx.fillText(`${d > 0 ? '+' : ''}${d}`, 6, y + 3);
      }

      const zeroY = padY + plotH / 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padX, zeroY);
      ctx.lineTo(padX + plotW, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);

      const clutterCount = idlerOn
        ? Math.min(140, Math.floor(nb / 24))
        : Math.min(820, Math.floor(nb / 3.4));
      const clutterAlpha = idlerOn ? 0.14 : Math.min(0.58, 0.18 + nb / 4500);

      for (let i = 0; i < clutterCount; i++) {
        const cx = padX + Math.random() * plotW;
        const cy = padY + Math.random() * plotH;
        ctx.fillStyle = idlerOn
          ? `rgba(56, 189, 248, ${clutterAlpha * 0.45})`
          : `rgba(250, 204, 21, ${clutterAlpha * Math.random()})`;
        ctx.fillRect(cx, cy, 1.5, 1.5);
      }

      if (drfm) {
        DRFM_GHOSTS.forEach((g) => {
          const { x, y } = toCanvasCoords(g.rangeKm, g.dopplerMs, w, h);
          const isSelected = selectedId === g.id;

          if (idlerOn) {
            ctx.strokeStyle = 'rgba(244, 63, 94, 0.35)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.arc(x, y, 9, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = 'rgba(244, 63, 94, 0.55)';
            ctx.font = '9px monospace';
            ctx.fillText(`✕ ${g.label}`, x + 12, y + 3);
          } else {
            const pulse = 1 + 0.15 * Math.sin(now / 180);
            const grad = ctx.createRadialGradient(x, y, 1, x, y, 15 * pulse);
            grad.addColorStop(0, 'rgba(251, 191, 36, 0.9)');
            grad.addColorStop(0.5, 'rgba(245, 158, 11, 0.35)');
            grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, 15 * pulse, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = isSelected ? '#fafafa' : '#fbbf24';
            ctx.lineWidth = 1.2;
            ctx.strokeRect(x - 9, y - 9, 18, 18);

            ctx.fillStyle = '#fde68a';
            ctx.font = '10px monospace';
            ctx.fillText(g.label, x + 12, y + 3);
          }
        });
      }

      {
        const { x, y } = toCanvasCoords(TRUE_TARGET.rangeKm, TRUE_TARGET.dopplerMs, w, h);
        const pulse = 1 + 0.18 * Math.sin(now / 150);

        if (idlerOn) {
          ctx.save();
          ctx.shadowColor = 'rgba(52, 211, 153, 0.65)';
          ctx.shadowBlur = 12;

          const grad = ctx.createRadialGradient(x, y, 1, x, y, 20 * pulse);
          grad.addColorStop(0, 'rgba(52, 211, 153, 1)');
          grad.addColorStop(0.45, 'rgba(56, 189, 248, 0.45)');
          grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(x, y, 20 * pulse, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#34d399';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(x, y, 12, 0, Math.PI * 2);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x - 16, y);
          ctx.lineTo(x - 7, y);
          ctx.moveTo(x + 7, y);
          ctx.lineTo(x + 16, y);
          ctx.moveTo(x, y - 16);
          ctx.lineTo(x, y - 7);
          ctx.moveTo(x, y + 7);
          ctx.lineTo(x, y + 16);
          ctx.stroke();
          ctx.restore();

          ctx.fillStyle = '#fafafa';
          ctx.font = '10px monospace';
          ctx.fillText('ENTANGLED LOCK', x + 16, y - 2);
          ctx.fillStyle = '#38bdf8';
          ctx.font = '9px monospace';
          ctx.fillText(`${TRUE_TARGET.rangeKm}km • +${TRUE_TARGET.dopplerMs}m/s`, x + 16, y + 10);
        } else {
          ctx.fillStyle = 'rgba(161, 161, 170, 0.45)';
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = 'rgba(161, 161, 170, 0.35)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x - 7, y - 7, 14, 14);

          ctx.fillStyle = '#71717a';
          ctx.font = '9px monospace';
          ctx.fillText('LOW-RCS TGT (BURIED)', x + 11, y + 3);
        }
      }

      ctx.fillStyle = idlerOn ? '#34d399' : '#fbbf24';
      ctx.font = '10px monospace';
      ctx.fillText(
        idlerOn
          ? 'SPDC IDLER CORRELATION ACTIVE // DRFM SUPPRESSED'
          : 'CLASSICAL COHERENT CFAR // DRFM & CLUTTER EXPOSED',
        padX,
        15
      );

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [viewMode]);

  // View B: HiDPI ROC Curve (PD vs PFA) & Helstrom Bound
  useEffect(() => {
    if (viewMode !== 'roc') return;
    const hi = prepareHiDpiCanvas(rocCanvasRef.current, 640, 270);
    if (!hi) return;
    const { ctx, width: w, height: h } = hi;

    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, w, h);

    const padL = 48;
    const padR = 20;
    const padT = 26;
    const padB = 30;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    // Hairline Grid (log10(P_FA) from -6 to 0)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let exp = -6; exp <= 0; exp++) {
      const x = padL + ((exp + 6) / 6) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.fillStyle = '#52525b';
      ctx.font = '10px monospace';
      ctx.fillText(exp === 0 ? '1' : `1e${exp}`, x - 12, h - 10);
    }

    for (let pd = 0; pd <= 1.0; pd += 0.25) {
      const y = padT + (1 - pd) * plotH;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.fillStyle = '#52525b';
      ctx.font = '10px monospace';
      ctx.fillText(pd.toFixed(2), 10, y + 3);
    }

    const mModes = Math.pow(10, mModesExp);
    const snrQuantum = (mModes * kappaReflectivity * nsPhotons * 4.0) / (1 + nbThermal);
    const snrClassical = (mModes * kappaReflectivity * nsPhotons) / (1 + nbThermal);
    const snrDrfm = (mModes * kappaReflectivity * nsPhotons) / (1 + nbThermal + 250);

    const evalPd = (pfa, snrLin) => {
      const zThresh = normInv(1 - pfa);
      return Math.max(0, Math.min(1, qFunc(zThresh - Math.sqrt(2 * snrLin))));
    };

    const drawRocCurve = (snrLin, color, glow = false) => {
      ctx.save();
      if (glow) {
        ctx.shadowColor = 'rgba(52, 211, 153, 0.5)';
        ctx.shadowBlur = 8;
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = glow ? 2.2 : 1.7;
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const exp = -6 + (i / 120) * 6;
        const pfa = Math.pow(10, exp);
        const pd = evalPd(pfa, snrLin);
        const x = padL + (i / 120) * plotW;
        const y = padT + (1 - pd) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    };

    drawRocCurve(snrDrfm, '#f43f5e', false);
    drawRocCurve(snrClassical, '#38bdf8', false);
    drawRocCurve(snrQuantum, '#34d399', true);

    // Legend
    ctx.font = '10px monospace';
    ctx.fillStyle = '#34d399';
    ctx.fillText('— SPDC Quantum Illumination', padL + 8, 15);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('— Classical Coherent', padL + 205, 15);
    ctx.fillStyle = '#f43f5e';
    ctx.fillText('— Classical + DRFM', padL + 355, 15);

    // Interactive Hover Readout
    if (hoverPfaRatio !== null) {
      const clampedR = Math.max(0, Math.min(1, hoverPfaRatio));
      const hx = padL + clampedR * plotW;
      const exp = -6 + clampedR * 6;
      const pfa = Math.pow(10, exp);
      const pdQ = evalPd(pfa, snrQuantum);
      const pdC = evalPd(pfa, snrClassical);
      const pdD = evalPd(pfa, snrDrfm);

      ctx.strokeStyle = 'rgba(250, 250, 250, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, padT);
      ctx.lineTo(hx, padT + plotH);
      ctx.stroke();

      [
        { pd: pdQ, color: '#34d399' },
        { pd: pdC, color: '#38bdf8' },
        { pd: pdD, color: '#f43f5e' }
      ].forEach((pt) => {
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(hx, padT + (1 - pt.pd) * plotH, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });

      const boxX = Math.min(w - 195, Math.max(padL + 6, hx + 8));
      ctx.fillStyle = 'rgba(9, 9, 11, 0.9)';
      ctx.fillRect(boxX, padT + 10, 185, 62);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.strokeRect(boxX, padT + 10, 185, 62);
      ctx.font = '10px monospace';
      ctx.fillStyle = '#fafafa';
      ctx.fillText(`P_FA = ${pfa.toExponential(1)}`, boxX + 8, padT + 25);
      ctx.fillStyle = '#34d399';
      ctx.fillText(`P_D (Quantum): ${(pdQ * 100).toFixed(1)}%`, boxX + 8, padT + 40);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`P_D (Classic): ${(pdC * 100).toFixed(1)}%`, boxX + 8, padT + 53);
      ctx.fillStyle = '#f43f5e';
      ctx.fillText(`P_D (DRFM):    ${(pdD * 100).toFixed(1)}%`, boxX + 8, padT + 66);
    }
  }, [viewMode, nsPhotons, nbThermal, kappaReflectivity, mModesExp, hoverPfaRatio]);

  const handleCanvasClick = (e) => {
    const canvas = scopeCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * 640;
    const clickY = ((e.clientY - rect.top) / rect.height) * 270;

    const candidates = drfmSpoofActive ? [TRUE_TARGET, ...DRFM_GHOSTS] : [TRUE_TARGET];
    let nearest = TRUE_TARGET;
    let bestDist = Infinity;
    candidates.forEach((t) => {
      const { x, y } = toCanvasCoords(t.rangeKm, t.dopplerMs, 640, 270);
      const dist = Math.hypot(x - clickX, y - clickY);
      if (dist < bestDist) {
        bestDist = dist;
        nearest = t;
      }
    });
    if (bestDist < 48) {
      setSelectedTarget(nearest);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Control Rail */}
      <div className="lg:col-span-4 bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
            SPDC Radar Controls
          </h2>
          <span className="text-[11px] font-mono text-zinc-500">Quantum EP</span>
        </div>

        <div className="space-y-5">
          <div>
            <div className="flex justify-between text-xs mb-2">
              <span className="text-zinc-400">Signal Brightness (Ns)</span>
              <span className="font-mono tabular-nums text-zinc-100">{nsPhotons}</span>
            </div>
            <input
              type="range"
              min="0.005"
              max="0.1"
              step="0.005"
              value={nsPhotons}
              onChange={(e) => setNsPhotons(Number(e.target.value))}
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-2">
              <span className="text-zinc-400">Thermal Noise (Nb)</span>
              <span className="font-mono tabular-nums text-zinc-100">{nbThermal}</span>
            </div>
            <input
              type="range"
              min="50"
              max="3000"
              step="50"
              value={nbThermal}
              onChange={(e) => setNbThermal(Number(e.target.value))}
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-2">
              <span className="text-zinc-400">Reflectivity (κ)</span>
              <span className="font-mono tabular-nums text-zinc-100">{kappaReflectivity.toFixed(3)}</span>
            </div>
            <input
              type="range"
              min="0.002"
              max="0.05"
              step="0.002"
              value={kappaReflectivity}
              onChange={(e) => setKappaReflectivity(Number(e.target.value))}
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-2">
              <span className="text-zinc-400">Modes (M)</span>
              <span className="font-mono tabular-nums text-zinc-100">10^{mModesExp}</span>
            </div>
            <input
              type="range"
              min="4"
              max="7"
              step="0.5"
              value={mModesExp}
              onChange={(e) => setMModesExp(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="space-y-2.5 pt-2 border-t border-white/[0.06]">
          <button
            onClick={() => setDrfmSpoofActive(!drfmSpoofActive)}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-medium flex items-center justify-center gap-2 border transition ${
              drfmSpoofActive
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-transparent border-white/10 text-zinc-300 hover:border-white/20'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            {drfmSpoofActive ? 'DRFM Jamming Active (4 Ghosts)' : 'Enable DRFM Repeater'}
          </button>

          <button
            onClick={() => setQuantumIdlerCorrelation(!quantumIdlerCorrelation)}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-medium flex items-center justify-center gap-2 border transition ${
              quantumIdlerCorrelation
                ? 'bg-zinc-100 text-zinc-950 border-zinc-100 hover:bg-white'
                : 'bg-transparent border-white/10 text-zinc-300 hover:border-white/20'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {quantumIdlerCorrelation ? 'Quantum Idler Correlation: ON' : 'Quantum Idler Correlation: OFF'}
          </button>
        </div>
      </div>

      {/* Right Main Display */}
      <div className="lg:col-span-8 space-y-6">
        {/* Typographic KPI Strip */}
        <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 grid grid-cols-1 sm:grid-cols-3 gap-6 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]">
          <div className="pt-2 sm:pt-0">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Classical SNR</div>
            <div className="font-mono tabular-nums text-2xl font-light text-zinc-300 mt-1">
              {radarStats.classicalSnrDb}
              <span className="text-xs text-zinc-500 ml-1">dB</span>
            </div>
          </div>
          <div className="pt-2 sm:pt-0 sm:pl-6">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Quantum SNR</div>
            <div className="font-mono tabular-nums text-2xl font-light text-zinc-100 mt-1">
              {radarStats.quantumSnrDb}
              <span className="text-xs text-zinc-500 ml-1">dB</span>
            </div>
          </div>
          <div className="pt-2 sm:pt-0 sm:pl-6">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">EP Advantage</div>
            <div className="font-mono tabular-nums text-2xl font-light text-emerald-400 mt-1">
              +{radarStats.advantageDb}
              <span className="text-xs text-zinc-500 ml-1">dB</span>
            </div>
          </div>
        </div>

        {/* Scope / ROC Card */}
        <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="bg-zinc-950/70 p-1 rounded-full border border-white/[0.06] flex items-center gap-0.5">
              {[
                { id: 'scope', label: 'Range-Doppler Scope' },
                { id: 'roc', label: 'ROC / Helstrom Bound' }
              ].map((v) => (
                <button
                  key={v.id}
                  onClick={() => setViewMode(v.id)}
                  className={`px-3 py-1 rounded-full text-xs transition ${
                    viewMode === v.id
                      ? 'bg-zinc-100 text-zinc-950 font-medium'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <span className="font-mono text-[11px] text-zinc-500">
              Rejection: {quantumIdlerCorrelation ? `${radarStats.drfmRejectionPercent}%` : '0.0%'}
            </span>
          </div>

          {viewMode === 'scope' ? (
            <>
              <canvas
                ref={scopeCanvasRef}
                onClick={handleCanvasClick}
                className="w-full h-64 bg-[#09090b] rounded-xl border border-white/[0.06] cursor-crosshair"
              />
              {selectedTarget && (
                <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-zinc-400">
                  <span className={selectedTarget.isTrue ? 'text-emerald-400' : 'text-amber-300'}>
                    {selectedTarget.label}
                  </span>
                  <span>
                    {selectedTarget.rangeKm} km • {selectedTarget.dopplerMs > 0 ? '+' : ''}
                    {selectedTarget.dopplerMs} m/s
                  </span>
                  <span className={selectedTarget.isTrue ? 'text-sky-300' : 'text-rose-400'}>
                    {selectedTarget.isTrue
                      ? 'Cov: 0.994 (Entangled)'
                      : quantumIdlerCorrelation
                        ? 'Cov: 0.002 (Rejected)'
                        : 'Unresolved Ghost'}
                  </span>
                </div>
              )}
            </>
          ) : (
            <canvas
              ref={rocCanvasRef}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const px = ((e.clientX - rect.left) / rect.width) * 640;
                setHoverPfaRatio((px - 48) / (640 - 48 - 20));
              }}
              onMouseLeave={() => setHoverPfaRatio(null)}
              className="w-full h-64 bg-[#09090b] rounded-xl border border-white/[0.06] cursor-crosshair"
            />
          )}
        </div>
      </div>
    </div>
  );
}
