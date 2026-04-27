/**
 * /calc — closed-form electronics calculators.
 *
 * Per PLAN §8: pure-JS calculators with no AI cost. Each card is a tiny form
 * with engineering-prefix-tolerant inputs (so users can type "10k" instead
 * of "10000") and a result panel showing the formula, the answer, and a
 * citation reference.
 *
 * Why one page with all calculators instead of /calc/[op]: at 12 functions
 * the cognitive load is fine on a single scrollable page, and engineers
 * frequently want to chain values across calculators (compute Vout from a
 * divider, then plug Vout into Ohm's law). One page = no nav round-trips.
 *
 * Auth: not gated. Calculators are useful even before sign-in. (If we ever
 * add per-call rate limits we'll move them into authenticated.)
 */

import type { Metadata } from 'next';
import { CalcCards } from './calc-cards';

export const metadata: Metadata = {
  title: 'Calculators',
  description:
    'Closed-form electronics calculators — Ohm, dividers, RC/RL, reactance, resonance, op-amp gain.',
};

export default function CalcPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-5xl flex-col px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Calculators</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Closed-form, deterministic, zero-AI-cost. Type values with engineering
          prefixes — &ldquo;10k&rdquo;, &ldquo;100n&rdquo;, &ldquo;4.7µ&rdquo;
          all work. Every result shows the formula and a textbook citation.
        </p>
      </header>

      <div className="mt-8">
        <CalcCards />
      </div>

      <footer className="mt-12 pt-8 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        SI units throughout (V, A, Ω, F, H, Hz, s). All formulas independently
        verifiable — see Sedra/Smith, Horowitz/Hill, or Razavi for derivations.
      </footer>
    </main>
  );
}
