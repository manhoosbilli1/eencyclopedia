/**
 * eencyclopedia — closed-form electronics calculators.
 *
 * Pure JavaScript. No AI cost. These are exposed:
 *   - As REST endpoints under /api/calc/[op]
 *   - As Claude tools (lib/ai/tools.ts wraps these)
 *   - As library functions used by the UI calculator page
 *
 * Conventions:
 *   - All inputs/outputs in SI base units (V, A, Ω, F, H, Hz, s, W).
 *     Convert at the UI boundary, not here.
 *   - Functions throw `CalcError` on physically impossible inputs.
 *   - Each function returns a `CalcResult` with value, unit, derivation steps,
 *     and a citation reference (textbook/section).
 *   - Internal precision is `number` (IEEE-754 double). For component-tolerance
 *     analysis we'd need interval arithmetic; that's a V2 concern.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Unit =
  | 'V' | 'A' | 'Ω' | 'F' | 'H' | 'Hz' | 's' | 'W'
  | 'V/V' | 'A/A' | '°' | 'unitless';

export interface CalcStep {
  /** Human-readable explanation, can include $..$ inline KaTeX. */
  text: string;
  /** Optional KaTeX expression (without delimiters). */
  math?: string;
}

export interface CalcResult<T = number> {
  value: T;
  unit: Unit;
  steps: CalcStep[];
  /** Citation: e.g. "Sedra/Smith §1.5, Ohm's law". */
  citation?: string;
  /** Caveats / assumptions. */
  caveats?: string[];
}

export class CalcError extends Error {
  constructor(message: string, public readonly inputs: Record<string, unknown>) {
    super(message);
    this.name = 'CalcError';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const requireFinite = (name: string, x: unknown): number => {
  if (typeof x !== 'number' || !Number.isFinite(x)) {
    throw new CalcError(`${name} must be a finite number`, { [name]: x });
  }
  return x;
};

const requirePositive = (name: string, x: unknown): number => {
  const v = requireFinite(name, x);
  if (v <= 0) throw new CalcError(`${name} must be > 0`, { [name]: v });
  return v;
};

const requireNonNegative = (name: string, x: unknown): number => {
  const v = requireFinite(name, x);
  if (v < 0) throw new CalcError(`${name} must be ≥ 0`, { [name]: v });
  return v;
};

// ---------------------------------------------------------------------------
// Ohm's law — solve for the missing variable.
//   V = I * R
// ---------------------------------------------------------------------------

export function ohm(input: { V?: number; I?: number; R?: number }): CalcResult {
  const provided = (['V', 'I', 'R'] as const).filter(k => input[k] !== undefined);
  if (provided.length !== 2) {
    throw new CalcError('ohm() requires exactly 2 of {V, I, R}', input);
  }

  if (input.V === undefined) {
    const I = requireFinite('I', input.I);
    const R = requirePositive('R', input.R);
    const V = I * R;
    return {
      value: V, unit: 'V',
      steps: [
        { text: "Apply Ohm's law:", math: 'V = I \\cdot R' },
        { text: `Substitute: $V = ${I}\\,\\text{A} \\cdot ${R}\\,\\Omega = ${V}\\,\\text{V}$` },
      ],
      citation: 'Ohm 1827; Sedra/Smith §1.5',
    };
  }
  if (input.I === undefined) {
    const V = requireFinite('V', input.V);
    const R = requirePositive('R', input.R);
    const I = V / R;
    return {
      value: I, unit: 'A',
      steps: [
        { text: "Solve Ohm's law for I:", math: 'I = V / R' },
        { text: `Substitute: $I = ${V}\\,\\text{V} / ${R}\\,\\Omega = ${I}\\,\\text{A}$` },
      ],
      citation: 'Ohm 1827; Sedra/Smith §1.5',
    };
  }
  // R missing
  const V = requireFinite('V', input.V);
  const I = requireFinite('I', input.I);
  if (I === 0) throw new CalcError('R undefined when I = 0', input);
  const R = V / I;
  return {
    value: R, unit: 'Ω',
    steps: [
      { text: "Solve Ohm's law for R:", math: 'R = V / I' },
      { text: `Substitute: $R = ${V}\\,\\text{V} / ${I}\\,\\text{A} = ${R}\\,\\Omega$` },
    ],
    citation: 'Ohm 1827; Sedra/Smith §1.5',
  };
}

// ---------------------------------------------------------------------------
// Voltage divider (unloaded).
//   Vout = Vin * R2 / (R1 + R2)
// ---------------------------------------------------------------------------

export function voltageDivider(input: { Vin: number; R1: number; R2: number }): CalcResult {
  const Vin = requireFinite('Vin', input.Vin);
  const R1 = requirePositive('R1', input.R1);
  const R2 = requirePositive('R2', input.R2);
  const Vout = (Vin * R2) / (R1 + R2);
  return {
    value: Vout, unit: 'V',
    steps: [
      { text: 'Unloaded voltage divider:', math: 'V_{out} = V_{in} \\cdot \\frac{R_2}{R_1 + R_2}' },
      { text: `Substitute: $V_{out} = ${Vin}\\,\\text{V} \\cdot ${R2} / (${R1} + ${R2}) = ${Vout}\\,\\text{V}$` },
    ],
    citation: 'Sedra/Smith §1.5; Horowitz/Hill §1.2.3',
    caveats: [
      'Assumes the load impedance ≫ R2. If a load draws significant current the formula understates the droop.',
      'Tolerance stack: with 1% resistors, expected V_out tolerance ≈ ±2%.',
    ],
  };
}

// ---------------------------------------------------------------------------
// Current divider (parallel resistors).
//   I1 = Itotal * R2 / (R1 + R2)   (current through R1)
// ---------------------------------------------------------------------------

export function currentDivider(input: { Itotal: number; R1: number; R2: number }): CalcResult {
  const I = requireFinite('Itotal', input.Itotal);
  const R1 = requirePositive('R1', input.R1);
  const R2 = requirePositive('R2', input.R2);
  const I1 = (I * R2) / (R1 + R2);
  return {
    value: I1, unit: 'A',
    steps: [
      { text: 'Current divider rule for R1 (with R1 ‖ R2):', math: 'I_{R_1} = I_{total} \\cdot \\frac{R_2}{R_1 + R_2}' },
      { text: `Substitute: $I_{R_1} = ${I}\\,\\text{A} \\cdot ${R2} / (${R1} + ${R2}) = ${I1}\\,\\text{A}$` },
    ],
    citation: 'Sedra/Smith §1.5',
  };
}

// ---------------------------------------------------------------------------
// RC time constant. τ = R * C
// ---------------------------------------------------------------------------

export function rcTau(input: { R: number; C: number }): CalcResult {
  const R = requirePositive('R', input.R);
  const C = requirePositive('C', input.C);
  const tau = R * C;
  return {
    value: tau, unit: 's',
    steps: [
      { text: 'RC time constant:', math: '\\tau = R \\cdot C' },
      { text: `Substitute: $\\tau = ${R}\\,\\Omega \\cdot ${C}\\,\\text{F} = ${tau}\\,\\text{s}$` },
      { text: 'Practical: capacitor reaches ~63% in 1τ, ~99% in 5τ.' },
    ],
    citation: 'Horowitz/Hill §1.4.2',
  };
}

// ---------------------------------------------------------------------------
// RL time constant. τ = L / R
// ---------------------------------------------------------------------------

export function rlTau(input: { R: number; L: number }): CalcResult {
  const R = requirePositive('R', input.R);
  const L = requirePositive('L', input.L);
  const tau = L / R;
  return {
    value: tau, unit: 's',
    steps: [
      { text: 'RL time constant:', math: '\\tau = L / R' },
      { text: `Substitute: $\\tau = ${L}\\,\\text{H} / ${R}\\,\\Omega = ${tau}\\,\\text{s}$` },
    ],
    citation: 'Horowitz/Hill §1.4.2',
  };
}

// ---------------------------------------------------------------------------
// LED current-limit resistor.
//   R = (Vsupply - Vf) / If
// ---------------------------------------------------------------------------

export function ledResistor(input: { Vsupply: number; Vf: number; If: number }): CalcResult {
  const Vs = requireFinite('Vsupply', input.Vsupply);
  const Vf = requireNonNegative('Vf', input.Vf);
  const If_ = requirePositive('If', input.If);
  if (Vs <= Vf) {
    throw new CalcError(`Vsupply (${Vs} V) must exceed Vf (${Vf} V) for the LED to conduct`, input);
  }
  const R = (Vs - Vf) / If_;
  const Pdiss = (Vs - Vf) * If_; // power dissipated in the resistor
  return {
    value: R, unit: 'Ω',
    steps: [
      { text: 'Voltage across the resistor:', math: 'V_R = V_{supply} - V_f' },
      { text: 'Apply Ohm\'s law:', math: 'R = (V_{supply} - V_f) / I_f' },
      { text: `Substitute: $R = (${Vs} - ${Vf}) / ${If_} = ${R}\\,\\Omega$` },
      { text: `Power dissipation in R: $P_R = V_R \\cdot I_f = ${Pdiss}\\,\\text{W}$ — pick a resistor rated ≥ ${(Pdiss * 2).toPrecision(2)} W (2× margin).` },
    ],
    citation: 'Horowitz/Hill §1.2.6',
    caveats: [
      'If varies with temperature; pick at worst-case (max ambient).',
      'For batteries: as Vsupply sags, current drops; consider a constant-current driver for tight regulation.',
    ],
  };
}

// ---------------------------------------------------------------------------
// Op-amp gain — ideal (infinite open-loop, infinite Zin, zero Zout).
// ---------------------------------------------------------------------------

export const opampGain = {
  inverting(Rf: number, Rin: number): CalcResult {
    Rf = requirePositive('Rf', Rf);
    Rin = requirePositive('Rin', Rin);
    const G = -Rf / Rin;
    return {
      value: G, unit: 'V/V',
      steps: [
        { text: 'Inverting amplifier (ideal op-amp):', math: 'A_v = -\\frac{R_f}{R_{in}}' },
        { text: `Substitute: $A_v = -${Rf} / ${Rin} = ${G}$` },
      ],
      citation: 'Sedra/Smith §2.2; Horowitz/Hill §4.2.4',
      caveats: [
        'Bandwidth is limited by op-amp GBW: $f_{−3dB} \\approx GBW / |A_v|$.',
        'Input impedance ≈ Rin (low). For high Zin, use non-inverting topology.',
      ],
    };
  },

  nonInverting(Rf: number, Rg: number): CalcResult {
    Rf = requirePositive('Rf', Rf);
    Rg = requirePositive('Rg', Rg);
    const G = 1 + Rf / Rg;
    return {
      value: G, unit: 'V/V',
      steps: [
        { text: 'Non-inverting amplifier (ideal op-amp):', math: 'A_v = 1 + \\frac{R_f}{R_g}' },
        { text: `Substitute: $A_v = 1 + ${Rf} / ${Rg} = ${G}$` },
      ],
      citation: 'Sedra/Smith §2.3; Horowitz/Hill §4.2.5',
      caveats: [
        'Input impedance is very high (op-amp Zin), so ideal for sensors.',
        'Minimum gain is +1; for true unity, short Rf and remove Rg (voltage follower).',
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// Reactance.
//   Xc = 1 / (2π f C)
//   Xl = 2π f L
// ---------------------------------------------------------------------------

export const reactance = {
  Xc(f: number, C: number): CalcResult {
    f = requirePositive('f', f);
    C = requirePositive('C', C);
    const Xc = 1 / (2 * Math.PI * f * C);
    return {
      value: Xc, unit: 'Ω',
      steps: [
        { text: 'Capacitive reactance:', math: 'X_C = \\frac{1}{2\\pi f C}' },
        { text: `Substitute: $X_C = 1 / (2\\pi \\cdot ${f} \\cdot ${C}) = ${Xc.toPrecision(4)}\\,\\Omega$` },
      ],
      citation: 'Pozar §2.2',
    };
  },
  Xl(f: number, L: number): CalcResult {
    f = requirePositive('f', f);
    L = requirePositive('L', L);
    const Xl = 2 * Math.PI * f * L;
    return {
      value: Xl, unit: 'Ω',
      steps: [
        { text: 'Inductive reactance:', math: 'X_L = 2\\pi f L' },
        { text: `Substitute: $X_L = 2\\pi \\cdot ${f} \\cdot ${L} = ${Xl.toPrecision(4)}\\,\\Omega$` },
      ],
      citation: 'Pozar §2.2',
    };
  },
};

// ---------------------------------------------------------------------------
// LC resonance.
//   f0 = 1 / (2π √(LC))
// ---------------------------------------------------------------------------

export function resonance(input: { L: number; C: number }): CalcResult {
  const L = requirePositive('L', input.L);
  const C = requirePositive('C', input.C);
  const f0 = 1 / (2 * Math.PI * Math.sqrt(L * C));
  return {
    value: f0, unit: 'Hz',
    steps: [
      { text: 'Lossless LC resonance:', math: 'f_0 = \\frac{1}{2\\pi \\sqrt{LC}}' },
      { text: `Substitute: $f_0 = 1 / (2\\pi \\sqrt{${L} \\cdot ${C}}) = ${f0.toPrecision(4)}\\,\\text{Hz}$` },
    ],
    citation: 'Pozar §6.1',
    caveats: [
      'Real circuits have ESR, dielectric loss, and core loss; observed Q is finite.',
      'For a parallel tank loaded by R: $f_0$ shifts slightly; use Q = R √(C/L).',
    ],
  };
}

// ---------------------------------------------------------------------------
// First-order RC cutoff frequency.
//   fc = 1 / (2π R C)
// ---------------------------------------------------------------------------

export function cutoffFreq(input: { R: number; C: number }): CalcResult {
  const R = requirePositive('R', input.R);
  const C = requirePositive('C', input.C);
  const fc = 1 / (2 * Math.PI * R * C);
  return {
    value: fc, unit: 'Hz',
    steps: [
      { text: 'First-order RC cutoff (-3 dB):', math: 'f_c = \\frac{1}{2\\pi R C}' },
      { text: `Substitute: $f_c = 1 / (2\\pi \\cdot ${R} \\cdot ${C}) = ${fc.toPrecision(4)}\\,\\text{Hz}$` },
    ],
    citation: 'Horowitz/Hill §1.7.1',
    caveats: [
      'This is -3 dB (~70.7% amplitude). For -6 dB use 2× this frequency.',
      'Roll-off is 20 dB/decade above fc.',
    ],
  };
}

// ---------------------------------------------------------------------------
// Catalogue — used by tool registration.
// ---------------------------------------------------------------------------

export const calc = {
  ohm,
  voltageDivider,
  currentDivider,
  rcTau,
  rlTau,
  ledResistor,
  opampGain,
  reactance,
  resonance,
  cutoffFreq,
} as const;

export type CalcOp =
  | 'ohm'
  | 'voltageDivider'
  | 'currentDivider'
  | 'rcTau'
  | 'rlTau'
  | 'ledResistor'
  | 'opampGain.inverting'
  | 'opampGain.nonInverting'
  | 'reactance.Xc'
  | 'reactance.Xl'
  | 'resonance'
  | 'cutoffFreq';
