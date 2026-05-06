'use client';

import { useCallback, useState, useTransition } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export interface SuggestionRow {
  id: string;
  author_id: string;
  title: string;
  body: string | null;
  status: 'open' | 'planned' | 'in_progress' | 'done' | 'wont_do';
  upvotes: number;
  created_at: string;
  authorUsername: string | null;
  youUpvoted: boolean;
}

interface Props {
  initialRows: SuggestionRow[];
  signedIn: boolean;
}

const STATUS_LABEL: Record<SuggestionRow['status'], { label: string; cls: string }> = {
  open:        { label: 'open',         cls: 'bg-muted text-muted-foreground border-border' },
  planned:     { label: 'planned',      cls: 'bg-sky-500/10 text-sky-700 border-sky-500/30' },
  in_progress: { label: 'in progress',  cls: 'bg-amber-500/10 text-amber-700 border-amber-500/30' },
  done:        { label: 'done',         cls: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' },
  wont_do:     { label: "won't do",     cls: 'bg-red-500/10 text-red-700 border-red-500/30' },
};

export function SuggestionsClient({ initialRows, signedIn }: Props) {
  const supabase = createSupabaseBrowserClient();
  const [rows, setRows] = useState(initialRows);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, startSubmit] = useTransition();
  const [voting, startVote] = useTransition();
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const handleSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!signedIn) {
      setErrMsg('Sign in to post a suggestion.');
      return;
    }
    const t = title.trim();
    if (t.length < 3) { setErrMsg('Title must be at least 3 characters.'); return; }
    if (t.length > 200) { setErrMsg('Title must be ≤ 200 characters.'); return; }
    setErrMsg(null);
    startSubmit(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setErrMsg('Session expired — sign in again.'); return; }
      const { data, error } = await supabase
        .from('suggestions')
        .insert({
          author_id: user.id,
          title: t,
          body: body.trim() || null,
        } as never)
        .select('id, author_id, title, body, status, upvotes, created_at')
        .single();
      if (error || !data) {
        setErrMsg(error?.message ?? 'Could not post suggestion.');
        return;
      }
      const row = data as Omit<SuggestionRow, 'authorUsername' | 'youUpvoted'>;
      setRows((prev) => [
        { ...row, authorUsername: null, youUpvoted: false },
        ...prev,
      ]);
      setTitle('');
      setBody('');
    });
  }, [supabase, title, body, signedIn]);

  const handleUpvote = useCallback((id: string, currently: boolean) => {
    if (!signedIn) {
      setErrMsg('Sign in to upvote.');
      return;
    }
    setErrMsg(null);
    // Optimistic UI: toggle locally before the round-trip lands.
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, youUpvoted: !currently, upvotes: r.upvotes + (currently ? -1 : 1) }
          : r,
      ),
    );
    startVote(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Revert
        setRows((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, youUpvoted: currently, upvotes: r.upvotes + (currently ? 1 : -1) }
              : r,
          ),
        );
        setErrMsg('Session expired — sign in again.');
        return;
      }
      const op = currently
        ? supabase
            .from('suggestion_upvotes')
            .delete()
            .eq('suggestion_id', id)
            .eq('user_id', user.id)
        : supabase
            .from('suggestion_upvotes')
            .insert({ suggestion_id: id, user_id: user.id } as never);
      const { error } = await op;
      if (error) {
        // Revert on failure
        setRows((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, youUpvoted: currently, upvotes: r.upvotes + (currently ? 1 : -1) }
              : r,
          ),
        );
        setErrMsg(error.message);
      }
    });
  }, [supabase, signedIn]);

  return (
    <div className="space-y-8">
      {/* Compose */}
      {signedIn && (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
        >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Suggestion title (e.g. ‘LTspice import’)"
            maxLength={200}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/30"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Optional details…"
            maxLength={4000}
            rows={3}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/30"
          />
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {title.length}/200 · {body.length}/4000
            </span>
            <button
              type="submit"
              disabled={submitting || title.trim().length < 3}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Posting…' : 'Post suggestion'}
            </button>
          </div>
        </form>
      )}

      {errMsg && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errMsg}
        </div>
      )}

      {/* List */}
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          No suggestions yet — be the first.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((s) => {
            const status = STATUS_LABEL[s.status];
            return (
              <li
                key={s.id}
                className="flex gap-4 rounded-lg border border-border bg-card p-4"
              >
                <button
                  type="button"
                  onClick={() => handleUpvote(s.id, s.youUpvoted)}
                  disabled={voting}
                  aria-pressed={s.youUpvoted}
                  className={[
                    'flex w-12 flex-none flex-col items-center justify-center gap-0.5 rounded-md border px-2 py-1.5 text-sm font-semibold transition-colors',
                    s.youUpvoted
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-background text-foreground hover:bg-muted',
                    voting && 'cursor-not-allowed opacity-70',
                  ].filter(Boolean).join(' ')}
                  title={s.youUpvoted ? 'Remove upvote' : 'Upvote'}
                >
                  <span aria-hidden>▲</span>
                  <span className="font-mono text-xs">{s.upvotes}</span>
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h3 className="text-base font-semibold leading-tight">{s.title}</h3>
                    <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${status.cls}`}>
                      {status.label}
                    </span>
                  </div>
                  {s.body && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{s.body}</p>
                  )}
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {s.authorUsername ? `@${s.authorUsername}` : 'anonymous'} · {new Date(s.created_at).toLocaleDateString()}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
