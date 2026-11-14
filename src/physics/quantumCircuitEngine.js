/**
 * Pure-JS Complex State-Vector Quantum Circuit Simulator (2 to 4 qubits).
 * Supports single-qubit gates (H, X, Y, Z, S, T, Rx, Ry, Rz), CNOT,
 * 3-qubit CCZ (for Grover oracle/diffusion), Born-rule sampling, and
 * depolarizing gate-fidelity estimation.
 */

const INV_SQRT2 = 1 / Math.SQRT2;

/**
 * Create a |0...0> computational basis state vector for `numQubits`.
 */
export function createZeroState(numQubits) {
  const dim = 1 << numQubits;
  const re = new Float64Array(dim);
  const im = new Float64Array(dim);
  re[0] = 1.0;
  return { re, im, numQubits };
}

/**
 * Return 2x2 unitary matrix [u00r, u00i, u01r, u01i, u10r, u10i, u11r, u11i]
 */
function getSingleQubitMatrix(gate, theta = Math.PI / 2) {
  switch (gate) {
    case 'H':
      return [INV_SQRT2, 0, INV_SQRT2, 0, INV_SQRT2, 0, -INV_SQRT2, 0];
    case 'X':
      return [0, 0, 1, 0, 1, 0, 0, 0];
    case 'Y':
      return [0, 0, 0, -1, 0, 1, 0, 0];
    case 'Z':
      return [1, 0, 0, 0, 0, 0, -1, 0];
    case 'S': // Phase pi/2
      return [1, 0, 0, 0, 0, 0, 0, 1];
    case 'T': // Phase pi/4
      return [1, 0, 0, 0, 0, 0, INV_SQRT2, INV_SQRT2];
    case 'Rx': {
      const c = Math.cos(theta / 2);
      const s = Math.sin(theta / 2);
      return [c, 0, 0, -s, 0, -s, c, 0];
    }
    case 'Ry': {
      const c = Math.cos(theta / 2);
      const s = Math.sin(theta / 2);
      return [c, 0, -s, 0, s, 0, c, 0];
    }
    case 'Rz': {
      const c = Math.cos(theta / 2);
      const s = Math.sin(theta / 2);
      return [c, -s, 0, 0, 0, 0, c, s];
    }
    default:
      return [1, 0, 0, 0, 0, 0, 1, 0];
  }
}

/**
 * Apply a 2x2 single-qubit gate to `target` (0 = MSB / q0, numQubits-1 = LSB).
 */
export function applySingleQubitGate(state, gate, target, theta = Math.PI / 2) {
  const { re, im, numQubits } = state;
  const dim = 1 << numQubits;
  const bit = numQubits - 1 - target;
  const step = 1 << bit;
  const [u00r, u00i, u01r, u01i, u10r, u10i, u11r, u11i] = getSingleQubitMatrix(gate, theta);

  for (let base = 0; base < dim; base += step << 1) {
    for (let offset = 0; offset < step; offset++) {
      const i0 = base + offset;
      const i1 = i0 + step;

      const a0r = re[i0];
      const a0i = im[i0];
      const a1r = re[i1];
      const a1i = im[i1];

      re[i0] = u00r * a0r - u00i * a0i + (u01r * a1r - u01i * a1i);
      im[i0] = u00r * a0i + u00i * a0r + (u01r * a1i + u01i * a1r);

      re[i1] = u10r * a0r - u10i * a0i + (u11r * a1r - u11i * a1i);
      im[i1] = u10r * a0i + u10i * a0r + (u11r * a1i + u11i * a1r);
    }
  }
}

/**
 * Apply CNOT with `control` and `target` qubit indices (0-indexed from top wire q0).
 */
export function applyCNOT(state, control, target) {
  const { re, im, numQubits } = state;
  if (control === target) return;
  const dim = 1 << numQubits;
  const ctrlMask = 1 << (numQubits - 1 - control);
  const targMask = 1 << (numQubits - 1 - target);

  for (let i = 0; i < dim; i++) {
    if ((i & ctrlMask) !== 0 && (i & targMask) === 0) {
      const j = i | targMask;
      const tr = re[i];
      const ti = im[i];
      re[i] = re[j];
      im[i] = im[j];
      re[j] = tr;
      im[j] = ti;
    }
  }
}

/**
 * Apply 3-qubit CCZ (flips sign of |111> on the 3 specified qubits).
 */
export function applyCCZ(state, qA, qB, qC) {
  const { re, im, numQubits } = state;
  const dim = 1 << numQubits;
  const mask =
    (1 << (numQubits - 1 - qA)) |
    (1 << (numQubits - 1 - qB)) |
    (1 << (numQubits - 1 - qC));

  for (let i = 0; i < dim; i++) {
    if ((i & mask) === mask) {
      re[i] = -re[i];
      im[i] = -im[i];
    }
  }
}

/**
 * Execute an ordered list of gate operations on a `numQubits` register.
 * Each op: { gate, target, control?, theta?, qubits? }
 */
export function simulateCircuit(numQubits, operations, shots = 1024, gateNoise = 0.002) {
  const state = createZeroState(numQubits);
  let singleQubitCount = 0;
  let multiQubitCount = 0;
  let hasMeasurement = false;

  for (const op of operations) {
    if (op.gate === 'M') {
      hasMeasurement = true;
      continue;
    }
    if (op.gate === 'CNOT') {
      applyCNOT(state, op.control ?? 0, op.target ?? 1);
      multiQubitCount++;
    } else if (op.gate === 'CCZ') {
      const [a, b, c] = op.qubits || [0, 1, 2];
      applyCCZ(state, a, b, c);
      multiQubitCount += 3; // equivalent Toffoli/CCZ decomposition depth
    } else if (op.gate === 'ORACLE_101') {
      // Phase-flip |101> on 3-qubit register
      applySingleQubitGate(state, 'X', 1);
      applyCCZ(state, 0, 1, 2);
      applySingleQubitGate(state, 'X', 1);
      singleQubitCount += 2;
      multiQubitCount += 3;
    } else if (op.gate === 'DIFFUSER') {
      // 3-qubit Grover diffusion operator
      for (let q = 0; q < numQubits; q++) applySingleQubitGate(state, 'H', q);
      for (let q = 0; q < numQubits; q++) applySingleQubitGate(state, 'X', q);
      if (numQubits >= 3) {
        applyCCZ(state, 0, 1, 2);
        multiQubitCount += 3;
      }
      for (let q = 0; q < numQubits; q++) applySingleQubitGate(state, 'X', q);
      for (let q = 0; q < numQubits; q++) applySingleQubitGate(state, 'H', q);
      singleQubitCount += numQubits * 4;
    } else {
      applySingleQubitGate(state, op.gate, op.target ?? 0, op.theta ?? Math.PI / 2);
      singleQubitCount++;
    }
  }

  const dim = 1 << numQubits;
  const basisStates = [];
  const probabilities = [];
  const cdf = new Float64Array(dim);
  let running = 0;

  for (let i = 0; i < dim; i++) {
    const r = state.re[i];
    const m = state.im[i];
    const prob = r * r + m * m;
    const phaseRad = Math.atan2(m, r);
    const label = i.toString(2).padStart(numQubits, '0');
    running += prob;
    cdf[i] = running;
    basisStates.push({
      index: i,
      label: `|${label}⟩`,
      re: r,
      im: m,
      prob,
      phaseDeg: (phaseRad * 180) / Math.PI,
    });
    probabilities.push(prob);
  }

  // Simulated Born-rule shot sampling
  const counts = new Int32Array(dim);
  for (let s = 0; s < shots; s++) {
    const u = Math.random() * running;
    let idx = 0;
    while (idx < dim - 1 && cdf[idx] < u) idx++;
    counts[idx]++;
  }

  // Depolarizing gate fidelity estimate
  const f1q = Math.max(0.9, 1 - gateNoise * 0.4);
  const f2q = Math.max(0.8, 1 - gateNoise * 4.0);
  const estimatedFidelity =
    Math.pow(f1q, singleQubitCount) * Math.pow(f2q, multiQubitCount) * 100;

  return {
    numQubits,
    basisStates,
    probabilities,
    counts: Array.from(counts),
    shots,
    hasMeasurement,
    gateCount: operations.length,
    estimatedFidelity: Number(estimatedFidelity.toFixed(2)),
  };
}

export const CIRCUIT_PRESETS = {
  bell: {
    id: 'bell',
    name: 'Bell State |Φ+⟩',
    description: '2-qubit maximally entangled EPR pair: (|00⟩ + |11⟩) / √2',
    numQubits: 2,
    operations: [
      { gate: 'H', target: 0 },
      { gate: 'CNOT', control: 0, target: 1 },
      { gate: 'M', target: 0 },
      { gate: 'M', target: 1 },
    ],
  },
  ghz3: {
    id: 'ghz3',
    name: '3-Qubit GHZ State',
    description: 'Tripartite entanglement: (|000⟩ + |111⟩) / √2',
    numQubits: 3,
    operations: [
      { gate: 'H', target: 0 },
      { gate: 'CNOT', control: 0, target: 1 },
      { gate: 'CNOT', control: 1, target: 2 },
      { gate: 'M', target: 0 },
      { gate: 'M', target: 1 },
      { gate: 'M', target: 2 },
    ],
  },
  grover101: {
    id: 'grover101',
    name: 'Grover Oracle |101⟩',
    description: '3-qubit amplitude amplification (2 iterations) targeting |101⟩ (~94.5%)',
    numQubits: 3,
    operations: [
      { gate: 'H', target: 0 },
      { gate: 'H', target: 1 },
      { gate: 'H', target: 2 },
      { gate: 'ORACLE_101', target: 0 },
      { gate: 'DIFFUSER', target: 0 },
      { gate: 'ORACLE_101', target: 0 },
      { gate: 'DIFFUSER', target: 0 },
      { gate: 'M', target: 0 },
      { gate: 'M', target: 1 },
      { gate: 'M', target: 2 },
    ],
  },
};
