/**
 * /profile/[username] — public profile view.
 *
 * RLS allows `select` on profiles for everyone (`profiles read all` policy),
 * so we can fetch with the cookie-bound server client. Anonymous visitors
 * also see the page.
 *
 * Edits happen on /settings (not built yet — V0 scope).
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { USERNAME_REGEX } from '@/lib/auth/username';

interface Params {
  params: { username: string };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  // No DB read for metadata — the username itself is enough for the title.
  return {
    title: `@${params.username}`,
    description: `eencyclopedia profile for @${params.username}.`,
  };
}

export default async function ProfilePage({ params }: Params) {
  const u = params.username.toLowerCase();
  if (!USERNAME_REGEX.test(u)) notFound();

  const supabase = createSupabaseServerClient();
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, karma, tier, bio, avatar_url, created_at')
    .eq('username', u)
    .maybeSingle();

  if (error || !profile) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = user && profile.id === user.id;

  // Cast known string fields explicitly — `Database` is the permissive
  // placeholder until `pnpm db:types` runs against Supabase.
  const username = String(profile.username);
  const displayName =
    typeof profile.display_name === 'string' ? profile.display_name : null;
  const karma =
    typeof profile.karma === 'number' ? profile.karma : 0;
  const tier = typeof profile.tier === 'string' ? profile.tier : 'free';
  const bio = typeof profile.bio === 'string' ? profile.bio : null;
  const createdAt =
    typeof profile.created_at === 'string' ? profile.created_at : null;

  const circuitsQuery = supabase
    .from('schematics')
    .select('id, title, component_count, visibility, created_at')
    .eq('owner_id', profile.id)
    .order('created_at', { ascending: false });

  // If not the owner, only show public circuits. Unlisted and private are hidden.
  if (!isOwner) {
    circuitsQuery.eq('visibility', 'public');
  }

  const { data: circuits } = await circuitsQuery;

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-3xl flex-col px-6 py-12">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">@{username}</h1>
          {displayName ? (
            <p className="mt-1 text-sm text-muted-foreground">{displayName}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">
          <span>tier {tier}</span>
          <span>·</span>
          <span>{karma} karma</span>
        </div>
      </header>

      {bio ? (
        <p className="mt-6 max-w-prose text-sm leading-relaxed text-foreground">
          {bio}
        </p>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">No bio yet.</p>
      )}

      <section className="mt-12">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Circuits
        </h2>
        {circuits && circuits.length > 0 ? (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {circuits.map((circuit) => (
              <li key={circuit.id}>
                <Link
                  href={`/circuit/${circuit.id}`}
                  className="group block py-4 hover:bg-muted/30"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="text-base font-medium group-hover:underline">
                      {circuit.title}
                    </h3>
                    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {isOwner ? (
                        <span className="rounded border border-border bg-muted/50 px-1 py-0.5">
                          {circuit.visibility}
                        </span>
                      ) : null}
                      <span>{circuit.component_count} parts</span>
                    </div>
                  </div>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Uploaded {new Date(circuit.created_at).toLocaleDateString()}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            {isOwner
              ? "You haven't uploaded any circuits yet."
              : `@${username} hasn't shared any public circuits yet.`}
          </p>
        )}
      </section>

      {isOwner ? (
        <footer className="mt-auto pt-12 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          <p>
            This is your profile. Settings page is on the V0 backlog —{' '}
            <Link href="/onboarding" className="underline hover:text-foreground">
              re-run onboarding
            </Link>{' '}
            if you need to change your explanation mode for now.
          </p>
        </footer>
      ) : null}

      {createdAt ? (
        <p className="mt-12 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Joined {new Date(createdAt).toLocaleDateString()}
        </p>
      ) : null}
    </main>
  );
}
