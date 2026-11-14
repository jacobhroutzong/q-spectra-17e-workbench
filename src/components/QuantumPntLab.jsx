import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Compass } from 'lucide-react';
import { prepareHiDpiCanvas } from '../utils/canvasHiDpi';

const WAYPOINTS = [
  { id: 'WP-1', x: 0.08, y: 0.78 },
  { id: 'WP-2', x: 0.28, y: 0.62 },
  { id: 'WP-3', x: 0.52, y: 0.50 },
  { id: 'WP-4', x: 0.74, y: 0.34 },
  { id: 'WP-5', x: 0.92, y: 0.20 }
];

const ADVERSARY_SINK = { x: 0.76, y: 0.86, label: 'SPOOF SINK' };

function crustalAnomalyNt(nx, ny) {
  const g1 = 210 * Math.exp(-((nx - 0.25) ** 2 + (ny - 0.35) ** 2) / 0.025);
  const g2 = -195 * Math.exp(-((nx - 0.55) ** 2 + (ny - 0.65) ** 2) / 0.03);
  const g3 = 185 * Math.exp(-((nx - 0.78) ** 2 + (ny - 0.28) ** 2) / 0.022);
  const g4 = -160 * Math.exp(-((nx - 0.18) ** 2 + (ny - 0.78) ** 2) / 0.028);
  const ridge = 75 * Math.sin(nx * 11.0 + ny * 4.5) * Math.cos(ny * 8.0 - nx * 3.0);
  return Math.max(-240, Math.min(240, g1 + g2 + g3 + g4 + ridge));
}

function sampleTruePath(s) {
  const clamped = Math.max(0, Math.min(1, s));
  const segs = WAYPOINTS.length - 1;
  const scaled = clamped * segs;
  const idx = Math.min(segs - 1, Math.floor(scaled));
  const t = scaled - idx;
  const p0 = WAYPOINTS[idx];
  const p1 = WAYPOINTS[idx + 1];
  return {
    x: p0.x + (p1.x - p0.x) * t,
    y: p0.y + (p1.y - p0.y) * t
  };
}

// Deterministic 60-particle offsets (Box-Muller-like spread)
const PARTICLE_SEEDS = Array.from({ length: 60 }, (_, i) => {
  const ang = (i * 2.39996) % (Math.PI * 2);
  const rad = Math.sqrt((i + 0.5) / 60);
  return {
    dx: Math.cos(ang) * rad,
    dy: Math.sin(ang) * rad
  };
});

export default function QuantumPntLab({
  missionHours,
  setMissionHours,
  gpsSpoofDb,
  setGpsSpoofDb,
  magNavLock,
  setMagNavLock,
  gpsSpoofedErrorMeters,
  classicalInsDriftMeters,
  quantumPntErrorMeters
}) {
  const mapCanvasRef = useRef(null);
  const profileCanvasRef = useRef(null);
  const bgLayerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hoverInfo, setHoverInfo] = useState(null);

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      setMissionHours((prev) => {
        const next = prev + 0.1;
        return next > 8 ? 0.5 : Number(next.toFixed(1));
      });
    }, 120);
    return () => clearInterval(id);
  }, [isPlaying, setMissionHours]);

  // Pre-render synthetic crustal magnetic iso-contour background
  useEffect(() => {
    const w = 640;
    const h = 300;
    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const octx = offscreen.getContext('2d');
    const img = octx.createImageData(w, h);

    for (let py = 0; py < h; py++) {
      const ny = py / h;
      for (let px = 0; px < w; px++) {
        const nx = px / w;
        const nt = crustalAnomalyNt(nx, ny);
        const norm = (nt + 240) / 480;

        const mod40 = Math.abs(((nt + 240) % 40) - 20);
        const isContour = mod40 < 1.25;

        let r = Math.floor(10 + norm * 18);
        let g = Math.floor(12 + (1 - Math.abs(norm - 0.5) * 2) * 24);
        let b = Math.floor(24 + (1 - norm) * 22);

        if (isContour) {
          r += 24;
          g += 34;
          b += 40;
        }

        const idx = (py * w + px) * 4;
        img.data[idx] = r;
        img.data[idx + 1] = g;
        img.data[idx + 2] = b;
        img.data[idx + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);

    octx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    octx.lineWidth = 1;
    for (let x = 0; x < w; x += 64) {
      octx.beginPath();
      octx.moveTo(x, 0);
      octx.lineTo(x, h);
      octx.stroke();
    }
    for (let y = 0; y < h; y += 64) {
      octx.beginPath();
      octx.moveTo(0, y);
      octx.lineTo(w, y);
      octx.stroke();
    }

    bgLayerRef.current = offscreen;
  }, []);

  // Compute profile series & Pearson r
  const profileStats = useMemo(() => {
    const samples = 48;
    const maxProgress = missionHours / 8.0;
    const refSeries = [];
    const measSeries = [];

    for (let i = 0; i <= samples; i++) {
      const frac = (i / samples) * maxProgress;
      const base = sampleTruePath(frac);
      const tHrs = frac * 8.0;
      const refNt = crustalAnomalyNt(base.x, base.y);
      const magErr = magNavLock ? 0.004 * Math.sin(tHrs * 3.1) : 0.036 * (tHrs / 8.0);
      const measNt =
        crustalAnomalyNt(base.x + magErr * 0.4, base.y + magErr) +
        (magNavLock ? Math.sin(i * 1.9) * 3.5 : Math.sin(i * 1.3) * 28.0);
      refSeries.push(refNt);
      measSeries.push(measNt);
    }

    const n = refSeries.length;
    const meanR = refSeries.reduce((a, b) => a + b, 0) / n;
    const meanM = measSeries.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let denR = 0;
    let denM = 0;
    for (let i = 0; i < n; i++) {
      const dr = refSeries[i] - meanR;
      const dm = measSeries[i] - meanM;
      num += dr * dm;
      denR += dr * dr;
      denM += dm * dm;
    }
    const pearsonR = denR * denM > 0 ? num / Math.sqrt(denR * denM) : 1.0;

    return { refSeries, measSeries, pearsonR: Math.max(-1, Math.min(1, pearsonR)) };
  }, [missionHours, magNavLock]);

  // 1. HiDPI 2D Map + 60-Particle Monte Carlo Cloud
  useEffect(() => {
    const hi = prepareHiDpiCanvas(mapCanvasRef.current, 640, 300);
    if (!hi || !bgLayerRef.current) return;
    const { ctx, width: w, height: h } = hi;

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(bgLayerRef.current, 0, 0, w, h);

    // True Waypoint Corridor
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    WAYPOINTS.forEach((wp, i) => {
      const px = wp.x * w;
      const py = wp.y * h;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    WAYPOINTS.forEach((wp) => {
      const px = wp.x * w;
      const py = wp.y * h;
      ctx.fillStyle = '#a1a1aa';
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '10px monospace';
      ctx.fillText(wp.id, px - 12, py - 8);
    });

    // Adversary Spoof Sink
    const sinkX = ADVERSARY_SINK.x * w;
    const sinkY = ADVERSARY_SINK.y * h;
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(sinkX, sinkY, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.arc(sinkX, sinkY, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '9px monospace';
    ctx.fillText(ADVERSARY_SINK.label, sinkX - 28, sinkY + 19);

    const maxProgress = missionHours / 8.0;
    const steps = 64;
    const spoofWeight = Math.min(1, gpsSpoofDb / 45);

    const gpsPts = [];
    const insPts = [];
    const qPntPts = [];

    for (let i = 0; i <= steps; i++) {
      const frac = (i / steps) * maxProgress;
      const base = sampleTruePath(frac);
      const tHrs = frac * 8.0;

      const pull = Math.pow(frac, 1.15) * 0.85 * spoofWeight;
      gpsPts.push({
        x: (base.x + (ADVERSARY_SINK.x - base.x) * pull) * w,
        y: (base.y + (ADVERSARY_SINK.y - base.y) * pull) * h
      });

      const driftNorm = Math.pow(tHrs / 8.0, 2.0);
      insPts.push({
        x: (base.x - driftNorm * 0.08) * w,
        y: (base.y - driftNorm * 0.24) * h
      });

      const magErr = magNavLock ? 0.004 * Math.sin(tHrs * 3.1) : 0.028 * (tHrs / 8.0);
      qPntPts.push({
        x: (base.x + magErr * 0.4) * w,
        y: (base.y + magErr) * h
      });
    }

    const drawTrajectory = (pts, color, width = 2, glow = false) => {
      if (pts.length < 2) return null;
      ctx.save();
      if (glow) {
        ctx.shadowColor = 'rgba(52, 211, 153, 0.55)';
        ctx.shadowBlur = 8;
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      pts.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.restore();

      const head = pts[pts.length - 1];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(head.x, head.y, 4, 0, Math.PI * 2);
      ctx.fill();
      return head;
    };

    drawTrajectory(gpsPts, '#f43f5e', 1.8);
    const insHead = drawTrajectory(insPts, '#fbbf24', 1.8);
    const qHead = drawTrajectory(qPntPts, '#34d399', 2.4, magNavLock);

    if (insHead) {
      const cepRadius = 6 + (missionHours / 8) * 26;
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.32)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(insHead.x, insHead.y, cepRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 60-Particle Monte Carlo Localization Cloud
    if (qHead) {
      const spreadX = magNavLock ? 7 : 22 + missionHours * 2.2;
      const spreadY = magNavLock ? 6 : 16 + missionHours * 1.8;

      PARTICLE_SEEDS.forEach((seed) => {
        const px = qHead.x + seed.dx * spreadX;
        const py = qHead.y + seed.dy * spreadY;
        ctx.fillStyle = magNavLock ? 'rgba(52, 211, 153, 0.65)' : 'rgba(251, 191, 36, 0.45)';
        ctx.beginPath();
        ctx.arc(px, py, 1.35, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.strokeStyle = magNavLock ? 'rgba(56, 189, 248, 0.75)' : 'rgba(251, 191, 36, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(qHead.x, qHead.y, spreadX, spreadY, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [missionHours, gpsSpoofDb, magNavLock]);

  // 2. HiDPI Crustal Magnetic Profile Strip (nT vs Distance)
  useEffect(() => {
    const hi = prepareHiDpiCanvas(profileCanvasRef.current, 640, 105);
    if (!hi) return;
    const { ctx, width: w, height: h } = hi;

    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, w, h);

    const padL = 42;
    const padR = 14;
    const padT = 18;
    const padB = 18;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    // Zero nT baseline
    const zeroY = padT + plotH / 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, zeroY);
    ctx.lineTo(padL + plotW, zeroY);
    ctx.stroke();

    ctx.fillStyle = '#52525b';
    ctx.font = '9px monospace';
    ctx.fillText('+240', 6, padT + 6);
    ctx.fillText('0 nT', 6, zeroY + 3);
    ctx.fillText('-240', 6, h - padB);

    const drawSeries = (arr, color, dashed = false) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      if (dashed) ctx.setLineDash([4, 3]);
      ctx.beginPath();
      arr.forEach((nt, i) => {
        const x = padL + (i / (arr.length - 1)) * plotW;
        const y = padT + ((240 - nt) / 480) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    };

    drawSeries(profileStats.refSeries, '#38bdf8', true);
    drawSeries(profileStats.measSeries, '#34d399', false);

    ctx.font = '10px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('--- Reference Crustal Map', padL, 11);
    ctx.fillStyle = '#34d399';
    ctx.fillText('— NV-Diamond Vector Meas.', padL + 165, 11);
  }, [profileStats]);

  const handleMouseMove = (e) => {
    const canvas = mapCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const nt = crustalAnomalyNt(nx, ny);
    setHoverInfo({
      xKm: (nx * 120).toFixed(1),
      yKm: ((1 - ny) * 60).toFixed(1),
      nt: nt.toFixed(1)
    });
  };

  const particleCorrelation = magNavLock
    ? (98.6 + Math.cos(missionHours * 1.7) * 0.6).toFixed(1)
    : (41.2 - missionHours * 3.1).toFixed(1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Control Rail */}
      <div className="lg:col-span-4 bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
            Contested PNT Controls
          </h2>
          <span className="text-[11px] font-mono text-zinc-500">NV-Diamond</span>
        </div>

        <div className="space-y-5">
          <div>
            <div className="flex justify-between text-xs mb-2">
              <span className="text-zinc-400">Mission Duration</span>
              <span className="font-mono tabular-nums text-zinc-100">{missionHours.toFixed(1)} hrs</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="8"
              step="0.5"
              value={missionHours}
              onChange={(e) => setMissionHours(Number(e.target.value))}
            />
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="mt-3 w-full py-2 px-3 rounded-xl border border-white/10 text-xs font-medium text-zinc-300 hover:border-white/25 flex items-center justify-center gap-2 transition"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isPlaying ? 'Pause Clock' : 'Simulate Trajectory'}
            </button>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-2">
              <span className="text-zinc-400">L1/L2 GPS Spoofing</span>
              <span className="font-mono tabular-nums text-rose-300">+{gpsSpoofDb} dB</span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              step="5"
              value={gpsSpoofDb}
              onChange={(e) => setGpsSpoofDb(Number(e.target.value))}
            />
          </div>
        </div>

        <button
          onClick={() => setMagNavLock(!magNavLock)}
          className={`w-full py-2.5 px-4 rounded-xl text-xs font-medium flex items-center justify-center gap-2 border transition ${
            magNavLock
              ? 'bg-zinc-100 text-zinc-950 border-zinc-100 hover:bg-white'
              : 'bg-transparent border-white/10 text-zinc-300 hover:border-white/20'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          {magNavLock ? 'MagNav Crustal Lock: ON' : 'Enable MagNav Lock'}
        </button>

        {/* Particle Filter Correlation */}
        <div className="pt-4 border-t border-white/[0.06] space-y-2">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-zinc-500">60-Particle Filter Lock</span>
            <span className={magNavLock ? 'text-emerald-400' : 'text-amber-300'}>
              {particleCorrelation}%
            </span>
          </div>
          <div className="w-full h-1 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                magNavLock ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
              style={{ width: `${Math.max(5, Math.min(100, Number(particleCorrelation)))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Right Main Display */}
      <div className="lg:col-span-8 space-y-6">
        {/* Typographic KPI Strip */}
        <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 grid grid-cols-1 sm:grid-cols-3 gap-6 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]">
          <div className="pt-2 sm:pt-0">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Spoofed GPS</div>
            <div className="font-mono tabular-nums text-2xl font-light text-rose-400 mt-1">
              {gpsSpoofedErrorMeters}
              <span className="text-xs text-zinc-500 ml-1">m</span>
            </div>
          </div>
          <div className="pt-2 sm:pt-0 sm:pl-6">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Ring-Laser INS</div>
            <div className="font-mono tabular-nums text-2xl font-light text-amber-300 mt-1">
              {classicalInsDriftMeters}
              <span className="text-xs text-zinc-500 ml-1">m</span>
            </div>
          </div>
          <div className="pt-2 sm:pt-0 sm:pl-6">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Cold-Atom MagNav</div>
            <div className="font-mono tabular-nums text-2xl font-light text-emerald-400 mt-1">
              {quantumPntErrorMeters}
              <span className="text-xs text-zinc-500 ml-1">m CEP</span>
            </div>
          </div>
        </div>

        {/* 2D Crustal Anomaly Map + Profile Strip */}
        <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
            <span>2D Crustal Magnetic Anomaly Iso-Contours (nT)</span>
            <span className="font-mono text-[11px] text-zinc-400">
              {hoverInfo ? `(${hoverInfo.xKm}, ${hoverInfo.yKm}) km • ${hoverInfo.nt} nT` : 'Hover map to sample nT'}
            </span>
          </div>

          <canvas
            ref={mapCanvasRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverInfo(null)}
            className="w-full h-64 bg-[#09090b] rounded-xl border border-white/[0.06] cursor-crosshair"
          />

          {/* Crustal Magnetic Profile Strip */}
          <div className="space-y-1.5 pt-2 border-t border-white/[0.06]">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Crustal Magnetic Profile (nT vs. Distance)</span>
              <span
                className={`font-mono text-[11px] px-2 py-0.5 rounded-full border ${
                  profileStats.pearsonR > 0.9
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                }`}
              >
                Pearson r = {profileStats.pearsonR.toFixed(3)}
              </span>
            </div>
            <canvas
              ref={profileCanvasRef}
              className="w-full h-24 bg-[#09090b] rounded-xl border border-white/[0.06]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
