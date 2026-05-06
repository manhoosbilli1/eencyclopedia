import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Wiki — how to use eencyclopedia',
  description: 'Walkthrough of every feature: upload, share, fork, editor, calculators, bounding-box ingest.',
};

export default function WikiPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10">
        <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          /wiki
        </div>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">How to use eencyclopedia</h1>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">
          Short, opinionated guide. If a section is wrong, ambiguous, or missing — open a{' '}
          <Link href="/suggestions" className="underline hover:text-foreground">suggestion</Link>{' '}
          or{' '}
          <a
            href="https://github.com/manhoosbilli1/eencyclopedia"
            className="underline hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            file an issue
          </a>.
        </p>
      </header>

      <nav className="mb-10 grid grid-cols-2 gap-2 rounded-lg border border-border bg-card p-4 text-sm md:grid-cols-3">
        <a className="hover:text-foreground" href="#upload">1. Upload a circuit</a>
        <a className="hover:text-foreground" href="#bbox">2. Bounding-box ingest</a>
        <a className="hover:text-foreground" href="#editor">3. Browser editor</a>
        <a className="hover:text-foreground" href="#fork">4. Forking spinoffs</a>
        <a className="hover:text-foreground" href="#download">5. Download to KiCad</a>
        <a className="hover:text-foreground" href="#calc">6. Calculators</a>
        <a className="hover:text-foreground" href="#search">7. Library &amp; search</a>
        <a className="hover:text-foreground" href="#ai">8. AI summary</a>
        <a className="hover:text-foreground" href="#beta">9. Closed-beta limits</a>
      </nav>

      <Section id="upload" title="1. Upload a circuit">
        <p>
          Click <Strong>+ Upload</Strong> in the navbar and pick a{' '}
          <Code>.kicad_sch</Code> file (or paste the source). The pipeline:
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-6">
          <li>parse the file (KiCad 7–10 format),</li>
          <li>normalise to our canonical form,</li>
          <li>render an SVG preview,</li>
          <li>generate an AI summary,</li>
          <li>insert into the database with the chosen visibility.</li>
        </ol>
        <p className="mt-3">
          Visibility options: <Strong>public</Strong> (listed in the
          library), <Strong>unlisted</Strong> (link only), or{' '}
          <Strong>private</Strong> (only you can see it).
        </p>
      </Section>

      <Section id="bbox" title="2. Bounding-box ingest (share a sub-circuit)">
        <p>
          Got a giant project schematic but only want to share one sub-circuit
          (an op-amp stage, a regulator, an SPI bus)? Mark the region and we
          ingest only that.
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-6">
          <li>In KiCad, draw a rectangle around the region you want to share.</li>
          <li>
            Add a text annotation reading <Code>eencyclopedia</Code> near the
            top-left corner of that rectangle.
          </li>
          <li>Save the schematic and upload it as normal.</li>
        </ol>
        <p className="mt-3">
          Components, wires, junctions, and labels <em>inside</em> the rectangle
          are kept; everything outside is dropped before the component cap is
          checked. No bounding box → the whole sheet is ingested as before.
        </p>
      </Section>

      <Section id="editor" title="3. Browser editor">
        <p>
          Open <Link href="/schematic/new" className="underline">/schematic/new</Link>{' '}
          for a blank canvas, or click <Strong>Open in editor</Strong> on any
          circuit page to load that circuit interactively.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-6">
          <li>Toolbar: select / wire / no-connect / text / power / add symbol.</li>
          <li>Symbol Browser (A): searchable catalogue of ~150 KiCad symbols.</li>
          <li>Click a symbol or use the palette to enter <Strong>place</Strong> mode; click on the canvas to drop.</li>
          <li>Wire mode: click pins or grid points to draw orthogonal wires.</li>
          <li>Drag selected components to move (wires stretch).</li>
          <li>R rotates, X mirrors, Del deletes, Ctrl+Z / Ctrl+Y undo/redo.</li>
          <li>Properties panel slides in when one component is selected — edit Designator, Value, MPN, Footprint.</li>
        </ul>
      </Section>

      <Section id="fork" title="4. Forking spinoffs">
        <p>
          Anyone signed in can edit any circuit they can see — but the{' '}
          <Strong>Save</Strong> button on someone else&apos;s circuit creates
          a <em>spinoff</em> (a new circuit you own, linked back to the
          original via a breadcrumb). The original stays untouched.
        </p>
        <p className="mt-3">
          You&apos;ll see <Code>↰ forked from @alice&apos;s &quot;Audio low-pass&quot;</Code>{' '}
          on the spinoff page, plus an <Code>N spinoffs</Code> badge on the
          parent. Each spinoff also tracks the original ancestor as{' '}
          <Code>root</Code>.
        </p>
      </Section>

      <Section id="download" title="5. Download &amp; open in KiCad">
        <p>
          On any circuit page click <Code>↓ .kicad_sch</Code> to download. The
          file targets KiCad 9/10 (eeschema file format <Code>20250114</Code>)
          with full <Code>lib_symbols</Code> stubs, <Code>sheet_instances</Code>,
          and <Code>embedded_fonts</Code>. It opens in KiCad without errors.
        </p>
        <p className="mt-3">
          Components edited in the browser editor that don&apos;t have a custom
          KiCad library entry will use a placeholder rectangle body — the pin
          positions are correct, so wiring still works in KiCad. Authentic
          per-symbol geometry for editor-created circuits is on the roadmap.
        </p>
      </Section>

      <Section id="calc" title="6. Calculators">
        <p>
          Pure-JS, deterministic, zero AI cost.{' '}
          <Link href="/calc" className="underline">/calc</Link> covers Ohm&apos;s
          law, voltage/current dividers, RC/RL τ, LED resistor, op-amp gain,
          reactance, LC resonance, RC cutoff. Type values with engineering
          prefixes — <Code>10k</Code>, <Code>100n</Code>, <Code>4.7µ</Code> all
          work.
        </p>
      </Section>

      <Section id="search" title="7. Library &amp; search">
        <p>
          <Link href="/library" className="underline">/library</Link> is the
          public corpus + your circuits. The <Strong>All</Strong> filter
          shows public + unlisted from others alongside your own. The search
          box uses Postgres full-text with the schematic title, description,
          and AI summary.
        </p>
      </Section>

      <Section id="ai" title="8. AI summary">
        <p>
          Every upload runs through a single Gemini Flash (or Claude Sonnet)
          call to extract topology, rails, key components, intent, and design
          notes. The summary is shown on the circuit page and is also embedded
          (Voyage <Code>voyage-3</Code>, 1024-d) for semantic retrieval.
        </p>
        <p className="mt-3">
          If the inline call fails (quota, transient error) you&apos;ll see a
          banner with the error code and a <Strong>Regenerate</Strong> button.
          AI calls are metered in the <Code>ai_calls</Code> table — every call
          gets logged with token count and cost.
        </p>
      </Section>

      <Section id="beta" title="9. Closed-beta limits">
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>10 owned circuits per user (delete one to upload another).</li>
          <li>Up to 200 components per circuit, 5 MiB per upload.</li>
          <li>
            <Code>/chat</Code> is paused while the RAG pipeline gets sorted —
            see the <Link href="/features" className="underline">features</Link> page.
          </li>
          <li>SPICE simulation, distributor pricing, and forum/comments are V1.</li>
        </ul>
      </Section>

      <footer className="mt-12 border-t border-border pt-8 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        AI-assisted output. Verify against datasheets and standards before fabrication.
      </footer>
    </main>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-10 scroll-mt-16">
      <h2 className="mb-3 text-xl font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-base leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-foreground">{children}</strong>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[12.5px] text-foreground">
      {children}
    </code>
  );
}
