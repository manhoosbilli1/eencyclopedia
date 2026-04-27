'use client';

/**
 * Client-side calculator cards. Each card is a small form that runs the
 * corresponding calc function on submit, displaying the result, the formula
 * (rendered as plain monospace until we add KaTeX in V1), and the citation.
 *
 * All inputs use the engineering-prefix parser (10k → 10000), so the user
 * doesn't have to convert in their head. Errors from the parser display
 * inline.
 *
 * No persistence — each session starts fresh. If users want to save a
 * scenario we'll add per-card localStorage in V1.
 */

import { useState, type FormEvent } from 'react';
import {
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
  type CalcResult,
} from '@/lib/calc';
import { parseEng, formatEng, UnitParseError } from '@/lib/calc/units';

interface FieldSpec {
  name: string;
  label: string;
  placeholder: string;
  /** Pre-fill helper. Used for a default scenario on the first render. */
  defaultValue?: string;
  /** If true, the field can be left empty (used for ohm()'s solve-for). */
  optional?: boolean;
}

interface CardSpec {
  id: string;
  title: string;
  blurb: string;
  fields: FieldSpec[];
  /**
   * Compute the result. Receives a record of parsed numbers (NaN for empty
   * optional fields) and returns either a CalcResult or throws.
   */
  compute: (values: Record<string, number>) => CalcResult;
}

const CARDS: CardSpec[] = [
  {
    id: 'ohm',
    title: "Ohm's law",
    blurb: 'Solve V, I, or R given any two. Leave the unknown blank.',
    fields: [
      { name: 'V', label: 'V (volts)', placeholder: '5', optional: true },
      { name: 'I', label: 'I (amps)', placeholder: '0.001', optional: true },
      { name: 'R', label: 'R (ohms)', placeholder: '5k', optional: true },
    ],
    compute: ({ V, I, R }) => {
      const filled = [V, I, R].filter((v) => Number.isFinite(v));
      if (filled.length !== 2) {
        throw new Error('Provide exactly two of V, I, R; leave the third blank.');
      }
      return ohm({
        V: Number.isFinite(V) ? V : undefined,
        I: Number.isFinite(I) ? I : undefined,
        R: Number.isFinite(R) ? R : undefined,
      });
    },
  },
  {
    id: 'voltageDivider',
    title: 'Voltage divider',
    blurb: 'V_out = V_in · R2 / (R1 + R2). For unloaded outputs.',
    fields: [
      { name: 'Vin', label: 'V_in (volts)', placeholder: '5' },
      { name: 'R1', label: 'R1 (ohms)', placeholder: '10k' },
      { name: 'R2', label: 'R2 (ohms)', placeholder: '10k' },
    ],
    compute: ({ Vin, R1, R2 }) => voltageDivider({ Vin, R1, R2 }),
  },
  {
    id: 'currentDivider',
    title: 'Current divider',
    blurb: 'I through R1 from a parallel branch (I_total, R1, R2 in parallel).',
    fields: [
      { name: 'Itotal', label: 'I_total (amps)', placeholder: '10m' },
      { name: 'R1', label: 'R1 (ohms)', placeholder: '1k' },
      { name: 'R2', label: 'R2 (ohms)', placeholder: '4.7k' },
    ],
    compute: ({ Itotal, R1, R2 }) => currentDivider({ Itotal, R1, R2 }),
  },
  {
    id: 'rcTau',
    title: 'RC time constant',
    blurb: 'τ = R · C. Charge to 1−1/e (≈63 %) in one τ.',
    fields: [
      { name: 'R', label: 'R (ohms)', placeholder: '10k' },
      { name: 'C', label: 'C (farads)', placeholder: '100n' },
    ],
    compute: ({ R, C }) => rcTau({ R, C }),
  },
  {
    id: 'rlTau',
    title: 'RL time constant',
    blurb: 'τ = L / R. Current rises to ≈63 % in one τ.',
    fields: [
      { name: 'R', label: 'R (ohms)', placeholder: '10' },
      { name: 'L', label: 'L (henries)', placeholder: '1m' },
    ],
    compute: ({ R, L }) => rlTau({ R, L }),
  },
  {
    id: 'ledResistor',
    title: 'LED current-limit resistor',
    blurb: 'R = (V_supply − V_f) / I_f. Pick the next standard value above.',
    fields: [
      { name: 'Vsupply', label: 'V_supply (volts)', placeholder: '5' },
      { name: 'Vf', label: 'V_f (volts)', placeholder: '2.0' },
      { name: 'If', label: 'I_f (amps)', placeholder: '20m' },
    ],
    compute: ({ Vsupply, Vf, If }) => ledResistor({ Vsupply, Vf, If }),
  },
  {
    id: 'invertingGain',
    title: 'Op-amp inverting gain',
    blurb: 'A = −R_f / R_in.',
    fields: [
      { name: 'Rf', label: 'R_f (ohms)', placeholder: '100k' },
      { name: 'Rin', label: 'R_in (ohms)', placeholder: '10k' },
    ],
    compute: ({ Rf, Rin }) => opampGain.inverting({ Rf, Rin }),
  },
  {
    id: 'nonInvertingGain',
    title: 'Op-amp non-inverting gain',
    blurb: 'A = 1 + R_f / R_in.',
    fields: [
      { name: 'Rf', label: 'R_f (ohms)', placeholder: '100k' },
      { name: 'Rin', label: 'R_in (ohms)', placeholder: '10k' },
    ],
    compute: ({ Rf, Rin }) => opampGain.nonInverting({ Rf, Rin }),
  },
  {
    id: 'Xc',
    title: 'Capacitive reactance',
    blurb: 'X_C = 1 / (2π f C).',
    fields: [
      { name: 'f', label: 'f (Hz)', placeholder: '1k' },
      { name: 'C', label: 'C (farads)', placeholder: '100n' },
    ],
    compute: ({ f, C }) => reactance.Xc({ f, C }),
  },
  {
    id: 'Xl',
    title: 'Inductive reactance',
    blurb: 'X_L = 2π f L.',
    fields: [
      { name: 'f', label: 'f (Hz)', placeholder: '1k' },
      { name: 'L', label: 'L (henries)', placeholder: '1m' },
    ],
    compute: ({ f, L }) => reactance.Xl({ f, L }),
  },
  {
    id: 'resonance',
    title: 'LC resonance',
    blurb: 'f₀ = 1 / (2π √(L·C)). Lossless, no Q.',
    fields: [
      { name: 'L', label: 'L (henries)', placeholder: '10u' },
      { name: 'C', label: 'C (farads)', placeholder: '100n' },
    ],
    compute: ({ L, C }) => resonance({ L, C }),
  },
  {
    id: 'cutoffFreq',
    title: 'RC cut-off frequency (−3 dB)',
    blurb: 'f_c = 1 / (2π R C).',
    fields: [
      { name: 'R', label: 'R (ohms)', placeholder: '10k' },
      { name: 'C', label: 'C (farads)', placeholder: '100n' },
    ],
    compute: ({ R, C }) => cutoffFreq({ R, C }),
  },
];

export function CalcCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {CARDS.map((card) => (
        <CalcCard key={card.id} spec={card} />
      ))}
    </div>
  );
}

function CalcCard({ spec }: { spec: CardSpec }) {
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    const formData = new FormData(event.currentTarget);
    const values: Record<string, number> = {};
    try {
      for (const field of spec.fields) {
        const raw = formData.get(field.name);
        const str = typeof raw === 'string' ? raw : '';
        const parsed = parseEng(str);
        if (!Number.isFinite(parsed) && !field.optional) {
          throw new Error(`${field.label} is required.`);
        }
        values[field.name] = parsed;
      }
      const r = spec.compute(values);
      setResult(r);
    } catch (err: unknown) {
      if (err instanceof UnitParseError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Calculation failed.');
      }
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <div>
        <h3 className="text-sm font-semibold tracking-tight">{spec.title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{spec.blurb}</p>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {spec.fields.map((field) => (
          <label key={field.name} className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{field.label}</span>
            <input
              type="text"
              name={field.name}
              defaultValue={field.defaultValue}
              placeholder={field.placeholder}
              autoComplete="off"
              spellCheck={false}
              className="h-8 rounded-md border border-border bg-background px-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        ))}
      </div>

      <button
        type="submit"
        className="h-8 rounded-md bg-primary px-3 font-mono text-[11px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
      >
        Calculate
      </button>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1.5 text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}

      {result ? <ResultPanel r={result} /> : null}
    </form>
  );
}

function ResultPanel({ r }: { r: CalcResult }) {
  return (
    <div className="mt-1 rounded-md border border-border/60 bg-muted/40 p-3">
      <p className="font-mono text-base font-semibold text-foreground">
        {Number.isFinite(r.value)
          ? formatResult(r.value as number, r.unit)
          : String(r.value)}
      </p>
      {r.steps.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {r.steps.map((step, i) => (
            <li key={i}>
              {step.text}
              {step.math ? (
                <code className="ml-2 rounded bg-background px-1.5 py-0.5 font-mono text-[11px]">
                  {step.math}
                </code>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {r.citation ? (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {r.citation}
        </p>
      ) : null}
    </div>
  );
}

function formatResult(value: number, unit: string): string {
  // Unit strings from calc/index.ts can be 'V', 'A', 'Ω', 'F', 'H', 'Hz', 's',
  // 'W', 'V/V', 'A/A', '°', 'unitless'. The eng formatter only makes sense
  // for SI base units; ratios print directly.
  const ratioUnits = new Set(['V/V', 'A/A', '°', 'unitless']);
  if (ratioUnits.has(unit)) {
    return `${value.toPrecision(4)} ${unit === 'unitless' ? '' : unit}`.trim();
  }
  return formatEng(value, unit);
}
