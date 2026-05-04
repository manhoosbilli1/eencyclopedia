/**
 * /library — Refactored to use Tailwind CSS for exact UI replication
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { BackfillButton } from './backfill-button';

export const metadata: Metadata = {
  title: 'Library',
  description: 'Your circuit uploads and the public eencyclopedia library.',
};

export const dynamic = 'force-dynamic';

interface SearchParams {
  q?: string;
  filter?: 'all' | 'mine' | 'public';
}

interface CircuitRow {
  id: string;
  title: string;
  description: string | null;
  visibility: 'public' | 'unlisted' | 'private';
  component_count: number;
  ai_summary: string | null;
  svg_url: string | null;
  owner_id: string;
  owner_username: string | null;
  created_at: string;
}

const ROW_COLUMNS =
  'id, title, description, visibility, component_count, ai_summary, svg_url, owner_id, created_at';

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userId = user?.id ?? null;
  const q = (searchParams.q ?? '').trim();
  const filter = searchParams.filter ?? 'all';

  const baseSelect = supabase.from('schematics').select(ROW_COLUMNS);

  const mineQuery =
    userId && (filter === 'all' || filter === 'mine')
      ? applySearch(baseSelect.eq('owner_id', userId), q)
        .order('created_at', { ascending: false })
        .limit(50)
      : null;

  const publicQuery =
    filter === 'all' || filter === 'public'
      ? applySearch(baseSelect.eq('visibility', 'public'), q)
        .order('created_at', { ascending: false })
        .limit(100)
      : null;

  const [mineRes, publicRes] = await Promise.all([
    mineQuery ? mineQuery : Promise.resolve({ data: null, error: null }),
    publicQuery ? publicQuery : Promise.resolve({ data: null, error: null }),
  ]);

  const mine = await hydrate(supabase, (mineRes.data ?? []) as CircuitRow[]);
  const pub = await hydrate(supabase, (publicRes.data ?? []) as CircuitRow[]);

  let stuckCount = 0;
  if (userId) {
    const { count } = await supabase
      .from('schematics')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', userId)
      .or('ai_summary.is.null,summary_embedding.is.null');
    stuckCount = count ?? 0;
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      {/* PAGE HEAD */}
      <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            /library
          </div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Library</h1>
          <p className="mt-2 text-base text-muted-foreground">
            Your circuits and the public corpus, indexed and searchable.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {stuckCount > 0 && <BackfillButton count={stuckCount} />}
          <Link
            href="/circuit/new"
            className="inline-flex h-10 items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
          >
            + Upload .kicad_sch
          </Link>
        </div>
      </div>

      {/* TOOLBAR */}
      <form action="/library" method="get" className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder='Search by topology, supply, intent — "low-pass for audio"'
            className="h-11 w-full rounded-md border border-border bg-transparent pl-10 pr-4 text-sm outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/30"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
          <FilterButton value="all" current={filter}>All</FilterButton>
          <FilterButton value="mine" current={filter}>Mine</FilterButton>
          <FilterButton value="public" current={filter}>Public</FilterButton>
          <span className="mx-2 h-5 w-px bg-border" />
          <FilterButton value="analog" current={filter}>Analog</FilterButton>
          <FilterButton value="digital" current={filter}>Digital</FilterButton>
          <FilterButton value="power" current={filter}>Power</FilterButton>
        </div>
      </form>

      {/* YOURS */}
      {mine.length > 0 && (
        <div className="mb-16">
          <GroupHeader title="Recently uploaded" count={mine.length} suffix="YOURS" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((c) => (
              <CircuitCard key={c.id} c={c} owner="self" />
            ))}
          </div>
        </div>
      )}

      {/* PUBLIC */}
      {pub.length > 0 && (
        <div className="mb-16">
          <GroupHeader title="From the public corpus" count={pub.length} suffix="CURATED + COMMUNITY" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {pub.map((c) => (
              <CircuitCard key={c.id} c={c} owner="other" />
            ))}
          </div>
        </div>
      )}

      <p className="mt-8 border-t border-border pt-8 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
        AI-assisted output. Verify against datasheets and standards before fabrication.
      </p>
    </main>
  );
}

// ---------- UI COMPONENTS ----------

function GroupHeader({ title, count, suffix }: { title: string; count: number; suffix: string }) {
  return (
    <div className="mb-6 flex items-baseline gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        {count} · {suffix}
      </span>
    </div>
  );
}

function FilterButton({ value, current, children }: { value: string; current: string; children: React.ReactNode }) {
  const isActive = current === value;
  return (
    <button
      type="submit"
      name="filter"
      value={value}
      className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${isActive ? 'border-foreground bg-foreground text-background' : 'border-border bg-transparent text-muted-foreground hover:bg-muted'
        }`}
    >
      {children}
    </button>
  );
}

function CircuitCard({ c, owner }: { c: CircuitRow; owner: 'self' | 'other' }) {
  return (
    <Link
      href={`/circuit/${c.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/30"
    >
      <div
        className="relative aspect-[2/1] w-full border-b border-border bg-muted/30 p-4"
        style={{
          backgroundImage: 'linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)',
          backgroundSize: '16px 16px',
        }}
      >
        {c.svg_url && (
          <img src={c.svg_url} alt={c.title} className="absolute inset-0 h-full w-full object-contain p-4" />
        )}
        <button className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-foreground">
          ☆
        </button>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="mb-2 text-[15px] font-semibold tracking-tight">{c.title || 'Untitled'}</h3>
        <p className="mb-4 line-clamp-2 text-[13.5px] leading-relaxed text-muted-foreground">
          {c.ai_summary || 'Summary not generated yet.'}
        </p>
        <div className="mt-auto flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-md border border-border bg-muted/50 px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
              {c.component_count} parts
            </span>
            <span className="rounded-md border border-border bg-muted/50 px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
              {c.visibility}
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background text-[9px]">
              {(c.owner_username ?? 'u')[0]!.toUpperCase()}
            </span>
            <span>{owner === 'other' && c.owner_username ? `@${c.owner_username}` : '@you'}</span>
            <span>·</span>
            <span>{new Date(c.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ---------- HELPERS ----------

function applySearch<T extends { textSearch: (...args: never[]) => unknown }>(q: T, query: string): T {
  if (!query) return q;
  return (q as any).textSearch('search_vector', query, { config: 'english', type: 'websearch' }) as T;
}

async function hydrate(supabase: any, rows: CircuitRow[]): Promise<CircuitRow[]> {
  const ownerIds = Array.from(new Set(rows.map((r) => r.owner_id))).filter(Boolean);
  if (ownerIds.length === 0) return rows;
  const { data } = await supabase.from('profiles').select('id, username').in('id', ownerIds);
  const byId = new Map(data?.map((p: any) => [p.id, p.username]) || []);
  return rows.map((r) => ({ ...r, owner_username: (byId.get(r.owner_id) as string | undefined) ?? null }));
}