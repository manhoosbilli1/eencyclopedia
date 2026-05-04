/**
 * /favorites — circuits the current user has starred.
 *
 * Two-step query:
 *   1. circuit_favorites WHERE user_id = me, latest first (RLS scopes to me).
 *   2. schematics WHERE id IN (those circuit_ids). RLS on schematics still
 *      applies — if a public circuit was made private since I starred it I
 *      may no longer see it. We surface that as "Hidden by owner" in the UI.
 *
 * Auth: protected by middleware (in PROTECTED_PREFIXES). Belt-and-braces:
 * also redirect here if somehow we got through without a user.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Favorites',
  description: 'Circuits you have starred.',
};

export const dynamic = 'force-dynamic';

interface FavoriteRow {
  circuit_id: string;
  created_at: string;
}

interface CircuitRow {
  id: string;
  title: string;
  description: string | null;
  visibility: string;
  component_count: number;
  ai_summary: string | null;
  svg_url: string | null;
  owner_id: string;
  created_at: string;
}

export default async function FavoritesPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/favorites');

  const { data: favs } = await supabase
    .from('circuit_favorites')
    .select('circuit_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);
  const favoriteRows = (favs ?? []) as FavoriteRow[];
  const ids = favoriteRows.map((f) => f.circuit_id);

  const circuitsById = new Map<string, CircuitRow>();
  if (ids.length > 0) {
    const { data: circuits } = await supabase
      .from('schematics')
      .select(
        'id, title, description, visibility, component_count, ai_summary, svg_url, owner_id, created_at',
      )
      .in('id', ids);
    for (const c of (circuits ?? []) as CircuitRow[]) {
      circuitsById.set(c.id, c);
    }
  }

  // Resolve owner usernames (one batch).
  const ownerIds = Array.from(new Set(Array.from(circuitsById.values()).map((c) => c.owner_id)));
  const usernamesById = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', ownerIds);
    for (const p of (profs ?? []) as Array<{ id: string; username: string }>) {
      if (p.id && p.username) usernamesById.set(p.id, p.username);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-5xl flex-col px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Favorites</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Your starred circuits. Visit a circuit and click the ★ to add or
            remove from this list.
          </p>
        </div>
        <Link
          href="/library"
          className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground underline hover:text-foreground"
        >
          ← Back to library
        </Link>
      </header>

      {favoriteRows.length === 0 ? (
        <section className="mt-12 rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No favorites yet. Open any circuit and click the ★ button to save it
            here.
          </p>
        </section>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {favoriteRows.map((fav) => {
            const c = circuitsById.get(fav.circuit_id);
            if (!c) {
              // The circuit became private/deleted since starring.
              return (
                <li
                  key={fav.circuit_id}
                  className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-xs text-muted-foreground"
                >
                  <p className="font-mono">{fav.circuit_id}</p>
                  <p className="mt-1">Hidden by owner or deleted.</p>
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-wider">
                    starred {new Date(fav.created_at).toLocaleDateString()}
                  </p>
                </li>
              );
            }
            const ownerUsername = usernamesById.get(c.owner_id) ?? null;
            return (
              <li key={c.id}>
                <article className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 hover:border-foreground/40 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/circuit/${c.id}`}
                      className="font-medium tracking-tight hover:text-foreground/80"
                    >
                      {c.title || 'Untitled'}
                    </Link>
                    <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {c.visibility}
                    </span>
                  </div>
                  {c.svg_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.svg_url}
                      alt={`Render of ${c.title}`}
                      className="my-1 max-h-32 w-full rounded border border-border bg-background object-contain p-2"
                      loading="lazy"
                    />
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span>{c.component_count} comp</span>
                    {ownerUsername ? (
                      <>
                        <span>·</span>
                        <Link
                          href={`/profile/${ownerUsername}`}
                          className="hover:text-foreground"
                        >
                          @{ownerUsername}
                        </Link>
                      </>
                    ) : null}
                    <span>·</span>
                    <span>starred {new Date(fav.created_at).toLocaleDateString()}</span>
                  </div>
                  {c.ai_summary ? (
                    <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                      {c.ai_summary}
                    </p>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
