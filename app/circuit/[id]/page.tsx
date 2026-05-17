/**
 * /circuit/[id] — circuit detail page.
 *
 * Sections:
 *   - Header: title, owner, visibility badge, star button
 *   - Inline SVG schematic viewer
 *   - Component index (BOM with LCSC pricing)
 *   - AI summary
 *   - DC Simulator
 *   - Discussion (comments)
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RegenerateButton } from './regenerate-button';
import { FavoriteButton } from './favorite-button';
import { RebuildButton } from './rebuild-button';
import { SchematicViewer } from './schematic-viewer';
import { StarButton } from './star-button';
import { CommentsSection } from './comments-section';
import { BomPanel } from './bom-panel';
import { SimPanel } from './sim-panel';
import { ForkBreadcrumb, type ForkAncestor } from './fork-breadcrumb';

interface Params {
  params: { id: string };
}

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
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id)) {
    notFound();
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('schematics')
    .select(
      'id, owner_id, title, description, visibility, component_count, raw_kicad_url, svg_url, ai_summary, ai_summary_struct, created_at, updated_at, star_count, fork_of, fork_root_id, fork_count',
    )
    .eq('id', params.id)
    .maybeSingle();

  if (error || !data) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  const ownerId = (data as { owner_id: string }).owner_id;
  const isOwner = !!user && user.id === ownerId;

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
  const aiStruct = (data as { ai_summary_struct: Record<string, unknown> | null }).ai_summary_struct;
  const createdAt = (data as { created_at: string }).created_at;
  const starCount = (data as { star_count: number }).star_count ?? 0;
  const forkOf = (data as { fork_of: string | null }).fork_of;
  const forkRootId = (data as { fork_root_id: string | null }).fork_root_id;
  const forkCount = (data as { fork_count: number | null }).fork_count ?? 0;

  // Resolve fork ancestry — parent (immediate) + root (oldest ancestor).
  // Each is the smallest possible projection and is automatically RLS-scoped.
  const ancestorIds = [forkOf, forkRootId].filter((x): x is string => !!x && x !== params.id);
  let parentAncestor: ForkAncestor | null = null;
  let rootAncestor: ForkAncestor | null = null;
  if (ancestorIds.length > 0) {
    const { data: ancestorRows } = await supabase
      .from('schematics')
      .select('id, title, owner_id')
      .in('id', ancestorIds);
    const rows = (ancestorRows ?? []) as Array<{
      id: string; title: string; owner_id: string;
    }>;
    if (rows.length > 0) {
      const ownerIds = [...new Set(rows.map((r) => r.owner_id))];
      const { data: ownerProfiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', ownerIds);
      const usernameById = new Map(
        ((ownerProfiles ?? []) as Array<{ id: string; username: string }>)
          .map((p) => [p.id, p.username]),
      );
      const toAncestor = (id: string): ForkAncestor | null => {
        const r = rows.find((x) => x.id === id);
        if (!r) return null;
        return { id: r.id, title: r.title, ownerUsername: usernameById.get(r.owner_id) ?? null };
      };
      parentAncestor = forkOf ? toAncestor(forkOf) : null;
      rootAncestor = forkRootId ? toAncestor(forkRootId) : null;
    }
  }

  // Did the current user star/favorite this circuit?
  let isStarred = false;
  let isFavorited = false;
  if (user) {
    const [starRow, favRow] = await Promise.all([
      supabase
        .from('circuit_stars')
        .select('user_id')
        .eq('user_id', user.id)
        .eq('schematic_id', params.id)
        .maybeSingle(),
      supabase
        .from('circuit_favorites')
        .select('user_id')
        .eq('user_id', user.id)
        .eq('circuit_id', params.id)
        .maybeSingle(),
    ]);
    isStarred = !!starRow.data;
    isFavorited = !!favRow.data;
  }

  // Summary failure code for owner
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
    const meta = (failureRow as { request_meta?: Record<string, unknown> } | null)?.request_meta;
    if (meta && meta['ok'] === false && typeof meta['error_code'] === 'string') {
      summaryFailure = {
        code: meta['error_code'] as string,
        message: typeof meta['error_message'] === 'string' ? (meta['error_message'] as string) : '',
        at: (failureRow as unknown as { created_at: string }).created_at,
      };
    }
  }

  // Component rows (for BOM + component index)
  const { data: componentRows } = await supabase
    .from('schematic_components')
    .select('designator, value')
    .eq('schematic_id', params.id)
    .order('designator');
  const bomRows = (componentRows ?? []) as Array<{
    designator?: string | null;
    value?: string | null;
  }>;

  // Comments — top-level with one level of replies
  const { data: commentData } = await supabase
    .from('circuit_comments')
    .select(`
      id, user_id, content, created_at, parent_id,
      profiles:user_id (username)
    `)
    .eq('schematic_id', params.id)
    .order('created_at', { ascending: true });

  type CommentRow = {
    id: string;
    user_id: string;
    content: string;
    created_at: string;
    parent_id: string | null;
    profiles: { username: string } | null;
  };

  const allComments = (commentData ?? []) as CommentRow[];
  const topComments = allComments.filter((c) => !c.parent_id);
  const replyMap = new Map<string, CommentRow[]>();
  for (const c of allComments.filter((c) => c.parent_id)) {
    const arr = replyMap.get(c.parent_id!) ?? [];
    arr.push(c);
    replyMap.set(c.parent_id!, arr);
  }
  const commentsWithReplies = topComments.map((c) => ({
    id: c.id,
    user_id: c.user_id,
    content: c.content,
    created_at: c.created_at,
    username: c.profiles?.username ?? null,
    replies: (replyMap.get(c.id) ?? []).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      content: r.content,
      created_at: r.created_at,
      username: r.profiles?.username ?? null,
    })),
  }));

  // Inline SVG
  let svgInline: string | null = null;
  if (svgUrl) {
    try {
      const res = await fetch(svgUrl, { cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        if (text.trim().startsWith('<svg')) svgInline = text;
      }
    } catch {
      svgInline = null;
    }
  }

  // KiCad auto-generates `#PWR…` reference designators for every power
  // symbol (`+3.3V`, `GND`, `5V`, …). These aren't physical parts you'd
  // ever buy from LCSC, so they have no real LCSC match — the search just
  // ends up matching the Value text to some unrelated SKU (e.g. "+3.3V"
  // → some C25804 resistor). Drop them from the BOM so it lists only
  // sourceable components.
  const bomPanelRows = bomRows
    .map((r) => ({
      designator: typeof r.designator === 'string' ? r.designator : '?',
      value: typeof r.value === 'string' ? r.value : '',
      mpn: null,
    }))
    .filter((r) => !r.designator.startsWith('#'));

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-3xl flex-col px-6 py-12">
      {/* Header */}
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          <span>{visibility}</span>
          <span>·</span>
          <span>{componentCount} component{componentCount === 1 ? '' : 's'}</span>
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
          {isOwner && (
            <span className="ml-2 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider">
              yours
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {user && <StarButton circuitId={params.id} initialStarred={isStarred} initialCount={starCount} />}
          {user && <FavoriteButton circuitId={params.id} initialFavorited={isFavorited} />}
        </div>
      </div>

      {/* Fork lineage — only renders when there's lineage or descendants */}
      <ForkBreadcrumb parent={parentAncestor} root={rootAncestor} forkCount={forkCount} />

      {description && (
        <p className="mt-6 max-w-prose text-sm leading-relaxed text-foreground">{description}</p>
      )}

      {/* Schematic viewer */}
      <section className="mt-8 rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Schematic</h2>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground opacity-60">
              hover to inspect · open in editor to edit
            </span>
            {isOwner && <RebuildButton circuitId={params.id} />}
          </div>
        </div>
        {svgInline ? (
          <SchematicViewer
            svgContent={svgInline}
            circuitId={params.id}
            rawKicadUrl={rawUrl}
            isOwner={isOwner}
            canEdit={!!user}
            title={title}
          />
        ) : svgUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={svgUrl} alt={`Render of ${title}`} className="block w-full" />
        ) : (
          <p className="text-sm text-muted-foreground">No render available.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {rawUrl && (
            <>
              <a href={rawUrl} className="underline hover:text-foreground" download>↓ .kicad_sch</a>
              <a href={rawUrl.replace(/\.kicad_sch$/, '.eencyc.sexp')} className="underline hover:text-foreground" download>↓ .eencyc.sexp</a>
            </>
          )}
          {svgUrl && (
            <a href={svgUrl} className="underline hover:text-foreground" target="_blank" rel="noreferrer">↗ SVG</a>
          )}
        </div>
      </section>

      {/* BOM + LCSC Pricing */}
      <BomPanel rows={bomPanelRows} />

      {/* AI summary */}
      <section className="mt-8 rounded-lg border border-border bg-card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI Summary</h2>
          {isOwner && <RegenerateButton circuitId={params.id} />}
        </div>
        {aiSummary ? (
          <>
            <p className="mt-3 text-sm leading-relaxed text-foreground">{aiSummary}</p>
            {aiStruct && <SummaryStruct s={aiStruct} />}
          </>
        ) : summaryFailure ? (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
            <p className="font-mono uppercase tracking-wider text-destructive">
              {summaryFailure.code} · {new Date(summaryFailure.at).toLocaleString()}
            </p>
            <p className="mt-1 font-mono leading-relaxed text-destructive/90">
              {summaryFailure.message || 'No details captured.'}
            </p>
            <p className="mt-2 text-muted-foreground">
              {summaryFailure.code === 'AUTH' ? 'ANTHROPIC_API_KEY missing or invalid.'
                : summaryFailure.code === 'RATE_LIMIT' ? 'Rate-limited. Wait a minute and click Regenerate.'
                : summaryFailure.code === 'TIMEOUT' ? 'Timed out. Click Regenerate to retry.'
                : 'Click Regenerate to retry.'}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Summary not generated yet.{isOwner ? ' Click Regenerate above.' : ''}
          </p>
        )}
      </section>

      {/* DC Simulator */}
      <SimPanel circuitId={params.id} />

      {/* Comments */}
      <CommentsSection
        circuitId={params.id}
        comments={commentsWithReplies}
        currentUserId={user?.id ?? null}
      />

      <footer className="mt-auto pt-12 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        AI-assisted output. Verify against datasheets and standards before fabrication.
      </footer>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Structured summary renderer
// ---------------------------------------------------------------------------

function SummaryStruct({ s }: { s: Record<string, unknown> }) {
  const topology = typeof s['topology'] === 'string' ? s['topology'] : null;
  const intent = typeof s['intent'] === 'string' ? s['intent'] : null;
  const category = typeof s['category'] === 'string' ? s['category'] : null;
  const rails = Array.isArray(s['rails']) ? s['rails'].filter(Boolean) : [];
  const concerns = Array.isArray(s['concerns']) ? s['concerns'].filter(Boolean) : [];
  const designNotes = typeof s['design_notes'] === 'string' ? s['design_notes'] : null;
  const keyComponents = Array.isArray(s['key_components'])
    ? (s['key_components'] as Array<Record<string, unknown>>)
    : [];

  return (
    <dl className="mt-4 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-[max-content_1fr]">
      {topology && <Row label="Topology" value={topology} />}
      {intent && <Row label="Intent" value={intent} />}
      {category && <Row label="Category" value={category} />}
      {rails.length > 0 && <Row label="Rails" value={rails.map(String).join(', ')} />}
      {keyComponents.length > 0 && (
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
      )}
      {concerns.length > 0 && (
        <>
          <dt className="font-mono uppercase tracking-wider text-muted-foreground">Concerns</dt>
          <dd className="text-foreground">
            <ul className="list-disc space-y-0.5 pl-4">
              {concerns.map((c, i) => <li key={i}>{String(c)}</li>)}
            </ul>
          </dd>
        </>
      )}
      {designNotes && <Row label="Design notes" value={designNotes} />}
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
