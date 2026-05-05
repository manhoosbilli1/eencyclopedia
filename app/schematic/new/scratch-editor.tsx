'use client';

/**
 * ScratchEditor — client component for /schematic/new.
 *
 * Wraps SchematicEditor with:
 *   - Title input (used when sharing)
 *   - Share button: serialises state → POST /api/schematic/share → copy URL + toast
 */

import { useState, useCallback, useTransition } from 'react';
import { SchematicEditorClient } from '@/components/schematic/SchematicEditorClient';
import { EMPTY_STATE } from '@/components/schematic/editorTypes';
import type { EditorState } from '@/components/schematic/editorTypes';

type Toast =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

export function ScratchEditor() {
  const [editorState, setEditorState] = useState<EditorState>(EMPTY_STATE);
  const [title, setTitle] = useState('Untitled Schematic');
  const [toast, setToast] = useState<Toast | null>(null);
  const [pending, startTransition] = useTransition();

  const handleChange = useCallback((state: EditorState) => {
    setEditorState(state);
  }, []);

  function showToast(t: Toast) {
    setToast(t);
    setTimeout(() => setToast(null), 4000);
  }

  function handleShare() {
    const stateJson = JSON.stringify(editorState);

    startTransition(async () => {
      try {
        const res = await fetch('/api/schematic/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim() || 'Untitled Schematic', stateJson }),
        });

        if (res.status === 401) {
          showToast({ kind: 'error', message: 'Sign in to share your schematic.' });
          return;
        }

        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          showToast({ kind: 'error', message: data.error ?? 'Share failed.' });
          return;
        }

        const data = (await res.json()) as { url: string };
        const fullUrl = `${window.location.origin}${data.url}`;

        try {
          await navigator.clipboard.writeText(fullUrl);
          showToast({ kind: 'success', message: `Link copied! ${fullUrl}` });
        } catch {
          // Clipboard API blocked (non-https or permission denied) — show URL in toast
          showToast({ kind: 'success', message: `Shared at: ${fullUrl}` });
        }
      } catch {
        showToast({ kind: 'error', message: 'Network error. Check your connection.' });
      }
    });
  }

  return (
    <div className="relative flex flex-1 flex-col">
      {/* Toolbar bar above the editor */}
      <div className="flex items-center gap-3 border-b border-border bg-background px-4 py-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Schematic title…"
          maxLength={200}
          className={[
            'flex-1 rounded-md border border-border bg-transparent px-3 py-1.5 text-sm',
            'text-foreground placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring',
          ].join(' ')}
        />
        <button
          onClick={handleShare}
          disabled={pending}
          className={[
            'inline-flex h-8 items-center gap-2 rounded-md bg-primary px-4 text-xs font-medium',
            'text-primary-foreground transition-colors hover:bg-primary/90',
            'disabled:cursor-not-allowed disabled:opacity-60',
          ].join(' ')}
        >
          {pending ? (
            <>
              <SpinnerIcon />
              Sharing…
            </>
          ) : (
            <>
              <ShareIcon />
              Share
            </>
          )}
        </button>
      </div>

      {/* Editor — fills remaining height. Loaded ssr:false via the client
          wrapper so production builds never see a hydration mismatch on the
          interactive subtree. */}
      <SchematicEditorClient
        initialState={EMPTY_STATE}
        onChange={handleChange}
        className="flex-1"
      />

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={[
            'fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg px-5 py-3 shadow-xl',
            'max-w-[min(90vw,480px)] text-center text-sm font-medium',
            toast.kind === 'success'
              ? 'bg-foreground text-background'
              : 'bg-destructive text-destructive-foreground',
          ].join(' ')}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

function ShareIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
