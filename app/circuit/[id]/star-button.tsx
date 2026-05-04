'use client';

import { useState, useTransition } from 'react';
import { starCircuit, unstarCircuit } from '@/lib/circuits/stars';

interface Props {
  circuitId: string;
  initialStarred: boolean;
  initialCount: number;
}

export function StarButton({ circuitId, initialStarred, initialCount }: Props) {
  const [starred, setStarred] = useState(initialStarred);
  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      if (starred) {
        const r = await unstarCircuit(circuitId);
        if (r.ok) { setStarred(false); setCount((c) => Math.max(0, c - 1)); }
      } else {
        const r = await starCircuit(circuitId);
        if (r.ok) { setStarred(true); setCount((c) => c + 1); }
      }
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      aria-label={starred ? 'Unstar this circuit' : 'Star this circuit'}
      className={[
        'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-[11px]',
        'uppercase tracking-wider transition-colors',
        starred
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20'
          : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground',
        pending && 'opacity-60',
      ].join(' ')}
    >
      <svg
        width="13" height="13"
        viewBox="0 0 24 24"
        fill={starred ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="2"
      >
        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
      </svg>
      <span>{count}</span>
    </button>
  );
}
