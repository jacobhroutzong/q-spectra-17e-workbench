import React, { useMemo, useState } from 'react';
import { Cpu, Play, RotateCcw, Trash2, Sparkles, Activity } from 'lucide-react';
import { CIRCUIT_PRESETS, simulateCircuit } from '../physics/quantumCircuitEngine';

const SINGLE_GATES = [
  { id: 'H', label: 'H', title: 'Hadamard (Superposition)' },
  { id: 'X', label: 'X', title: 'Pauli-X (Bit Flip)' },
  { id: 'Y', label: 'Y', title: 'Pauli-Y' },
  { id: 'Z', label: 'Z', title: 'Pauli-Z (Phase Flip)' },
  { id: 'S', label: 'P', title: 'Phase S (π/2)' },
  { id: 'Rx', label: 'Rx', title: 'X-Axis Rotation Rx(θ)' },
  { id: 'Ry', label: 'Ry', title: 'Y-Axis Rotation Ry(θ)' },
  { id: 'Rz', label: 'Rz', title: 'Z-Axis Rotation Rz(θ)' },
  { id: 'M', label: 'M', title: 'Computational Basis Measurement' },
];

export default function QuantumCodingLab() {
  const [numQubits, setNumQubits] = useState(3);
  const [operations, setOperations] = useState(CIRCUIT_PRESETS.ghz3.operations);
  const [activePreset, setActivePreset] = useState('ghz3');
  const [targetQubit, setTargetQubit] = useState(0);
  const [controlQubit, setControlQubit] = useState(0);
  const [cnotTarget, setCnotTarget] = useState(1);
  const [thetaRad, setThetaRad] = useState(Number((Math.PI / 2).toFixed(2)));
  const [gateNoise, setGateNoise] = useState(0.002);
  const [shotNonce, setShotNonce] = useState(0);

  const sim = useMemo(
    () => simulateCircuit(numQubits, operations, 1024, gateNoise),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [numQubits, operations, gateNoise, shotNonce]
  );

  const loadPreset = (presetKey) => {
    const preset = CIRCUIT_PRESETS[presetKey];
    if (!preset) return;
    setActivePreset(presetKey);
    setNumQubits(preset.numQubits);
    setOperations([...preset.operations]);
    setTargetQubit(0);
    setControlQubit(0);
    setCnotTarget(Math.min(1, preset.numQubits - 1));
  };

  const handleQubitCountChange = (count) => {
    setActivePreset(null);
    setNumQubits(count);
    setOperations((prev) =>
      prev.filter(
        (op) =>
          (op.target ?? 0) < count &&
          (op.control === undefined || op.control < count) &&
          op.gate !== 'ORACLE_101' &&
          op.gate !== 'DIFFUSER'
      )
    );
    if (targetQubit >= count) setTargetQubit(0);
    if (controlQubit >= count) setControlQubit(0);
    if (cnotTarget >= count) setCnotTarget(count - 1);
  };

  const addGate = (gate) => {
    setActivePreset(null);
    if (gate === 'CNOT') {
      const ctrl = controlQubit;
      const targ = cnotTarget === ctrl ? (ctrl + 1) % numQubits : cnotTarget;
      setOperations((prev) => [...prev, { gate: 'CNOT', control: ctrl, target: targ }]);
      return;
    }
    const op = { gate, target: targetQubit };
    if (gate === 'Rx' || gate === 'Ry' || gate === 'Rz') {
      op.theta = thetaRad;
    }
    setOperations((prev) => [...prev, op]);
  };

  const removeGateAt = (idx) => {
    setActivePreset(null);
    setOperations((prev) => prev.filter((_, i) => i !== idx));
  };

  const clearCircuit = () => {
    setActivePreset(null);
    setOperations([]);
  };

  const dominantState = useMemo(() => {
    let best = sim.basisStates[0];
    for (const st of sim.basisStates) {
      if (st.prob > best.prob) best = st;
    }
    return best;
  }, [sim.basisStates]);

  const formatComplex = (re, im) => {
    const r = Math.abs(re) < 1e-4 ? 0 : re;
    const i = Math.abs(im) < 1e-4 ? 0 : im;
    if (i === 0) return r.toFixed(3);
    const sign = i >= 0 ? '+' : '-';
    return `${r.toFixed(2)}${sign}${Math.abs(i).toFixed(2)}i`;
  };

  return (
    <div className="space-y-6">
      {/* Top KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            Quantum Register
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-zinc-100 font-mono">
              {numQubits} Qubits
            </span>
            <span className="text-xs font-mono text-zinc-500">({1 << numQubits}-D Hilbert)</span>
          </div>
        </div>

        <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            Circuit Depth / Gates
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-zinc-100 font-mono">
              {sim.gateCount}
            </span>
            <span className="text-xs font-mono text-zinc-500">ops queued</span>
          </div>
        </div>

        <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            Simulated Gate Fidelity
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl font-semibold font-mono ${
                sim.estimatedFidelity >= 95
                  ? 'text-emerald-400'
                  : sim.estimatedFidelity >= 85
                  ? 'text-amber-300'
                  : 'text-rose-400'
              }`}
            >
              {sim.estimatedFidelity.toFixed(2)}%
            </span>
            <span className="text-xs font-mono text-zinc-500">
              ε={(gateNoise * 100).toFixed(2)}%
            </span>
          </div>
        </div>

        <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            Dominant Basis State
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-sky-300 font-mono">
              {dominantState?.label}
            </span>
            <span className="text-xs font-mono text-zinc-400">
              {((dominantState?.prob || 0) * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Gate Palette & Benchmark Presets */}
        <div className="xl:col-span-4 space-y-6">
          <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm font-semibold text-zinc-100">Benchmark Challenges</h2>
              </div>
              <div className="flex items-center gap-1 bg-zinc-950/80 p-1 rounded-lg border border-white/[0.06]">
                {[2, 3, 4].map((q) => (
                  <button
                    key={q}
                    onClick={() => handleQubitCountChange(q)}
                    className={`px-2.5 py-1 rounded text-xs font-mono transition ${
                      numQubits === q
                        ? 'bg-zinc-100 text-zinc-950 font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {q}q
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {Object.values(CIRCUIT_PRESETS).map((preset) => {
                const isSelected = activePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => loadPreset(preset.id)}
                    className={`text-left p-3 rounded-xl border transition ${
                      isSelected
                        ? 'bg-sky-500/10 border-sky-400/40 text-zinc-100'
                        : 'bg-zinc-950/50 border-white/[0.06] text-zinc-300 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span>{preset.name}</span>
                      <span className="font-mono text-[10px] text-zinc-400">
                        {preset.numQubits}Q
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-400 leading-relaxed">
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Gate Builder Controls */}
          <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-zinc-300" />
                <h2 className="text-sm font-semibold text-zinc-100">Quantum Gate Palette</h2>
              </div>
              <button
                onClick={clearCircuit}
                className="flex items-center gap-1 text-xs font-mono text-zinc-400 hover:text-rose-300 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            </div>

            {/* Target Wire Selector */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono text-zinc-400">
                <span>Target Wire (1-Qubit Gates)</span>
                <span className="text-zinc-200">q{targetQubit}</span>
              </div>
              <div className="flex gap-1.5">
                {Array.from({ length: numQubits }, (_, q) => (
                  <button
                    key={q}
                    onClick={() => setTargetQubit(q)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-mono border transition ${
                      targetQubit === q
                        ? 'bg-zinc-100 text-zinc-950 border-zinc-100 font-semibold'
                        : 'bg-zinc-950/60 text-zinc-400 border-white/[0.07] hover:text-zinc-200'
                    }`}
                  >
                    q{q}
                  </button>
                ))}
              </div>
            </div>

            {/* Single-Qubit Gates */}
            <div className="grid grid-cols-3 gap-2">
              {SINGLE_GATES.map((g) => (
                <button
                  key={g.id}
                  onClick={() => addGate(g.id)}
                  title={g.title}
                  className="py-2 px-3 rounded-xl bg-zinc-950/70 border border-white/[0.07] hover:border-sky-400/50 hover:bg-sky-500/10 text-xs font-mono text-zinc-100 transition"
                >
                  {g.label}
                </button>
              ))}
            </div>

            {/* CNOT Entangler */}
            <div className="pt-2 border-t border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                <span>2-Qubit Entangler (CNOT)</span>
                <span className="text-zinc-200">
                  ctrl q{controlQubit} → targ q{cnotTarget}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={controlQubit}
                  onChange={(e) => setControlQubit(Number(e.target.value))}
                  className="bg-zinc-950 border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-200"
                >
                  {Array.from({ length: numQubits }, (_, q) => (
                    <option key={q} value={q}>
                      Control: q{q}
                    </option>
                  ))}
                </select>
                <select
                  value={cnotTarget}
                  onChange={(e) => setCnotTarget(Number(e.target.value))}
                  className="bg-zinc-950 border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-200"
                >
                  {Array.from({ length: numQubits }, (_, q) => (
                    <option key={q} value={q}>
                      Target: q{q}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => addGate('CNOT')}
                className="w-full py-2 rounded-xl bg-zinc-100 text-zinc-950 hover:bg-white text-xs font-semibold transition"
              >
                + Append CNOT (q{controlQubit} → q{cnotTarget})
              </button>
            </div>

            {/* Rotation Angle & Gate Noise Sliders */}
            <div className="pt-2 border-t border-white/[0.06] space-y-4">
              <div>
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-zinc-400">Rotation Angle θ (Rx/Ry/Rz)</span>
                  <span className="text-zinc-200">
                    {thetaRad.toFixed(2)} rad ({((thetaRad * 180) / Math.PI).toFixed(0)}°)
                  </span>
                </div>
                <input
                  type="range"
                  min={-3.14}
                  max={3.14}
                  step={0.05}
                  value={thetaRad}
                  onChange={(e) => setThetaRad(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-zinc-400">Depolarizing Gate Noise ε</span>
                  <span className="text-zinc-200">{(gateNoise * 100).toFixed(2)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.02}
                  step={0.0005}
                  value={gateNoise}
                  onChange={(e) => setGateNoise(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Interactive Circuit Wire Canvas + Basis Probabilities + State Vector */}
        <div className="xl:col-span-8 space-y-6">
          {/* Quantum Circuit Diagram */}
          <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">
                  Quantum Circuit Register ({numQubits}-Qubit)
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Click any gate badge to remove it from the timeline.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShotNonce((n) => n + 1)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white text-xs font-medium transition"
                >
                  <Play className="w-3.5 h-3.5" />
                  Run 1024 Shots
                </button>
                <button
                  onClick={() => loadPreset(activePreset || 'ghz3')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-950 border border-white/[0.08] text-zinc-300 hover:text-white text-xs font-mono transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              </div>
            </div>

            <div className="overflow-x-auto py-2">
              <div className="min-w-[520px] space-y-3">
                {Array.from({ length: numQubits }, (_, wire) => (
                  <div key={wire} className="relative flex items-center h-10">
                    <span className="w-12 shrink-0 text-xs font-mono text-zinc-400">
                      |0⟩ q{wire}
                    </span>
                    <div className="relative flex-1 flex items-center gap-2 px-3">
                      {/* Horizontal Wire Line */}
                      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-white/[0.12] pointer-events-none" />
                      {operations.map((op, idx) => {
                        const isTarget = op.target === wire;
                        const isControl = op.gate === 'CNOT' && op.control === wire;
                        const isMultiBlock =
                          op.gate === 'ORACLE_101' || op.gate === 'DIFFUSER';
                        const activeOnWire = isTarget || isControl || isMultiBlock;

                        return (
                          <div
                            key={`${wire}-${idx}`}
                            className="relative z-10 w-12 flex justify-center shrink-0"
                          >
                            {activeOnWire ? (
                              <button
                                onClick={() => removeGateAt(idx)}
                                title="Click to remove gate"
                                className={`px-2 py-1 rounded-md text-[11px] font-mono border transition shadow-sm ${
                                  isControl
                                    ? 'bg-sky-500/20 border-sky-400/60 text-sky-200'
                                    : op.gate === 'M'
                                    ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-300'
                                    : isMultiBlock
                                    ? 'bg-violet-500/20 border-violet-400/50 text-violet-200'
                                    : 'bg-zinc-900 border-white/25 text-zinc-100 hover:border-rose-400/60'
                                }`}
                              >
                                {isControl
                                  ? '●'
                                  : op.gate === 'CNOT'
                                  ? '⊕'
                                  : op.gate === 'ORACLE_101'
                                  ? 'O₁₀₁'
                                  : op.gate === 'DIFFUSER'
                                  ? 'D'
                                  : op.gate === 'S'
                                  ? 'P'
                                  : op.gate}
                              </button>
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-transparent" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Computational Basis Probabilities + Simulated Shots */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-sky-400" />
                  <h3 className="text-sm font-semibold text-zinc-100">
                    Basis Probabilities &amp; 1024-Shot Counts
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-zinc-400">Born Rule |α|²</span>
              </div>

              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {sim.basisStates.map((st, idx) => {
                  const pct = st.prob * 100;
                  const shotsPct = (sim.counts[idx] / sim.shots) * 100;
                  return (
                    <div key={st.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-zinc-200">{st.label}</span>
                        <span className="text-zinc-400">
                          {pct.toFixed(1)}% ({sim.counts[idx]} / {sim.shots} shots)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-zinc-950 border border-white/[0.05] overflow-hidden relative">
                        <div
                          className="h-full bg-sky-400/80 transition-all duration-300"
                          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                        />
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-emerald-300"
                          style={{ left: `${Math.max(0, Math.min(99.5, shotsPct))}%` }}
                          title={`Measured: ${shotsPct.toFixed(1)}%`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* State Vector Table */}
            <div className="bg-zinc-900/40 backdrop-blur-md border border-white/[0.07] rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-100">
                  Simulated State Vector |ψ⟩
                </h3>
                <span className="text-[11px] font-mono text-zinc-400">Amplitude &amp; Phase</span>
              </div>

              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="text-zinc-500 border-b border-white/[0.06]">
                    <tr>
                      <th className="py-1.5">State</th>
                      <th className="py-1.5">Amplitude α</th>
                      <th className="py-1.5 text-right">Prob</th>
                      <th className="py-1.5 text-right">Phase</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {sim.basisStates.map((st) => (
                      <tr
                        key={st.label}
                        className={st.prob > 0.01 ? 'text-zinc-200' : 'text-zinc-600'}
                      >
                        <td className="py-1.5">{st.label}</td>
                        <td className="py-1.5">{formatComplex(st.re, st.im)}</td>
                        <td className="py-1.5 text-right">{(st.prob * 100).toFixed(1)}%</td>
                        <td className="py-1.5 text-right">{st.phaseDeg.toFixed(0)}°</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
