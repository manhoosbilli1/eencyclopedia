/**
 * /suggestions — public suggestion box.
 *
 * Server component: lists all suggestions newest-first (with upvote counts),
 * marks which ones the current user has already upvoted, and renders a form
 * (visible to authed users only). The form + upvote buttons are a client
 * island so the page itself stays a fast SSR render.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SuggestionsClient, type SuggestionRow } from './suggestions-client';

export const metadata: Metadata = {
  title: 'Suggestions',
  description: 'Public roadmap board. Authenticated users post and upvote suggestions.',
};

export const dynamic = 'force-dynamic';

export default async function SuggestionsPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: suggestionsRaw } = await supabase
    .from('suggestions')
    .select('id, author_id, title, body, status, upvotes, created_at')
    .order('upvotes', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);

  const suggestions = (suggestionsRaw ?? []) as Array<Omit<SuggestionRow, 'authorUsername' | 'youUpvoted'>>;

  // Resolve usernames + which ones the current user upvoted (one query each).
  const authorIds = [...new Set(suggestions.map((s) => s.author_id))];
  const { data: profileRows } = authorIds.length > 0
    ? await supabase.from('profiles').select('id, username').in('id', authorIds)
    : { data: [] };
  const usernameById = new Map(
    ((profileRows ?? []) as Array<{ id: string; username: string }>).map((r) => [r.id, r.username]),
  );

  let upvotedSet = new Set<string>();
  if (user && suggestions.length > 0) {
    const ids = suggestions.map((s) => s.id);
    const { data: votes } = await supabase
      .from('suggestion_upvotes')
      .select('suggestion_id')
      .eq('user_id', user.id)
      .in('suggestion_id', ids);
    upvotedSet = new Set(((votes ?? []) as Array<{ suggestion_id: string }>).map((v) => v.suggestion_id));
  }

  const rows: SuggestionRow[] = suggestions.map((s) => ({
    ...s,
    authorUsername: usernameById.get(s.author_id) ?? null,
    youUpvoted: upvotedSet.has(s.id),
  }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          /suggestions
        </div>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Suggestion box</h1>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">
          Public roadmap. Anyone can read; signed-in users post and upvote.
          Top of the list = most-wanted. See also the{' '}
          <Link href="/features" className="underline hover:text-foreground">features page</Link>{' '}
          for current status, and the{' '}
          <Link href="/wiki" className="underline hover:text-foreground">wiki</Link>{' '}
          for usage docs.
        </p>
      </header>

      {!user && (
        <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4 text-sm">
          <p>
            <Link href="/login?next=/suggestions" className="underline hover:text-foreground">Sign in</Link>{' '}
            to post a suggestion or upvote.
          </p>
        </div>
      )}

      <SuggestionsClient initialRows={rows} signedIn={!!user} />

      <footer className="mt-12 border-t border-border pt-6 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Be specific. One suggestion per submission. We read every one.
      </footer>
    </main>
  );
}
