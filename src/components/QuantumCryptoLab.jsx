import React, { useMemo, useState } from 'react';
import { KeyRound, ShieldAlert, ShieldCheck, RefreshCw, Eye } from 'lucide-react';

function binaryEntropy(p) {
  if (p <= 0 || p >= 1) return 0;
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
}

function getPolarizationSymbol(bit, basis) {
  if (basis === '+') return bit === 0 ? '→ (0°)' : '↑ (90°)';
  return bit === 0 ? '↗ (45°)' : '↘ (135°)';
}

function simulateBB84Frame({
  batchSize,
  aliceBasisMode,
  bobBasisMode,
  channelNoisePct,
  eveActive,
}) {
  const photons = [];
  const siftedKey = [];
  let siftedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < batchSize; i++) {
    const aliceBit = Math.random() < 0.5 ? 0 : 1;
    const aliceBasis =
      aliceBasisMode === 'random' ? (Math.random() < 0.5 ? '+' : '×') : aliceBasisMode;

    // Flying photon state after optional Eve intercept-resend
    let photonBit = aliceBit;
    let photonBasis = aliceBasis;
    let eveBasis = null;

    if (eveActive) {
      eveBasis = Math.random() < 0.5 ? '+' : '×';
      if (eveBasis !== aliceBasis) {
        photonBit = Math.random() < 0.5 ? 0 : 1;
        photonBasis = eveBasis;
      }
    }

    const bobBasis =
      bobBasisMode === 'random' ? (Math.random() < 0.5 ? '+' : '×') : bobBasisMode;

    let bobBit;
    if (bobBasis === photonBasis) {
      bobBit = photonBit;
    } else {
      bobBit = Math.random() < 0.5 ? 0 : 1;
    }

    // Apply depolarizing channel noise
    if (Math.random() < channelNoisePct / 100) {
      bobBit = bobBit === 0 ? 1 : 0;
    }

    const basisMatch = aliceBasis === bobBasis;
    const isError = basisMatch && bobBit !== aliceBit;

    if (basisMatch) {
      siftedCount++;
      if (isError) errorCount++;
      siftedKey.push(bobBit);
    }

    photons.push({
      id: i + 1,
      aliceBit,
      aliceBasis,
      polarization: getPolarizationSymbol(aliceBit, aliceBasis),
      eveBasis,
      bobBasis,
      bobBit,
      basisMatch,
      isError,
    });
  }

  const qber = siftedCount > 0 ? (errorCount / siftedCount) * 100 : 0;
  const qberFrac = qber / 100;
  // Shor-Preskill asymptotic secret key fraction per sifted bit
  const secretFraction =
    qberFrac >= 0.11 ? 0 : Math.max(0, 1 - 2 * binaryEntropy(qberFrac));
  // Assume 1.0 MHz pulsed attenuated laser source
  const rawSiftRateKbps = (siftedCount / batchSize) * 1000;
  const secureKeyRateKbps = rawSiftRateKbps * secretFraction;

  return {
    photons,
    siftedCount,
    errorCount,
    qber,
    secretFraction,
    rawSiftRateKbps,
    secureKeyRateKbps,
    siftedKey,
    compromised: qber >= 11.0,
  };
}

export default function QuantumCryptoLab() {
  const [batchSize, setBatchSize] = useState(24);
  const [aliceBasisMode, setAliceBasisMode] = useState('random');
  const [bobBasisMode, setBobBasisMode] = useState('random');
  const [channelNoisePct, setChannelNoisePct] = useState(1.5);
  const [eveActive, setEveActive] = useState(false);
  const [frameNonce, setFrameNonce] = useState(0);

  const sim = useMemo(
    () =>
      simulateBB84Frame({
        batchSize,
        aliceBasisMode,
        bobBasisMode,
        channelNoisePct,
        eveActive,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [batchSize, aliceBasisMode, bobBasisMode, channelNoisePct, eveActive, frameNonce]
  );

  return (
    <div className="space-y-6">
      {/* Top KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            Quantum Bit Error Rate (QBER)
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl font-semibold font-mono ${
                sim.compromised ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {sim.qber.toFixed(1)}%
            </span>
            <span className="text-xs font-mono text-zinc-500">limit 11.0%</span>
          </div>
        </div>

        <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            Sifted Key Efficiency
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-zinc-100 font-mono">
              {sim.siftedCount} / {batchSize}
            </span>
            <span className="text-xs font-mono text-zinc-500">
              ({((sim.siftedCount / batchSize) * 100).toFixed(0)}%)
            </span>
          </div>
        </div>

        <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            Secure Key Rate (1 MHz Src)
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl font-semibold font-mono ${
                sim.secureKeyRateKbps > 0 ? 'text-sky-300' : 'text-rose-400'
              }`}
            >
              {sim.secureKeyRateKbps.toFixed(1)} kbps
            </span>
          </div>
        </div>

        <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            Link Security Verdict
          </div>
          <div className="mt-2 flex items-center gap-2">
            {sim.compromised ? (
              <>
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
                <span className="text-sm font-semibold text-rose-300">
                  EVE DETECTED — ABORT
                </span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                <span className="text-sm font-semibold text-emerald-300">
                  BB84 LINK SECURE
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Controls */}
        <div className="xl:col-span-4 space-y-6">
          <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm font-semibold text-zinc-100">
                  BB84 Optical Channel Controls
                </h2>
              </div>
              <button
                onClick={() => setFrameNonce((n) => n + 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white text-xs font-medium transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Transmit
              </button>
            </div>

            {/* Alice Basis */}
            <div className="space-y-2">
              <div className="text-xs font-mono text-zinc-400">
                Alice Preparation Basis (+ Rectilinear / × Diagonal)
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'random', label: 'Random' },
                  { id: '+', label: '+ Rect' },
                  { id: '×', label: '× Diag' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setAliceBasisMode(opt.id)}
                    className={`py-1.5 rounded-lg text-xs font-mono border transition ${
                      aliceBasisMode === opt.id
                        ? 'bg-zinc-100 text-zinc-950 border-zinc-100 font-semibold'
                        : 'bg-zinc-950/60 text-zinc-400 border-white/[0.07] hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bob Basis */}
            <div className="space-y-2">
              <div className="text-xs font-mono text-zinc-400">
                Bob Measurement Basis (+ Rectilinear / × Diagonal)
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'random', label: 'Random' },
                  { id: '+', label: '+ Rect' },
                  { id: '×', label: '× Diag' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setBobBasisMode(opt.id)}
                    className={`py-1.5 rounded-lg text-xs font-mono border transition ${
                      bobBasisMode === opt.id
                        ? 'bg-zinc-100 text-zinc-950 border-zinc-100 font-semibold'
                        : 'bg-zinc-950/60 text-zinc-400 border-white/[0.07] hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Batch Size */}
            <div>
              <div className="flex justify-between text-xs font-mono mb-1.5">
                <span className="text-zinc-400">Photon Burst Size</span>
                <span className="text-zinc-200">{batchSize} qubits</span>
              </div>
              <input
                type="range"
                min={12}
                max={48}
                step={4}
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Channel Noise */}
            <div>
              <div className="flex justify-between text-xs font-mono mb-1.5">
                <span className="text-zinc-400">Fiber / Atmospheric Noise</span>
                <span className="text-zinc-200">{channelNoisePct.toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={15}
                step={0.5}
                value={channelNoisePct}
                onChange={(e) => setChannelNoisePct(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Eve Intercept-Resend Toggle */}
            <div className="pt-2 border-t border-white/[0.06]">
              <button
                onClick={() => setEveActive((v) => !v)}
                className={`w-full p-3.5 rounded-xl border text-left transition flex items-center justify-between ${
                  eveActive
                    ? 'bg-rose-500/15 border-rose-400/50 text-rose-200'
                    : 'bg-zinc-950/60 border-white/[0.07] text-zinc-300 hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Eye
                    className={`w-4 h-4 ${eveActive ? 'text-rose-400' : 'text-zinc-400'}`}
                  />
                  <div>
                    <div className="text-xs font-semibold">
                      Eve Intercept-Resend Attack
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      Injects ~25% QBER via basis collapse
                    </div>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                    eveActive
                      ? 'bg-rose-500/30 text-rose-200'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {eveActive ? 'ACTIVE' : 'OFF'}
                </span>
              </button>
            </div>
          </div>

          {/* Sifted Key Bitstream Card */}
          <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                Sifted Key Register
              </h3>
              <span className="text-[11px] font-mono text-zinc-500">
                {sim.errorCount} bit errors
              </span>
            </div>
            <div
              className={`p-3 rounded-xl border font-mono text-xs break-all tracking-widest ${
                sim.compromised
                  ? 'bg-rose-950/30 border-rose-500/30 text-rose-300 line-through'
                  : 'bg-zinc-950/80 border-white/[0.06] text-emerald-300'
              }`}
            >
              {sim.siftedKey.length > 0 ? sim.siftedKey.join('') : 'NO_MATCHED_BASES'}
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              {sim.compromised
                ? 'QBER ≥ 11.0% exceeds the Shor-Preskill bound. Key material is discarded to prevent information leakage.'
                : 'QBER < 11.0% allows privacy amplification and error correction to distill an information-theoretically secure key.'}
            </p>
          </div>
        </div>

        {/* Photon Sifting Timeline Table */}
        <div className="xl:col-span-8 bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                BB84 Single-Photon Transmission &amp; Basis Sifting Log
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Only qubits where Alice and Bob share the same basis (+ or ×) enter the sifted key.
              </p>
            </div>
            <span className="text-[11px] font-mono text-zinc-400">
              Shor-Preskill Bound: 11.0% QBER
            </span>
          </div>

          <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="text-zinc-500 border-b border-white/[0.07] sticky top-0 bg-[#0d0d10]">
                <tr>
                  <th className="py-2 px-2">#</th>
                  <th className="py-2 px-2">Alice Bit</th>
                  <th className="py-2 px-2">Alice Basis</th>
                  <th className="py-2 px-2">Photon State</th>
                  {eveActive && <th className="py-2 px-2 text-rose-300">Eve Basis</th>}
                  <th className="py-2 px-2">Bob Basis</th>
                  <th className="py-2 px-2">Bob Bit</th>
                  <th className="py-2 px-2 text-right">Sift Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {sim.photons.map((p) => (
                  <tr
                    key={p.id}
                    className={
                      p.isError
                        ? 'bg-rose-500/10 text-rose-200'
                        : p.basisMatch
                        ? 'text-zinc-100'
                        : 'text-zinc-500'
                    }
                  >
                    <td className="py-1.5 px-2">{String(p.id).padStart(2, '0')}</td>
                    <td className="py-1.5 px-2">{p.aliceBit}</td>
                    <td className="py-1.5 px-2">{p.aliceBasis}</td>
                    <td className="py-1.5 px-2">{p.polarization}</td>
                    {eveActive && (
                      <td className="py-1.5 px-2 text-rose-300">{p.eveBasis}</td>
                    )}
                    <td className="py-1.5 px-2">{p.bobBasis}</td>
                    <td className="py-1.5 px-2">{p.bobBit}</td>
                    <td className="py-1.5 px-2 text-right">
                      {!p.basisMatch ? (
                        <span className="text-zinc-500">DISCARD</span>
                      ) : p.isError ? (
                        <span className="text-rose-400 font-semibold">BIT ERROR</span>
                      ) : (
                        <span className="text-emerald-400">KEEP ({p.bobBit})</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
