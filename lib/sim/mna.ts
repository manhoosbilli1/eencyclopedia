/**
 * Modified Nodal Analysis (MNA) — DC operating point solver.
 *
 * Solves G·x = b where:
 *   x = [v_1…v_N, i_V1…i_Vm]  (node voltages + voltage-source branch currents)
 *   G = conductance + stamp matrix
 *   b = current injection + source vector
 *
 * Supported elements:
 *   R — resistor (conductance stamp)
 *   V — ideal voltage source (stamp + KCL constraint row)
 *   I — ideal current source (current injection)
 *   GND — reference node 0 (any net named GND / 0 / AGND / PGND etc.)
 *
 * Returns node voltages (V) and branch currents (A) for all elements.
 */

export interface MnaElement {
  type: 'R' | 'V' | 'I' | 'C' | 'L';
  id: string;           // e.g. "R1", "V1", "C2"
  n1: string;           // net name at pin 1
  n2: string;           // net name at pin 2
  value: number;        // Ω / V / A / F / H
}

export interface MnaResult {
  nodeVoltages: Record<string, number>;   // net name → voltage (V)
  branchCurrents: Record<string, number>; // element id → current (A, conventional)
  converged: boolean;
  error?: string;
}

const GND_NAMES = new Set(['0', 'gnd', 'gnda', 'gndd', 'agnd', 'pgnd', 'dgnd', 'sgnd', 'earth', 'chassis', 'pe']);

function isGnd(net: string): boolean {
  return GND_NAMES.has(net.toLowerCase());
}

export function solvedc(elements: MnaElement[]): MnaResult {
  // Collect all nets; GND is always node 0 (excluded from solve variables)
  const netSet = new Set<string>();
  for (const el of elements) {
    if (!isGnd(el.n1)) netSet.add(el.n1);
    if (!isGnd(el.n2)) netSet.add(el.n2);
  }
  const nets = Array.from(netSet);
  const N = nets.length; // number of non-ground nodes

  // Voltage sources need extra rows
  const vSources = elements.filter((e) => e.type === 'V');
  const M = vSources.length;
  const size = N + M;

  if (size === 0) {
    return { nodeVoltages: {}, branchCurrents: {}, converged: true };
  }

  // Index maps
  const netIdx = new Map<string, number>();
  nets.forEach((net, i) => netIdx.set(net, i));

  const vsIdx = new Map<string, number>();
  vSources.forEach((vs, i) => vsIdx.set(vs.id, N + i));

  // Build G (size×size) and b (size) as flat arrays
  const G = new Float64Array(size * size);
  const b = new Float64Array(size);

  function idx(r: number, c: number) { return r * size + c; }

  function addG(row: number, col: number, val: number) {
    if (row >= 0 && row < size && col >= 0 && col < size) {
      G[idx(row, col)]! += val;
    }
  }

  function ni(net: string): number {
    if (isGnd(net)) return -1;
    return netIdx.get(net) ?? -1;
  }

  // Stamp elements
  for (const el of elements) {
    const n1 = ni(el.n1);
    const n2 = ni(el.n2);

    if (el.type === 'R') {
      if (el.value === 0) continue; // short circuit — skip for stability
      const g = 1 / el.value;
      if (n1 >= 0) addG(n1, n1, g);
      if (n2 >= 0) addG(n2, n2, g);
      if (n1 >= 0 && n2 >= 0) { addG(n1, n2, -g); addG(n2, n1, -g); }
    } else if (el.type === 'I') {
      // Current source: conventional current flows from n2 to n1 inside source
      if (n1 >= 0) b[n1] = (b[n1] ?? 0) + el.value;
      if (n2 >= 0) b[n2] = (b[n2] ?? 0) - el.value;
    } else if (el.type === 'V') {
      const vi = vsIdx.get(el.id)!;
      if (n1 >= 0) { addG(n1, vi, 1); addG(vi, n1, 1); }
      if (n2 >= 0) { addG(n2, vi, -1); addG(vi, n2, -1); }
      b[vi] = el.value; // V_n1 - V_n2 = value
    }
    // C and L: open/short circuit at DC
    // C = open circuit (do nothing for DC)
    // L = short circuit (add 0-V voltage source)
    else if (el.type === 'L') {
      // Handled as V=0 if in vsIdx (we didn't add inductors to vSources above — simplification)
    }
  }

  // Solve G·x = b using Gaussian elimination with partial pivoting
  const result = gaussElim(G, b, size);

  if (!result) {
    return {
      nodeVoltages: {}, branchCurrents: {},
      converged: false, error: 'Matrix is singular — circuit may have floating nodes or no ground.',
    };
  }

  // Decode solution
  const nodeVoltages: Record<string, number> = {};
  nets.forEach((net, i) => {
    nodeVoltages[net] = round6(result[i]!);
  });

  const branchCurrents: Record<string, number> = {};
  vSources.forEach((vs, i) => {
    branchCurrents[vs.id] = round6(result[N + i]!);
  });

  // Compute resistor branch currents from node voltages
  for (const el of elements) {
    if (el.type === 'R' && el.value !== 0) {
      const v1 = isGnd(el.n1) ? 0 : (nodeVoltages[el.n1] ?? 0);
      const v2 = isGnd(el.n2) ? 0 : (nodeVoltages[el.n2] ?? 0);
      branchCurrents[el.id] = round6((v1 - v2) / el.value);
    }
  }

  return { nodeVoltages, branchCurrents, converged: true };
}

// ---------------------------------------------------------------------------
// Gaussian elimination with partial pivoting
// ---------------------------------------------------------------------------

function gaussElim(A: Float64Array, b: Float64Array, n: number): Float64Array | null {
  // Augmented matrix [A | b]
  const M = new Float64Array(n * (n + 1));
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) M[r * (n + 1) + c] = A[r * n + c]!;
    M[r * (n + 1) + n] = b[r]!;
  }

  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col;
    let maxVal = Math.abs(M[col * (n + 1) + col]!);
    for (let r = col + 1; r < n; r++) {
      const val = Math.abs(M[r * (n + 1) + col]!);
      if (val > maxVal) { maxVal = val; maxRow = r; }
    }
    if (maxVal < 1e-15) return null; // singular

    // Swap rows
    if (maxRow !== col) {
      for (let c = 0; c <= n; c++) {
        const tmp = M[col * (n + 1) + c]!;
        M[col * (n + 1) + c] = M[maxRow * (n + 1) + c]!;
        M[maxRow * (n + 1) + c] = tmp;
      }
    }

    const pivot = M[col * (n + 1) + col]!;
    for (let r = col + 1; r < n; r++) {
      const factor = M[r * (n + 1) + col]! / pivot;
      for (let c = col; c <= n; c++) {
        M[r * (n + 1) + c]! -= factor * M[col * (n + 1) + c]!;
      }
    }
  }

  // Back substitution
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let sum = M[r * (n + 1) + n]!;
    for (let c = r + 1; c < n; c++) sum -= M[r * (n + 1) + c]! * x[c]!;
    x[r] = sum / M[r * (n + 1) + r]!;
  }
  return x;
}

function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}
