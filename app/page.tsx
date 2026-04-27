/**
 * Landing page — V1 marketing surface.
 * Replaces the bare closed-beta placeholder with a full, original design.
 *
 * Drop-in replacement for app/page.tsx. Uses only existing tokens
 * (HSL token system in app/globals.css + Inter/JetBrains Mono from layout.tsx).
 *
 * CTA logic preserved from previous page:
 *   - anonymous              → "Request beta access" → /login
 *   - authed, placeholder un → "Finish setup"        → /onboarding
 *   - authed, real username  → "Upload a circuit"    → /circuit/new
 */

import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isPlaceholderUsername } from '@/lib/auth/username';

// One accent color in oklch — circuit-trace amber, low chroma so it sits
// quietly next to the slate token palette. Inline because it's marketing-only;
// not promoted to globals.css until we use it elsewhere.
const ACCENT = 'oklch(0.72 0.13 65)';
const ACCENT_SOFT = 'oklch(0.95 0.04 75)';

export default async function HomePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let cta: { href: string; label: string } = {
    href: '/login',
    label: 'Request beta access',
  };
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle();
    const placeholder =
      profile && typeof profile.username === 'string' && isPlaceholderUsername(profile.username);
    cta = placeholder
      ? { href: '/onboarding', label: 'Finish setup' }
      : { href: '/circuit/new', label: 'Upload a circuit' };
  }

  return (
    <main className="mx-auto max-w-6xl px-6">
      {/* HERO */}
      <section className="grid items-center gap-14 py-20 md:grid-cols-[1.05fr_1fr] md:py-28">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            <span className="h-px w-4" style={{ background: ACCENT }} />
            For working electronics engineers
          </div>
          <h1 className="text-balance text-4xl font-semibold leading-[1.02] tracking-tight sm:text-5xl md:text-6xl">
            Never lose a circuit{' '}
            <em className="font-medium not-italic" style={{ color: ACCENT, fontStyle: 'italic' }}>
              you&apos;ve already drawn.
            </em>
          </h1>
          <p className="mt-5 max-w-prose text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            eencyclopedia indexes every schematic you upload — KiCad in, AI summary out — so a year
            from now you can ask <span className="font-mono text-foreground">&ldquo;that low-pass I made for the audio jack?&rdquo;</span>{' '}
            and actually get it back. Search, recall, explain, improve.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href={cta.href}
              className={cn(
                'inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground',
                'transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
              )}
            >
              {cta.label}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </Link>
            <Link
              href="#how"
              className="inline-flex h-11 items-center rounded-md border border-border bg-background px-5 text-sm font-medium hover:bg-muted"
            >
              See how it works
            </Link>
          </div>
          <ul className="mt-7 flex flex-wrap gap-x-7 gap-y-3 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            <li><span style={{ color: ACCENT }}>✓</span> Upload .kicad_sch</li>
            <li><span style={{ color: ACCENT }}>✓</span> EE-tuned AI</li>
            <li><span style={{ color: ACCENT }}>✓</span> Citations included</li>
            <li><span style={{ color: ACCENT }}>✓</span> Free in beta</li>
          </ul>
        </div>

        {/* Hero art — animated circuit */}
        <HeroArt />
      </section>

      {/* WHY IT EXISTS */}
      <section className="border-t border-border py-20" id="why">
        <SectionHeader
          eyebrow="Why this exists"
          title="I built this because I kept losing my own work."
          blurb="Six months in, you've drawn a hundred schematics across a dozen projects. The one you need is buried four folders deep with a name like test_v3_final_FINAL2.kicad_sch. So you redraw it. Again. eencyclopedia is the index I wish I'd had."
        />
        <div className="grid gap-6 md:grid-cols-2">
          <article className="rounded-xl border border-border bg-card p-7">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Before · the folder graveyard
            </div>
            <h3 className="mb-2 text-lg font-semibold tracking-tight">Where good circuits go to die.</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Hard drives full of schematics. No tags. No descriptions. No way to ask &ldquo;did I already
              solve this?&rdquo;
            </p>
            <FolderTree />
          </article>

          <article className="rounded-xl border border-border bg-card p-7">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              After · ask the encyclopedia
            </div>
            <h3 className="mb-2 text-lg font-semibold tracking-tight">Recall, explain, improve.</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Every upload gets a one-pass AI summary, embedded for retrieval. Months later, you describe
              what it did — not what you named it.
            </p>
            <RecallPreview />
          </article>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-t border-border py-20" id="how">
        <SectionHeader
          eyebrow="How it works"
          title="Drop in a .kicad_sch. Get an indexed, queryable circuit."
          blurb="No workflow change. Same file you save in KiCad. eencyclopedia handles the rest — parse, render, summarise, embed, store."
        />
        <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-border sm:grid-cols-2 md:grid-cols-4">
          <Step n="01" label="Upload" title="Drop a schematic" body="Single .kicad_sch file. Up to 5 components in V0 (cap rises with the platform)." />
          <Step n="02" label="Parse & render" title="Render to SVG" body="S-exp → AST → clean schematic SVG. Every net and designator becomes a hover target." />
          <Step n="03" label="Summarise" title="AI extracts intent" body="Topology, rails, key components, design notes. Stored as structured JSON — not just prose." />
          <Step n="04" label="Recall" title="Ask it anything" body="Natural-language queries hit a hybrid (FTS + vector) index. Answers cite the exact circuit." />
        </div>
      </section>

      {/* FEATURES */}
      <section className="border-t border-border py-20" id="features">
        <SectionHeader
          eyebrow="What's in V0"
          title="An EE's reference, not a generic chatbot."
          blurb="Grounded in textbooks, datasheets, and your own corpus. Refuses non-electronics topics. Always shows the math."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Feature title="Search circuits, not parts" body="Curated reference designs with filters for supply, topology, and citation source. Find what works, then fork it." />
          <Feature title="Hover-to-explain" body="Every wire and component is interactive. Hover for tooltips, click to ask the AI about that exact net." />
          <Feature title="Math, not vibes" body="Every answer ships with the derivation in KaTeX, units, and a citation. Verify before you fab." />
          <Feature title="Twelve calculators, instant" body="Ohm, dividers, RC/RL, reactance, resonance, op-amp gain, LED resistor. Pure JS — no AI tax." />
          <Feature title="Favorites & library" body="Star components and circuits. Build a personal reference shelf alongside the public library." />
          <Feature title="Cited, not hallucinated" body="RAG over textbooks, app notes, and your circuits. If it can't be cited, the assistant says so out loud." />
        </div>

        <div
          className="mt-7 flex items-start gap-4 rounded-xl border border-dashed p-5 text-sm"
          style={{
            borderColor: `color-mix(in srgb, ${ACCENT} 50%, hsl(var(--border)))`,
            background: ACCENT_SOFT,
          }}
        >
          <div
            className="flex h-6 w-6 flex-none items-center justify-center rounded-md border bg-background font-mono font-semibold"
            style={{ borderColor: `color-mix(in srgb, ${ACCENT} 30%, hsl(var(--border)))`, color: ACCENT }}
          >
            i
          </div>
          <p className="text-foreground">
            <strong className="font-semibold">Honest about the AI.</strong>{' '}
            <span className="text-muted-foreground">
              The encyclopedia is a growing retrieval pool, not a model that learns from your data. It
              searches a curated knowledge base — datasheets, textbooks, public circuits — and reasons
              over them. The encyclopedia improves as the corpus grows; the model itself doesn&apos;t.
            </span>
          </p>
        </div>
      </section>

      {/* COMING NEXT */}
      <section className="border-t border-border py-20" id="soon">
        <SectionHeader
          eyebrow="Coming next"
          title="Live values on hover. Embedded SPICE. Skip the design loop."
          blurb="Tell the AI what you need — bandwidth, supply, load — and get a working circuit and the numbers behind it. Hover any net to see voltage, current, transient response, all in-line."
        />
        <SimPreview />
      </section>

      {/* CTA */}
      <section
        className="relative my-24 overflow-hidden rounded-2xl border border-border bg-card p-10 md:p-12"
        style={{
          backgroundImage: `radial-gradient(80% 120% at 100% 0%, color-mix(in srgb, ${ACCENT} 10%, transparent), transparent 60%)`,
        }}
        id="cta"
      >
        <div className="grid items-center gap-8 md:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="text-balance text-2xl font-semibold leading-tight tracking-tight md:text-4xl">
              Stop redrawing circuits you&apos;ve already drawn.
            </h2>
            <p className="mt-3 max-w-prose text-muted-foreground">
              Closed beta is open. Magic-link sign-in, one upload, and you&apos;re indexed for life.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <Link
              href={cta.href}
              className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {cta.label}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </Link>
            <Link
              href="https://github.com/"
              className="inline-flex h-11 items-center rounded-md border border-border bg-background px-5 text-sm font-medium hover:bg-muted"
            >
              View source
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-10">
        <div className="flex flex-wrap items-start justify-between gap-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
          <div>© {new Date().getFullYear()} eencyclopedia · solo-built, bootstrapped</div>
          <div className="flex flex-wrap gap-5">
            <Link href="/library" className="hover:text-foreground">Library</Link>
            <Link href="/calc" className="hover:text-foreground">Calc</Link>
            <Link href="/api/health" className="hover:text-foreground">Status</Link>
          </div>
        </div>
        <p className="mt-4 max-w-[64ch] font-mono text-[10.5px] leading-relaxed text-muted-foreground">
          AI-assisted output. Verify against datasheets and standards before fabrication. eencyclopedia
          is in closed beta — features marked <span style={{ color: ACCENT }}>&ldquo;coming next&rdquo;</span>{' '}
          are not yet live.
        </p>
      </footer>
    </main>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/*  Sub-components                                                     */
/* ─────────────────────────────────────────────────────────────────── */

function SectionHeader({
  eyebrow,
  title,
  blurb,
}: {
  eyebrow: string;
  title: string;
  blurb?: string;
}) {
  return (
    <div className="mb-12 grid gap-4 md:mb-14 md:grid-cols-[1fr_1.4fr] md:gap-12">
      <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {eyebrow}
      </div>
      <div>
        <h2 className="text-balance text-2xl font-semibold leading-tight tracking-tight md:text-4xl">
          {title}
        </h2>
        {blurb ? (
          <p className="mt-3 max-w-[56ch] text-base text-muted-foreground">{blurb}</p>
        ) : null}
      </div>
    </div>
  );
}

function Step({ n, label, title, body }: { n: string; label: string; title: string; body: string }) {
  return (
    <div className="border-b border-border p-6 last:border-b-0 sm:[&:nth-child(2)]:border-r-0 sm:nth-[odd]:border-r sm:[&:nth-last-child(-n+2)]:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
      <div className="mb-5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
        {n} · {label}
      </div>
      <h3 className="mb-1.5 text-base font-semibold">{title}</h3>
      <p className="text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-foreground/25">
      <h3 className="mb-2 text-[15px] font-semibold tracking-tight">{title}</h3>
      <p className="text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>
    </article>
  );
}

function FolderTree() {
  const rows: Array<{ depth: number; text: string; tone: 'normal' | 'lost' | 'found' }> = [
    { depth: 0, text: '~/projects', tone: 'normal' },
    { depth: 1, text: 'audio_thing_2024/', tone: 'normal' },
    { depth: 1, text: 'weekend_hacks/', tone: 'normal' },
    { depth: 2, text: 'test_v2/', tone: 'lost' },
    { depth: 3, text: 'old/', tone: 'lost' },
    { depth: 4, text: 'final_FINAL.kicad_sch', tone: 'lost' },
    { depth: 4, text: 'copy_of_final.kicad_sch', tone: 'lost' },
    { depth: 4, text: 'untitled_47.kicad_sch  ← the one you need', tone: 'found' },
    { depth: 3, text: 'backup.kicad_sch', tone: 'lost' },
  ];
  return (
    <div className="font-mono text-[12.5px] leading-[1.85] text-muted-foreground">
      {rows.map((r, i) => (
        <div
          key={i}
          className={cn(
            'flex items-center',
            r.tone === 'lost' && 'opacity-50',
            r.tone === 'found' && 'rounded text-foreground',
          )}
          style={{
            paddingLeft: r.depth * 14,
            ...(r.tone === 'found'
              ? {
                background: ACCENT_SOFT,
                borderLeft: `2px solid ${ACCENT}`,
                marginLeft: -2,
                paddingLeft: r.depth * 14 + 6,
              }
              : {}),
          }}
        >
          <span className="mr-1.5 inline-block w-2 text-muted-foreground">·</span>
          {r.text}
        </div>
      ))}
    </div>
  );
}

function RecallPreview() {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl bg-muted px-4 py-3">
        <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
          You
        </div>
        <div className="text-sm">
          that low-pass I made last spring for the audio jack — what was the cutoff?
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: ACCENT }} />
          eencyclopedia
        </div>
        <div className="text-sm">
          Found it. Single-pole RC, R = 10k, C = 15n → fc ≈{' '}
          <span className="font-mono" style={{ color: ACCENT }}>1.06 kHz</span>. You used it to roll
          off hiss above the voice band. Want to bump it to 3.4 kHz for full telephone bandwidth?
        </div>
        <div
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-muted-foreground"
        >
          <span className="h-2 w-2 rounded-sm" style={{ background: ACCENT }} />
          untitled_47.kicad_sch · Apr 2026
        </div>
      </div>
    </div>
  );
}

function HeroArt() {
  return (
    <div
      aria-hidden
      className="relative aspect-square overflow-hidden rounded-2xl border border-border"
      style={{ background: 'linear-gradient(180deg, hsl(var(--background)), hsl(var(--muted)))' }}
    >
      {/* grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(circle at 50% 50%, black 55%, transparent 90%)',
          WebkitMaskImage: 'radial-gradient(circle at 50% 50%, black 55%, transparent 90%)',
          opacity: 0.6,
        }}
      />
      <div className="absolute left-3.5 top-3.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: ACCENT }} />
        circuit_042.kicad_sch
      </div>
      <div className="absolute right-3.5 top-3.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        RENDER · SVG
      </div>

      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 480 480" preserveAspectRatio="xMidYMid meet">
        <defs>
          <style>{`
            .t { fill: none; stroke: hsl(var(--foreground)); stroke-opacity: 0.3; stroke-width: 1.5; stroke-linecap: round; }
            .flow { fill: none; stroke: ${ACCENT}; stroke-width: 1.5; stroke-dasharray: 4 6; animation: dash 2.4s linear infinite; }
            .ic { fill: hsl(var(--background)); stroke: hsl(var(--foreground)); stroke-width: 1.5; }
            .lbl { font-family: var(--font-mono); font-size: 9px; fill: hsl(var(--foreground)); }
            .lblmu { font-family: var(--font-mono); font-size: 9px; fill: hsl(var(--muted-foreground)); }
            @keyframes dash { to { stroke-dashoffset: -100; } }
          `}</style>
        </defs>

        <path className="t" d="M60 80 H420" />
        <text className="lblmu" x="60" y="70">VIN</text>
        <path className="t" d="M60 400 H420" />
        <text className="lblmu" x="60" y="418">GND</text>

        <rect className="ic" x="180" y="200" width="120" height="80" rx="4" />
        <text className="lbl" x="194" y="220">U1 · OPA</text>
        <text className="lblmu" x="194" y="234">amp_4.6</text>

        <path className="t" d="M60 80 V150" />
        <rect className="ic" x="48" y="150" width="24" height="50" rx="3" />
        <text className="lbl" x="78" y="180">R1</text>
        <text className="lblmu" x="78" y="194">10k</text>
        <path className="t" d="M60 200 V240" />
        <rect className="ic" x="48" y="240" width="24" height="50" rx="3" />
        <text className="lbl" x="78" y="270">R2</text>
        <text className="lblmu" x="78" y="284">10k</text>
        <path className="t" d="M60 290 V400" />
        <path className="t" d="M60 220 H180" />
        <circle cx="60" cy="220" r="3.5" fill="hsl(var(--background))" stroke="hsl(var(--foreground))" strokeWidth="1.5" />

        <path className="t" d="M300 240 H420 V400" />
        <rect className="ic" x="370" y="120" width="24" height="50" rx="3" />
        <text className="lbl" x="332" y="150">RL</text>
        <text className="lblmu" x="332" y="164">1k</text>
        <path className="t" d="M382 80 V120" />
        <path className="t" d="M382 170 V240" />
        <circle cx="382" cy="240" r="3.5" fill="hsl(var(--background))" stroke="hsl(var(--foreground))" strokeWidth="1.5" />

        <path className="t" d="M240 200 V160 H340 V240" />

        <path className="flow" d="M60 220 H180" />
        <path className="flow" d="M300 240 H420" />
        <path className="flow" d="M240 200 V160 H340 V240" />

        <text className="lblmu" x="100" y="212">VOUT</text>
      </svg>
    </div>
  );
}

function SimPreview() {
  return (
    <div className="grid overflow-hidden rounded-2xl border border-border bg-card md:grid-cols-[1.4fr_1fr]">
      <div
        className="relative aspect-[16/10] border-b border-border md:border-b-0 md:border-r"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 0%, color-mix(in srgb, ${ACCENT} 8%, transparent), transparent 60%)`,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            maskImage: 'radial-gradient(circle at 50% 50%, black 50%, transparent 95%)',
            WebkitMaskImage: 'radial-gradient(circle at 50% 50%, black 50%, transparent 95%)',
            opacity: 0.6,
          }}
        />
        <div className="pointer-events-none absolute left-3.5 right-3.5 top-3.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          <div className="flex gap-2">
            <span className="rounded-full border border-border bg-background px-2 py-1">.tran 5ms</span>
            <span className="rounded-full border border-border bg-background px-2 py-1">@ VIN=5V</span>
          </div>
          <span className="rounded-full border border-border bg-background px-2 py-1">ngspice · wasm</span>
        </div>

        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 600 380" preserveAspectRatio="xMidYMid meet">
          <defs>
            <style>{`
              .t2 { fill: none; stroke: hsl(var(--foreground)); stroke-opacity: 0.3; stroke-width: 1.5; stroke-linecap: round; }
              .f2 { fill: none; stroke: ${ACCENT}; stroke-width: 1.5; stroke-dasharray: 4 6; animation: dash 2.4s linear infinite; }
              .ic2 { fill: hsl(var(--background)); stroke: hsl(var(--foreground)); stroke-width: 1.5; }
              .lbl2 { font-family: var(--font-mono); font-size: 9px; fill: hsl(var(--foreground)); }
              .lbm2 { font-family: var(--font-mono); font-size: 9px; fill: hsl(var(--muted-foreground)); }
            `}</style>
          </defs>

          <path className="t2" d="M60 60 H540" />
          <path className="t2" d="M60 320 H540" />
          <text className="lbm2" x="60" y="50">+5V</text>
          <text className="lbm2" x="60" y="338">GND</text>

          <path className="t2" d="M120 60 V140" />
          <rect className="ic2" x="108" y="140" width="24" height="50" rx="3" />
          <text className="lbl2" x="138" y="170">R1</text>
          <text className="lbm2" x="138" y="184">4.7k</text>
          <circle cx="120" cy="200" r="3.5" fill="hsl(var(--background))" stroke="hsl(var(--foreground))" strokeWidth="1.5" />
          <text className="lbm2" x="58" y="204">VA</text>
          <path className="t2" d="M120 190 V200" />
          <path className="t2" d="M120 200 H260" />
          <path className="t2" d="M120 200 V250" />
          <g stroke="hsl(var(--foreground))" strokeWidth="1.5" fill="none">
            <path d="M108 250 H132" />
            <path d="M104 260 H136" />
          </g>
          <path className="t2" d="M120 260 V320" />
          <text className="lbl2" x="138" y="258">C1 · 100n</text>

          <polygon className="ic2" points="260,170 260,230 320,200" />
          <text className="lbl2" x="266" y="194">+</text>
          <text className="lbl2" x="266" y="220">-</text>

          <path className="t2" d="M320 200 H460" />
          <circle cx="460" cy="200" r="4" fill={ACCENT} stroke={ACCENT} />
          <text className="lbm2" x="468" y="204">VOUT</text>

          <path className="t2" d="M260 220 V260 H400 V200" />
          <rect className="ic2" x="388" y="240" width="24" height="40" rx="3" />
          <text className="lbl2" x="418" y="266">Rf</text>
          <text className="lbm2" x="418" y="280">22k</text>

          <path className="t2" d="M460 200 V260" />
          <rect className="ic2" x="448" y="260" width="24" height="40" rx="3" />
          <text className="lbl2" x="478" y="286">RL · 10k</text>
          <path className="t2" d="M460 300 V320" />

          <path className="f2" d="M120 60 V140" />
          <path className="f2" d="M120 200 H260" />
          <path className="f2" d="M320 200 H460" />
          <path className="f2" d="M260 220 V260 H400 V200" />
        </svg>

        {/* hover tooltip on the output node */}
        <div
          className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border-2"
          style={{ left: '76.7%', top: '53%', background: ACCENT, borderColor: 'hsl(var(--background))' }}
        />
        <div
          className="absolute -translate-x-1/2 rounded-lg px-3 py-2 font-mono text-[11px] leading-[1.55] shadow-xl"
          style={{
            left: '76.7%',
            top: '53%',
            transform: 'translate(-50%, calc(-100% - 14px))',
            background: 'hsl(var(--foreground))',
            color: 'hsl(var(--background))',
            whiteSpace: 'nowrap',
          }}
        >
          <div><span className="opacity-60">net</span>  <span style={{ color: ACCENT }}>VOUT</span></div>
          <div><span className="opacity-60">V</span>     <span style={{ color: ACCENT }}>3.214 V</span></div>
          <div><span className="opacity-60">I_load</span>  <span style={{ color: ACCENT }}>321 µA</span></div>
          <div><span className="opacity-60">−3 dB</span>   <span style={{ color: ACCENT }}>3.39 kHz</span></div>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-7 md:p-8">
        <span
          className="inline-flex w-max items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em]"
          style={{
            borderColor: `color-mix(in srgb, ${ACCENT} 40%, hsl(var(--border)))`,
            background: ACCENT_SOFT,
            color: ACCENT,
          }}
        >
          ● Shipping next
        </span>
        <h3 className="text-lg font-semibold tracking-tight">Tell it what you need. Get the circuit.</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Embedded SPICE means you skip the topology hunt. Specify the spec; the AI returns a circuit,
          the simulation, and the math behind it.
        </p>
        <ul className="mt-1 space-y-2.5">
          <SimItem title="Hover any net for live values" sub="Voltage, current, transient — read straight off the schematic." />
          <SimItem title="Embedded ngspice (WASM)" sub=".tran, .ac, .dc — runs in the browser, results cached per circuit." />
          <SimItem title='"I need X — design it"' sub="Specify spec. Get topology, parts, simulation, and the derivation." />
          <SimItem title="In-depth circuit analysis" sub="Stability, noise, sensitivity, corner cases — all annotated on the SVG." />
        </ul>
      </div>
    </div>
  );
}

function SimItem({ title, sub }: { title: string; sub: string }) {
  return (
    <li className="flex items-start gap-2.5 text-[13.5px]">
      <span
        className="mt-0.5 inline-flex h-4 w-4 flex-none items-center justify-center rounded border border-border bg-background"
        style={{ color: ACCENT }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M5 12l5 5L20 7" />
        </svg>
      </span>
      <span>
        {title}
        <small className="mt-0.5 block text-[12px] text-muted-foreground">{sub}</small>
      </span>
    </li>
  );
}
