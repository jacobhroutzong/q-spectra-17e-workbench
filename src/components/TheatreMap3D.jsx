import React, { useEffect, useRef, useState } from 'react';
import { Zap, ShieldAlert, Compass, RotateCcw } from 'lucide-react';
import { prepareHiDpiCanvas } from '../utils/canvasHiDpi';

function crustalAnomalyNt(nx, ny) {
  const g1 = 210 * Math.exp(-((nx - 0.25) ** 2 + (ny - 0.35) ** 2) / 0.025);
  const g2 = -195 * Math.exp(-((nx - 0.55) ** 2 + (ny - 0.65) ** 2) / 0.03);
  const g3 = 185 * Math.exp(-((nx - 0.78) ** 2 + (ny - 0.28) ** 2) / 0.022);
  const g4 = -160 * Math.exp(-((nx - 0.18) ** 2 + (ny - 0.78) ** 2) / 0.028);
  const ridge = 75 * Math.sin(nx * 11.0 + ny * 4.5) * Math.cos(ny * 8.0 - nx * 3.0);
  return Math.max(-240, Math.min(240, g1 + g2 + g3 + g4 + ridge));
}

function project3D(x, y, z, yaw, pitch, zoom, w, h) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  const rx = x * cy - z * sy;
  const rz = x * sy + z * cy;
  const ry = y * cp - rz * sp;
  const tz = y * sp + rz * cp + 3.4;

  const scale = (Math.min(w, h) * 0.92 * zoom) / Math.max(0.6, tz);
  return {
    sx: w / 2 + rx * scale,
    sy: h / 2 - ry * scale
  };
}

const SENSOR_TRIAD = [
  { id: 'ryd-alpha', label: 'RYD-ALPHA', x: -0.78, z: 0.58, kind: 'sensor' },
  { id: 'ryd-bravo', label: 'RYD-BRAVO', x: -0.25, z: -0.68, kind: 'sensor' },
  { id: 'ryd-charlie', label: 'RYD-CHARLIE', x: 0.72, z: -0.58, kind: 'sensor' }
];

const THREATS = [
  { id: 'hpm-jammer', label: 'HPM JAMMER', x: 0.22, z: 0.28, kind: 'hpm' },
  { id: 'drfm-repeater', label: 'DRFM REPEATER', x: -0.15, z: 0.12, kind: 'drfm' },
  { id: 'gps-sink', label: 'GPS SPOOF SINK', x: 0.52, z: 0.68, kind: 'sink' }
];

export default function TheatreMap3D({ telemetry, dispatchScenario }) {
  const canvasRef = useRef(null);
  const [yaw, setYaw] = useState(-0.62);
  const [pitch, setPitch] = useState(0.56);
  const [zoom, setZoom] = useState(1.05);
  const [selectedNode, setSelectedNode] = useState(THREATS[0]);

  const [layers, setLayers] = useState({
    terrain: true,
    triad: true,
    domes: true,
    flights: true
  });

  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0 });
  const hitNodesRef = useRef([]);
  const stateRef = useRef({ yaw, pitch, zoom, layers, telemetry, selectedNode });

  useEffect(() => {
    stateRef.current = { yaw, pitch, zoom, layers, telemetry, selectedNode };
  }, [yaw, pitch, zoom, layers, telemetry, selectedNode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let rafId = 0;

    const render = (now) => {
      const hi = prepareHiDpiCanvas(canvas, 760, 420);
      if (!hi) return;
      const { ctx, width: w, height: h } = hi;

      const { yaw: yw, pitch: pt, zoom: zm, layers: ly, telemetry: tel, selectedNode: sel } =
        stateRef.current;

      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, w, h);

      // 1. 3D Crustal Magnetic Anomaly Mesh
      if (ly.terrain) {
        const N = 18;
        const pts = [];
        for (let ix = 0; ix <= N; ix++) {
          const row = [];
          const nx = ix / N;
          const wx = (nx - 0.5) * 2.0;
          for (let iz = 0; iz <= N; iz++) {
            const nz = iz / N;
            const wz = (nz - 0.5) * 2.0;
            const nt = crustalAnomalyNt(nx, nz);
            const wy = (nt / 240) * 0.11;
            row.push({
              ...project3D(wx, wy, wz, yw, pt, zm, w, h),
              nt
            });
          }
          pts.push(row);
        }

        ctx.lineWidth = 0.8;
        for (let ix = 0; ix < N; ix++) {
          for (let iz = 0; iz < N; iz++) {
            const p0 = pts[ix][iz];
            const px = pts[ix + 1][iz];
            const pz = pts[ix][iz + 1];
            const norm = (p0.nt + 240) / 480;
            ctx.strokeStyle =
              norm > 0.6 || norm < 0.4
                ? 'rgba(56, 189, 248, 0.16)'
                : 'rgba(255, 255, 255, 0.05)';

            ctx.beginPath();
            ctx.moveTo(p0.sx, p0.sy);
            ctx.lineTo(px.sx, px.sy);
            ctx.moveTo(p0.sx, p0.sy);
            ctx.lineTo(pz.sx, pz.sy);
            ctx.stroke();
          }
        }
      }

      const hpmActive = Boolean(tel?.rydberg?.hpmPulseActive);
      const drfmActive = Boolean(tel?.radar?.drfmSpoofActive);
      const idlerOn = Boolean(tel?.radar?.quantumIdlerCorrelation);

      const drawDome = (cx, cz, radius, height, colorRgba, pulseFactor = 1) => {
        const rings = 4;
        const segs = 18;
        ctx.strokeStyle = colorRgba;
        ctx.lineWidth = 1;
        for (let r = 1; r <= rings; r++) {
          const phi = (r / rings) * (Math.PI / 2);
          const rad = Math.cos(phi) * radius * pulseFactor;
          const alt = Math.sin(phi) * height * pulseFactor;
          ctx.beginPath();
          for (let s = 0; s <= segs; s++) {
            const th = (s / segs) * Math.PI * 2;
            const p = project3D(cx + Math.cos(th) * rad, alt, cz + Math.sin(th) * rad, yw, pt, zm, w, h);
            if (s === 0) ctx.moveTo(p.sx, p.sy);
            else ctx.lineTo(p.sx, p.sy);
          }
          ctx.stroke();
        }
      };

      // 2. Volumetric Threat Domes
      if (ly.domes) {
        const hpmPulse = hpmActive ? 1 + 0.08 * Math.sin(now / 140) : 0.72;
        drawDome(
          0.22,
          0.28,
          0.32,
          0.32,
          hpmActive ? 'rgba(244, 63, 94, 0.72)' : 'rgba(244, 63, 94, 0.18)',
          hpmPulse
        );

        drawDome(
          -0.15,
          0.12,
          0.26,
          0.24,
          drfmActive
            ? idlerOn
              ? 'rgba(56, 189, 248, 0.35)'
              : 'rgba(251, 191, 36, 0.65)'
            : 'rgba(255, 255, 255, 0.1)'
        );

        if (drfmActive && idlerOn) {
          ctx.save();
          ctx.shadowColor = 'rgba(52, 211, 153, 0.5)';
          ctx.shadowBlur = 8;
          ctx.strokeStyle = 'rgba(52, 211, 153, 0.85)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          for (let s = 0; s <= 24; s++) {
            const th = (s / 24) * Math.PI * 2 + now / 900;
            const p = project3D(-0.15 + Math.cos(th) * 0.29, 0.08, 0.12 + Math.sin(th) * 0.29, yw, pt, zm, w, h);
            if (s === 0) ctx.moveTo(p.sx, p.sy);
            else ctx.lineTo(p.sx, p.sy);
          }
          ctx.stroke();
          ctx.restore();
        }
      }

      // 3. Rydberg Sensor Triad & AoA Rays
      if (ly.triad) {
        const targetThreat = hpmActive ? THREATS[0] : THREATS[1];
        const tProj = project3D(targetThreat.x, 0.04, targetThreat.z, yw, pt, zm, w, h);

        SENSOR_TRIAD.forEach((node) => {
          const sProj = project3D(node.x, 0.03, node.z, yw, pt, zm, w, h);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(sProj.sx, sProj.sy);
          ctx.lineTo(tProj.sx, tProj.sy);
          ctx.stroke();
          ctx.setLineDash([]);
        });
      }

      // 4. 3D Flight Trajectories
      if (ly.flights) {
        const hrs = Number(tel?.pnt?.missionHours || 2.5);
        const spoofDb = Number(tel?.pnt?.gpsSpoofDb || 30);
        const magLock = Boolean(tel?.pnt?.magNavLock ?? true);
        const maxFrac = hrs / 8.0;
        const steps = 36;
        const spoofWeight = Math.min(1, spoofDb / 45);

        const draw3DPath = (pts3d, color, dropLines = false) => {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          pts3d.forEach((pt3, i) => {
            const p = project3D(pt3.x, pt3.y, pt3.z, yw, pt, zm, w, h);
            if (i === 0) ctx.moveTo(p.sx, p.sy);
            else ctx.lineTo(p.sx, p.sy);
          });
          ctx.stroke();

          if (dropLines) {
            ctx.strokeStyle = 'rgba(52, 211, 153, 0.25)';
            ctx.lineWidth = 1;
            pts3d.forEach((pt3, i) => {
              if (i % 6 !== 0 && i !== pts3d.length - 1) return;
              const pTop = project3D(pt3.x, pt3.y, pt3.z, yw, pt, zm, w, h);
              const pGnd = project3D(pt3.x, 0.0, pt3.z, yw, pt, zm, w, h);
              ctx.beginPath();
              ctx.moveTo(pTop.sx, pTop.sy);
              ctx.lineTo(pGnd.sx, pGnd.sy);
              ctx.stroke();
            });
          }
        };

        const gps3d = [];
        const ins3d = [];
        const mag3d = [];

        for (let i = 0; i <= steps; i++) {
          const frac = (i / steps) * maxFrac;
          const bx = -0.82 + frac * 1.64;
          const bz = 0.52 - frac * 1.12;
          const alt = 0.32 + Math.sin(frac * Math.PI) * 0.14;

          const pull = Math.pow(frac, 1.15) * 0.85 * spoofWeight;
          gps3d.push({
            x: bx + (0.52 - bx) * pull,
            y: alt * (1 - pull * 0.55),
            z: bz + (0.68 - bz) * pull
          });

          const drift = Math.pow(frac, 2.0);
          ins3d.push({
            x: bx - drift * 0.18,
            y: alt + drift * 0.08,
            z: bz - drift * 0.38
          });

          const magJitter = magLock ? 0.012 * Math.sin(frac * 18) : 0.07 * frac;
          mag3d.push({
            x: bx + magJitter,
            y: alt,
            z: bz + magJitter
          });
        }

        draw3DPath(gps3d, '#f43f5e', false);
        draw3DPath(ins3d, '#fbbf24', false);
        draw3DPath(mag3d, '#34d399', true);
      }

      // 5. Node Markers
      const allNodes = [...SENSOR_TRIAD, ...THREATS];
      const nextHits = [];
      allNodes.forEach((node) => {
        const p = project3D(node.x, 0.04, node.z, yw, pt, zm, w, h);
        nextHits.push({ node, sx: p.sx, sy: p.sy });
        const isSel = sel?.id === node.id;

        ctx.fillStyle =
          node.kind === 'sensor'
            ? '#38bdf8'
            : node.kind === 'hpm'
              ? '#f43f5e'
              : node.kind === 'drfm'
                ? '#fbbf24'
                : '#f43f5e';
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, isSel ? 6 : 4.5, 0, Math.PI * 2);
        ctx.fill();

        if (isSel) {
          ctx.strokeStyle = '#fafafa';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, 10, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.fillStyle = '#a1a1aa';
        ctx.font = '10px monospace';
        ctx.fillText(node.label, p.sx + 9, p.sy + 3);
      });
      hitNodesRef.current = nextHits;

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const handleMouseDown = (e) => {
    dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY, moved: false };
  };

  const handleMouseMove = (e) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragRef.current.moved = true;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
    setYaw((prev) => prev + dx * 0.008);
    setPitch((prev) => Math.max(0.18, Math.min(1.25, prev + dy * 0.006)));
  };

  const handleMouseUp = (e) => {
    const wasClick = !dragRef.current.moved;
    dragRef.current.dragging = false;
    if (!wasClick || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * 760;
    const cy = ((e.clientY - rect.top) / rect.height) * 420;
    let best = null;
    let bestD = Infinity;
    hitNodesRef.current.forEach((h) => {
      const d = Math.hypot(h.sx - cx, h.sy - cy);
      if (d < bestD) {
        bestD = d;
        best = h.node;
      }
    });
    if (best && bestD < 32) {
      setSelectedNode(best);
    }
  };

  const handleWheel = (e) => {
    e.preventDefault();
    setZoom((prev) => Math.max(0.65, Math.min(1.9, prev - e.deltaY * 0.0008)));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* 3D Theatre Canvas */}
      <div className="lg:col-span-9 bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              3D Contested EMS Theatre
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Drag to orbit • Scroll to zoom • Click node to inspect
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Compact Layer Pills */}
            <div className="bg-zinc-950/70 p-1 rounded-full border border-white/[0.06] flex items-center gap-0.5">
              {[
                { key: 'terrain', label: 'Mesh' },
                { key: 'triad', label: 'Triad' },
                { key: 'domes', label: 'Domes' },
                { key: 'flights', label: 'PNT' }
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setLayers((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-mono transition ${
                    layers[item.key] ? 'bg-zinc-100 text-zinc-950 font-medium' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                setYaw(-0.62);
                setPitch(0.56);
                setZoom(1.05);
              }}
              className="p-2 rounded-full border border-white/10 text-zinc-400 hover:text-zinc-100 transition"
              title="Reset Camera"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <canvas
          ref={canvasRef}
          width={760}
          height={420}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            dragRef.current.dragging = false;
          }}
          onWheel={handleWheel}
          className="w-full h-[420px] bg-[#09090b] rounded-xl border border-white/[0.06] cursor-grab active:cursor-grabbing"
        />
      </div>

      {/* Right HUD */}
      <div className="lg:col-span-3 bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 flex flex-col justify-between space-y-6">
        <div className="space-y-4">
          <div className="text-xs font-mono uppercase tracking-wider text-zinc-400">
            Node Telemetry
          </div>

          {selectedNode && (
            <div className="space-y-3 text-xs font-mono">
              <div className="text-zinc-100 font-medium">{selectedNode.label}</div>
              {selectedNode.kind === 'sensor' && (
                <div className="space-y-1.5 text-zinc-400">
                  <div>
                    Species: <span className="text-zinc-200">{telemetry.rydberg.species}</span> (n=
                    {telemetry.rydberg.nPrincipal})
                  </div>
                  <div>
                    Δf_AT: <span className="text-sky-300">{telemetry.rydberg.splittingMHz} MHz</span>
                  </div>
                  <div>
                    E-Field: <span className="text-zinc-200">{telemetry.rydberg.eFieldVm} V/m</span>
                  </div>
                </div>
              )}
              {selectedNode.kind === 'hpm' && (
                <div className="space-y-1.5 text-zinc-400">
                  <div>
                    State:{' '}
                    <span className={telemetry.rydberg.hpmPulseActive ? 'text-rose-400' : 'text-zinc-200'}>
                      {telemetry.rydberg.hpmPulseActive ? 'FIRING (+28 dBm)' : 'STANDBY'}
                    </span>
                  </div>
                  <div>
                    Classical LNA:{' '}
                    <span className={telemetry.rydberg.lnaBurnout ? 'text-rose-400' : 'text-emerald-400'}>
                      {telemetry.rydberg.lnaBurnout ? 'BURNOUT' : 'NOMINAL'}
                    </span>
                  </div>
                </div>
              )}
              {selectedNode.kind === 'drfm' && (
                <div className="space-y-1.5 text-zinc-400">
                  <div>
                    DRFM:{' '}
                    <span className="text-zinc-200">
                      {telemetry.radar.drfmSpoofActive ? 'ACTIVE' : 'OFF'}
                    </span>
                  </div>
                  <div>
                    EP Gain: <span className="text-emerald-400">+{telemetry.radar.advantageDb} dB</span>
                  </div>
                  <div>
                    Rejection:{' '}
                    <span className="text-sky-300">
                      {telemetry.radar.quantumIdlerCorrelation
                        ? `${telemetry.radar.drfmRejectionPercent}%`
                        : '0%'}
                    </span>
                  </div>
                </div>
              )}
              {selectedNode.kind === 'sink' && (
                <div className="space-y-1.5 text-zinc-400">
                  <div>
                    Spoof: <span className="text-rose-400">+{telemetry.pnt.gpsSpoofDb} dB</span>
                  </div>
                  <div>
                    MagNav CEP:{' '}
                    <span className="text-emerald-400">{telemetry.pnt.quantumPntErrorMeters} m</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2.5 pt-4 border-t border-white/[0.06]">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
            Countermeasures
          </div>
          <button
            onClick={() =>
              dispatchScenario({
                telemetryOverride: { rydberg: { hpmPulseActive: !telemetry.rydberg.hpmPulseActive } }
              })
            }
            className={`w-full py-2 px-3 rounded-xl text-xs font-medium border flex items-center justify-between transition ${
              telemetry.rydberg.hpmPulseActive
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'border-white/10 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" /> HPM Jammer
            </span>
            <span className="font-mono text-[11px]">
              {telemetry.rydberg.hpmPulseActive ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            onClick={() =>
              dispatchScenario({
                telemetryOverride: {
                  radar: { quantumIdlerCorrelation: !telemetry.radar.quantumIdlerCorrelation }
                }
              })
            }
            className={`w-full py-2 px-3 rounded-xl text-xs font-medium border flex items-center justify-between transition ${
              telemetry.radar.quantumIdlerCorrelation
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'border-white/10 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" /> Idler Shield
            </span>
            <span className="font-mono text-[11px]">
              {telemetry.radar.quantumIdlerCorrelation ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            onClick={() =>
              dispatchScenario({
                telemetryOverride: { pnt: { magNavLock: !telemetry.pnt.magNavLock } }
              })
            }
            className={`w-full py-2 px-3 rounded-xl text-xs font-medium border flex items-center justify-between transition ${
              telemetry.pnt.magNavLock
                ? 'bg-sky-500/10 border-sky-500/30 text-sky-300'
                : 'border-white/10 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5" /> MagNav Lock
            </span>
            <span className="font-mono text-[11px]">
              {telemetry.pnt.magNavLock ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
