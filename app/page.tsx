/**
 * Landing page — closed beta CTA. Intentionally bare during the 7-day sprint.
 * Real marketing copy lands at V1 once there's something to show.
 */

import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

const beats = [
  {
    h: 'Search circuits, not just parts.',
    p: 'Library of curated reference designs — filters, supply, topology, citations included.',
  },
  {
    h: 'Upload .kicad_sch, get a render + summary.',
    p: 'KiCad S-expression parser → SVG render → AI explanation of what the circuit does.',
  },
  {
    h: 'Ask the AI. Backed by textbooks.',
    p: 'EE-tuned system prompts, retrieval grounded in standard references, math derivations included.',
  },
  {
    h: 'Trivial calculators that show the work.',
    p: 'Ohm, dividers, RC/RL, reactance, resonance, op-amp gains — every answer cites the formula and units.',
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6 py-12">
      <header className="flex items-center justify-between">
        <Link href="/" className="font-mono text-sm tracking-tight">
          eencyclopedia
        </Link>
        <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          closed beta
        </span>
      </header>

      <section className="mt-16">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Circuits, fast.
        </h1>
        <p className="mt-4 max-w-prose text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          A reference, search, and AI-analysis tool for working electronics
          engineers. Built by an EE who got tired of grepping old projects.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/login"
            className={cn(
              'inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground',
              'transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            )}
          >
            Request beta access
          </Link>
          <Link
            href="https://github.com/"
            className="inline-flex h-10 items-center rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-muted"
          >
            Source &amp; docs
          </Link>
        </div>
      </section>

      <section className="mt-16 grid gap-6 sm:grid-cols-2">
        {beats.map((b) => (
          <article key={b.h} className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-semibold tracking-tight">{b.h}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{b.p}</p>
          </article>
        ))}
      </section>

      <footer className="mt-auto pt-16 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        <p>
          AI-assisted output. Verify against datasheets and standards before
          fabrication. © {new Date().getFullYear()} eencyclopedia.
        </p>
      </footer>
    </main>
  );
}
