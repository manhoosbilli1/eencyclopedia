import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Features — what works, what doesn’t, what’s next',
  description: 'Live status of every feature in eencyclopedia, grouped by stage.',
};

type Status = 'live' | 'beta' | 'paused' | 'planned';

interface Feature {
  title: string;
  status: Status;
  body: string;
}

const SECTIONS: Array<{ heading: string; items: Feature[] }> = [
  {
    heading: 'Schematic ingest',
    items: [
      { status: 'live', title: 'KiCad .kicad_sch upload', body: 'Drag-or-paste; supports KiCad 7, 8, 9, and 10 file formats.' },
      { status: 'live', title: 'Pasted source upload', body: 'Paste S-expression text instead of a file — handy for quick fragments.' },
      { status: 'live', title: 'Bounding-box ingest', body: 'Surround a sub-circuit with a rectangle + an "eencyclopedia" text annotation; only that region is ingested.' },
      { status: 'live', title: 'KiCad-authentic body rendering', body: 'Uploaded circuits render with their own lib_symbols geometry — including the yellow background fill on connectors and IC bodies.' },
      { status: 'planned', title: 'Eagle / Altium import', body: 'Out of scope for V0. Track via /suggestions if you want this.' },
    ],
  },
  {
    heading: 'Schematic editor (browser)',
    items: [
      { status: 'live', title: 'Scratch editor', body: 'Click "Editor" in the navbar to open a blank canvas. ~150 symbols in the catalogue.' },
      { status: 'live', title: 'Wire / junction / no-connect / text / power tools', body: 'KiCad-style toolbar. Drag, rotate (R), mirror (X), undo/redo (Ctrl+Z/Y), copy/paste (Ctrl+C/V/D), align tools when 2+ selected.' },
      { status: 'live', title: 'Properties panel', body: 'Slides in when a single component is selected — edit Designator, Value, MPN, Footprint.' },
      { status: 'live', title: 'Symbol Browser', body: 'Searchable, categorised. Power symbols have their own popover.' },
      { status: 'beta', title: 'Open someone else’s circuit in the editor', body: 'Loads the raw .kicad_sch into the editor for browsing/editing. Save creates a fork.' },
      { status: 'planned', title: 'KiCad-authentic editor symbols', body: 'Currently the editor uses recognisable generic glyphs that round-trip to KiCad cleanly. Loading the full KiCad symbol library client-side is a follow-up.' },
    ],
  },
  {
    heading: 'Sharing &amp; collaboration',
    items: [
      { status: 'live', title: 'Visibility: public / unlisted / private', body: 'Set per circuit at upload time. RLS enforces it.' },
      { status: 'live', title: 'Spinoffs (forks)', body: 'Anyone signed in can edit any visible circuit; saving creates a new circuit linked back via a breadcrumb. fork_count is tracked.' },
      { status: 'live', title: 'Lineage breadcrumb', body: 'Each fork shows ↰ forked from <parent> · root <ancestor> · N spinoffs.' },
      { status: 'live', title: 'Stars / favourites', body: 'Per-user star and favourite tracked separately; star count denormalised on the schematic row.' },
      { status: 'live', title: 'Shared scratch links', body: 'The /schematic/new editor’s Share button publishes the JSON state to /schematic/<slug> with public read.' },
      { status: 'beta', title: 'Comments', body: 'Top-level + one level of replies. Soft-delete reserved for moderation.' },
    ],
  },
  {
    heading: 'AI &amp; search',
    items: [
      { status: 'live', title: 'AI summary on upload', body: 'Single Gemini Flash (default) or Claude Sonnet call extracts topology, rails, key components, intent, design notes.' },
      { status: 'live', title: 'Backfill button', body: 'On /library — re-runs summary + embedding for any of your circuits missing one.' },
      { status: 'live', title: 'Hybrid search', body: 'Postgres full-text on title + description + summary. Vector search via pgvector on the summary embedding (Voyage voyage-3, 1024-d).' },
      { status: 'live', title: 'AI call metering', body: 'Every call writes to ai_calls with provider, model, tokens in/out, cost, and the schematic id.' },
      { status: 'paused', title: '/chat (RAG conversation)', body: 'Disabled in closed beta — RAG retrieval, prompt-injection hardening, and provider routing are still WIP. Open to contributions.' },
      { status: 'planned', title: 'Chat per-circuit', body: 'Once /chat is back, the circuit page link will pre-load a circuit context.' },
      { status: 'planned', title: 'Datasheet ingest pipeline', body: 'Not yet wired — kb_chunks table is ready and partially populated.' },
    ],
  },
  {
    heading: 'Calculators',
    items: [
      { status: 'live', title: '12 closed-form calculators', body: 'Ohm, voltage/current divider, RC/RL τ, LED resistor, op-amp gain (inv + non-inv), reactance Xc/Xl, LC resonance, RC cutoff. Engineering-prefix tolerant inputs.' },
      { status: 'beta', title: 'Calculator API', body: 'Each calculator exposed under /api/calc/[op]; feeds the AI as a tool.' },
      { status: 'planned', title: 'Interactive schematic per calculator', body: 'Edit components on a small SVG and watch the result update — coming soon.' },
    ],
  },
  {
    heading: 'KiCad fidelity',
    items: [
      { status: 'live', title: 'KiCad 10 download', body: '.kicad_sch export targets eeschema file format 20250114 with full lib_symbol stubs, sheet_instances, embedded_fonts, and per-element UUIDs.' },
      { status: 'live', title: 'lib_symbols geometry rendering', body: 'Uploaded files render using their own KiCad shapes (rectangles, polylines, circles, arcs) for true visual parity.' },
      { status: 'planned', title: 'Schematic auto-layout', body: 'Better component spacing on tightly-packed uploads is on the roadmap.' },
      { status: 'planned', title: 'PCB ingest', body: 'Schematics only for V0. .kicad_pcb support is V2+.' },
    ],
  },
  {
    heading: 'Platform &amp; ops',
    items: [
      { status: 'live', title: 'Magic-link auth', body: 'Supabase Auth with one-click email sign-in.' },
      { status: 'live', title: 'Per-circuit AI failure surface', body: 'Owner sees the error code + message + a Regenerate button when the inline summary fails.' },
      { status: 'live', title: 'Sentry crash reporting', body: 'Replay on errors, low session sample rate to keep editor performance smooth.' },
      { status: 'beta', title: 'Suggestions box', body: 'Public roadmap board at /suggestions. Authenticated users post + upvote.' },
      { status: 'planned', title: 'Stripe billing', body: 'Free in beta. Pro tier with higher limits is V1.' },
    ],
  },
];

const STATUS_TONE: Record<Status, { label: string; cls: string }> = {
  live:     { label: 'live',        cls: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' },
  beta:     { label: 'beta',        cls: 'bg-sky-500/10 text-sky-700 border-sky-500/30' },
  paused:   { label: 'paused',      cls: 'bg-amber-500/10 text-amber-700 border-amber-500/30' },
  planned:  { label: 'planned',     cls: 'bg-muted text-muted-foreground border-border' },
};

export default function FeaturesPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10">
        <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          /features
        </div>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Features &amp; roadmap</h1>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">
          Everything we&apos;ve built, everything we&apos;re building, and the things
          we want help on. Want to nudge a planned item up the list?{' '}
          <Link href="/suggestions" className="underline hover:text-foreground">Vote on /suggestions</Link>.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
          <Legend tone="live" />
          <Legend tone="beta" />
          <Legend tone="paused" />
          <Legend tone="planned" />
        </div>
      </header>

      <div className="space-y-12">
        {SECTIONS.map((s) => (
          <section key={s.heading}>
            <h2
              className="mb-4 text-xl font-semibold tracking-tight"
              dangerouslySetInnerHTML={{ __html: s.heading }}
            />
            <ul className="space-y-3">
              {s.items.map((item) => (
                <li
                  key={item.title}
                  className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/20"
                >
                  <div className="flex flex-wrap items-baseline gap-3">
                    <h3 className="text-base font-semibold">{item.title}</h3>
                    <Pill tone={item.status} />
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer className="mt-14 border-t border-border pt-6 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Last updated 2026-05-06 · See <Link href="/wiki" className="underline">/wiki</Link> for usage docs.
      </footer>
    </main>
  );
}

function Pill({ tone }: { tone: Status }) {
  const t = STATUS_TONE[tone];
  return (
    <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${t.cls}`}>
      {t.label}
    </span>
  );
}

function Legend({ tone }: { tone: Status }) {
  return <Pill tone={tone} />;
}
