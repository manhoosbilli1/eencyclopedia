'use client';

/**
 * Star toggle for the current circuit. Uses an optimistic-update pattern
 * (flip the state immediately, roll back if the action errors) so the UI
 * feels instant. Failures show an inline message — they're rare (only on
 * network drops or RLS edge cases).
 */

import { useState, useTransition } from 'react';
import { toggleCircuitFavorite } from '@/lib/favorites/actions';

export function FavoriteButton({
  circuitId,
  initialFavorited,
}: {
  circuitId: string;
  initialFavorited: boolean;
}) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    if (isPending) return;
    const optimistic = !favorited;
    setFavorited(optimistic);
    setError(null);
    startTransition(async () => {
      const r = await toggleCircuitFavorite(circuitId);
      if (!r.ok) {
        setFavorited(!optimistic); // rollback
        setError(r.error);
        return;
      }
      // Server-side state may differ if another tab toggled — trust the result.
      setFavorited(r.favorited);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        aria-pressed={favorited}
        title={favorited ? 'Remove from favorites' : 'Save to favorites'}
        className={
          'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ' +
          (favorited
            ? 'border-amber-400/60 bg-amber-400/10 text-amber-500 hover:bg-amber-400/20'
            : 'border-border bg-background text-muted-foreground hover:bg-muted')
        }
      >
        <span aria-hidden>{favorited ? '★' : '☆'}</span>
        {favorited ? 'Favorited' : 'Favorite'}
      </button>
      {error ? (
        <span role="alert" className="text-[10px] text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
