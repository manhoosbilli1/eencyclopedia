/**
 * /circuit/[id] — circuit detail.
 *
 * RLS does the heavy lifting: `schematics: read public-or-own` policy lets
 * any visitor see public circuits, the owner see their own, and nobody
 * else see private circuits. We rely on `maybeSingle()` returning null in
 * that case and surface a 404 (don't disclose existence).
 *
 * Layout:
 *   - Header: title, owner @username, visibility badge, created date
 *   - Inline SVG render (fetched from svg_url, embedded server-side)
 *   - Description (if any)
 *   - AI summary panel (struct + prose) or pending-state with regenerate
 *
 * Why fetch + inline the SVG instead of <img src=svg_url />: inline gives
 * us currentColor theming + interactive hover hooks. Fallback to <img> only
 * if the fetch fails for some reason.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RegenerateButton } from './regenerate-button';
import { FavoriteButton } from './favorite-button';
import { RebuildButton } from './rebuild-button';

interface Params {
  params: { id: string };
}

// We don't pre-render circuit pages; they're dynamic per RLS+user.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from('schematics')
    .select('title, description, visibility')
    .eq('id', params.id)
    .maybeSingle();
  if (!data) return { title: 'Circuit not found' };
  const visibility = (data as { visibility?: string }).visibility ?? 'private';
  return {
    title: (data as { title: string }).title,
    description:
      typeof (data as { description?: string | null }).description === 'string'
        ? ((data as { description?: string }).description ?? undefined)
        : undefined,
    robots: visibility === 'public' ? undefined : { index: false, follow: false },
  };
}

export default async function CircuitPage({ params }: Params) {
  // Cheap UUID sanity — schematics.id is uuid; reject obviously-bad input
  // before round-tripping to the DB.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id)) {
    notFound();
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('schematics')
    .select(
      'id, owner_id, title, description, visibility, component_count, raw_kicad_url, svg_url, ai_summary, ai_summary_struct, created_at, updated_at',
    )
    .eq('id', params.id)
    .maybeSingle();

  if (error || !data) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ownerId = (data as { owner_id: string }).owner_id;
  const isOwner = !!user && user.id === ownerId;

  // Fetch the owner's username for the header, ignoring errors (RLS allows
  // public read of profiles).
  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', ownerId)
    .maybeSingle();
  const ownerUsername =
    ownerProfile && typeof (ownerProfile as { username?: string }).username === 'string'
      ? (ownerProfile as { username: string }).username
      : null;

  const title = (data as { title: string }).title;
  const description =
    typeof (data as { description?: string | null }).description === 'string'
      ? ((data as { description?: string }).description ?? null)
      : null;
  const visibility = (data as { visibility: string }).visibility;
  const componentCount = (data as { component_count: number }).component_count;
  const svgUrl = (data as { svg_url: string | null }).svg_url;
  const rawUrl = (data as { raw_kicad_url: string | null }).raw_kicad_url;
  const aiSummary = (data as { ai_summary: string | null }).ai_summary;
  const aiStruct = (data as { ai_summary_struct: Record<string, unknown> | null })
    .ai_summary_struct;
  const createdAt = (data as { created_at: string }).created_at;

  // Whether the viewer has favorited this circuit. RLS scopes circuit_favorites
  // to the viewer's own rows so a `maybeSingle` is enough.
  let isFavorited = false;
  if (user) {
    const { data: fav } = await supabase
      .from('circuit_favorites')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('circuit_id', params.id)
      .maybeSingle();
    isFavorited = !!fav;
  }

  // If summary is null AND owner is viewing, look up the most recent
  // ai_calls row tagged to this schematic with ok=false. This surfaces the
  // error code to the user (AUTH / RATE_LIMIT / TIMEOUT / NETWORK / UNKNOWN /
  // INVALID_REQUEST / OVERLOADED / UPSTREAM) instead of leaving them to
  // hunt server logs. RLS allows users to read their own ai_calls rows.
  let summaryFailure: { code: string; message: string; at: string } | null = null;
  if (!aiSummary && isOwner) {
    const { data: failureRow } = await supabase
      .from('ai_calls')
      .select('request_meta, created_at')
      .eq('schematic_id', params.id)
      .eq('endpoint', 'summary')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const meta = (failureRow as { request_meta?: Record<string, unknown> } | null)
      ?.request_meta;
    if (
      meta &&
      typeof meta === 'object' &&
      meta['ok'] === false &&
      typeof meta['error_code'] === 'string'
    ) {
      summaryFailure = {
        code: meta['error_code'] as string,
        message:
          typeof meta['error_message'] === 'string'
            ? (meta['error_message'] as string)
            : '',
        at: (failureRow as { created_at: string }).created_at,
      };
    }
  }
  const { data: componentRows } = await supabase
    .from('schematic_components')
    .select('designator, value')
    .eq('schematic_id', params.id)
    .order('designator');
  const componentIndexRows = (componentRows ?? []) as Array<{
    designator?: string | null;
    value?: string | null;
  }>;

  // Fetch the SVG content server-side so we can inline it. Fall back to <img>.
  let svgInline: string | null = null;
  if (svgUrl) {
    try {
      const res = await fetch(svgUrl, { cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        // Sanity: must look like an SVG. Reject anything else without inlining.
        if (text.trim().startsWith('<svg')) svgInline = text;
      }
    } catch {
      svgInline = null;
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-3xl flex-col px-6 py-12">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          <span>{visibility}</span>
          <span>·</span>
          <span>
            {componentCount} component{componentCount === 1 ? '' : 's'}
          </span>
          <span>·</span>
          <span>{new Date(createdAt).toLocaleDateString()}</span>
        </div>
      </header>

      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>by </span>
          {ownerUsername ? (
            <Link href={`/profile/${ownerUsername}`} className="hover:text-foreground">
              @{ownerUsername}
            </Link>
          ) : (
            <span className="opacity-60">unknown</span>
          )}
          {isOwner ? (
            <span className="ml-2 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider">
              yours
            </span>
          ) : null}
        </div>
        {user ? (
          <FavoriteButton circuitId={params.id} initialFavorited={isFavorited} />
        ) : null}
      </div>

      {description ? (
        <p className="mt-6 max-w-prose text-sm leading-relaxed text-foreground">
          {description}
        </p>
      ) : null}

      {/* Render */}
      <section className="mt-8 rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Render (low-fidelity preview)
          </h2>
          {isOwner ? <RebuildButton circuitId={params.id} /> : null}
        </div>
        {svgInline ? (
          // dangerouslySetInnerHTML is safe here — the SVG was generated by
          // our renderer with explicit XML escaping (see lib/kicad/render.ts).
          <div
            className="overflow-hidden text-foreground"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: svgInline }}
          />
        ) : svgUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={svgUrl} alt={`Render of ${title}`} className="block w-full" />
        ) : (
          <p className="text-sm text-muted-foreground">No render available.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
          {user ? (
            <Link
              href={`/chat?circuit=${params.id}`}
              className="font-mono underline hover:text-foreground"
            >
              ↗ ask AI about this circuit
            </Link>
          ) : null}
          {rawUrl ? (
            <>
              <a
                href={rawUrl}
                className="font-mono underline hover:text-foreground"
                download
              >
                ↓ original .kicad_sch
              </a>
              {/* Same dir, deterministic suffix — see lib/circuits/actions.ts */}
              <a
                href={rawUrl.replace(/\.kicad_sch$/, '.eencyc.sexp')}
                className="font-mono underline hover:text-foreground"
                download
              >
                ↓ canonical .eencyc.sexp
              </a>
              <a
                href={rawUrl.replace(/\.kicad_sch$/, '.eencyc.json')}
                className="font-mono underline hover:text-foreground"
                target="_blank"
                rel="noreferrer"
              >
                ↗ parsed .eencyc.json
              </a>
            </>
          ) : null}
          {svgUrl ? (
            <a
              href={svgUrl}
              className="font-mono underline hover:text-foreground"
              target="_blank"
              rel="noreferrer"
            >
              ↗ open SVG
            </a>
          ) : null}
        </div>
      </section>

      <section className="mt-8 rounded-lg border border-border bg-card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Component index
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {componentIndexRows.length} row{componentIndexRows.length === 1 ? '' : 's'}
          </span>
        </div>
        {componentIndexRows.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm">
            {componentIndexRows.map((row, i) => {
              const designator =
                row && typeof row.designator === 'string' ? row.designator : '?';
              const value =
                row && typeof row.value === 'string' && row.value.length > 0
                  ? row.value
                  : '—';
              return (
                <li
                  key={`${designator}-${i}`}
                  className="grid grid-cols-[7rem_1fr] gap-3 border-b border-border/60 py-1 last:border-0"
                >
                  <span className="font-mono text-xs text-foreground">{designator}</span>
                  <span className="text-sm text-muted-foreground">{value}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            {isOwner
              ? 'No component rows stored yet. Use rebuild above to refresh derived artifacts and populate them.'
              : 'No component rows stored for this circuit yet.'}
          </p>
        )}
      </section>

      {/* AI summary */}
      <section className="mt-8 rounded-lg border border-border bg-card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            AI summary
          </h2>
          {isOwner ? <RegenerateButton circuitId={params.id} /> : null}
        </div>
        {aiSummary ? (
          <>
            <p className="mt-3 text-sm leading-relaxed text-foreground">{aiSummary}</p>
            {aiStruct ? <SummaryStruct s={aiStruct} /> : null}
          </>
        ) : summaryFailure ? (
          // Owner-visible: show the most recent error code and a snippet of
          // the upstream message. Hint depends on the code so the user
          // doesn't have to read server logs.
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
            <p className="font-mono uppercase tracking-wider text-destructive">
              {summaryFailure.code} · {new Date(summaryFailure.at).toLocaleString()}
            </p>
            <p className="mt-1 font-mono leading-relaxed text-destructive/90">
              {summaryFailure.message || 'No details captured.'}
            </p>
            <p className="mt-2 text-muted-foreground">
              {summaryFailure.code === 'AUTH'
                ? 'ANTHROPIC_API_KEY in .env.local is missing or invalid. Restart `pnpm dev` after fixing.'
                : summaryFailure.code === 'RATE_LIMIT'
                  ? 'Anthropic rate-limited the request. Wait a minute and click Regenerate.'
                  : summaryFailure.code === 'TIMEOUT'
                    ? 'Anthropic took longer than 12s. Click Regenerate to retry.'
                    : summaryFailure.code === 'OVERLOADED'
                      ? 'Anthropic temporarily overloaded. Click Regenerate in a moment.'
                      : summaryFailure.code === 'NETWORK'
                        ? 'Network error reaching api.anthropic.com. Check your connection.'
                        : 'Click Regenerate to retry.'}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Summary not generated yet. {isOwner ? 'Click regenerate above.' : 'Check back in a moment.'}
          </p>
        )}
      </section>

      <footer className="mt-auto pt-12 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        AI-assisted output. Verify against datasheets and standards before
        fabrication.
      </footer>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Structured-summary renderer
// ---------------------------------------------------------------------------

function SummaryStruct({ s }: { s: Record<string, unknown> }) {
  const topology = typeof s['topology'] === 'string' ? (s['topology'] as string) : null;
  const intent = typeof s['intent'] === 'string' ? (s['intent'] as string) : null;
  const category = typeof s['category'] === 'string' ? (s['category'] as string) : null;
  const rails = Array.isArray(s['rails']) ? (s['rails'] as unknown[]).filter(Boolean) : [];
  const concerns = Array.isArray(s['concerns'])
    ? (s['concerns'] as unknown[]).filter(Boolean)
    : [];
  const designNotes = typeof s['design_notes'] === 'string' ? (s['design_notes'] as string) : null;
  const keyComponents = Array.isArray(s['key_components'])
    ? (s['key_components'] as Array<Record<string, unknown>>)
    : [];

  return (
    <dl className="mt-4 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-[max-content_1fr]">
      {topology ? <Row label="Topology" value={topology} /> : null}
      {intent ? <Row label="Intent" value={intent} /> : null}
      {category ? <Row label="Category" value={category} /> : null}
      {rails.length > 0 ? <Row label="Rails" value={rails.map(String).join(', ')} /> : null}
      {keyComponents.length > 0 ? (
        <>
          <dt className="font-mono uppercase tracking-wider text-muted-foreground">Key components</dt>
          <dd className="text-foreground">
            <ul className="space-y-0.5">
              {keyComponents.map((c, i) => (
                <li key={i} className="font-mono">
                  {String(c['designator'] ?? '?')}
                  {c['value'] ? ` (${String(c['value'])})` : ''}
                  {c['mpn'] ? ` ${String(c['mpn'])}` : ''}
                  {c['role'] ? ` — ${String(c['role'])}` : ''}
                </li>
              ))}
            </ul>
          </dd>
        </>
      ) : null}
      {concerns.length > 0 ? (
        <>
          <dt className="font-mono uppercase tracking-wider text-muted-foreground">Concerns</dt>
          <dd className="text-foreground">
            <ul className="list-disc space-y-0.5 pl-4">
              {concerns.map((c, i) => (
                <li key={i}>{String(c)}</li>
              ))}
            </ul>
          </dd>
        </>
      ) : null}
      {designNotes ? <Row label="Design notes" value={designNotes} /> : null}
    </dl>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="font-mono uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </>
  );
}
