'use client';

/**
 * SharedSchematicViewer
 *
 * Renders a shared (scratch-built) schematic with:
 *   - The SchematicEditor (read-only unless owner has toggled edit mode)
 *   - Like / Star buttons
 *   - Comments thread with submission form
 */

import { useState, useTransition } from 'react';
import { SchematicEditorClient as SchematicEditor } from '@/components/schematic/SchematicEditorClient';
import type { EditorState } from '@/components/schematic/editorTypes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SharedComment {
  id: string;
  text: string;
  username: string;
  createdAt: string;
}

interface Props {
  slug: string;
  title: string;
  ownerUsername: string;
  createdAt: string;   // ISO string
  initialLikes: number;
  initialStars: number;
  initialState: EditorState;
  isOwner: boolean;
  initialComments: SharedComment[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SharedSchematicViewer({
  slug,
  title,
  ownerUsername,
  createdAt,
  initialLikes,
  initialStars,
  initialState,
  isOwner,
  initialComments,
}: Props) {
  const [editMode, setEditMode] = useState(false);
  const [likes, setLikes] = useState(initialLikes);
  const [stars, setStars] = useState(initialStars);
  const [comments, setComments] = useState<SharedComment[]>(initialComments);
  const [likePending, startLikeTransition] = useTransition();
  const [starPending, startStarTransition] = useTransition();

  // ----- Action: toggle like -----
  function handleLike() {
    startLikeTransition(async () => {
      try {
        const res = await fetch(`/api/schematic/${slug}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'like' }),
        });
        if (res.ok) {
          const data = (await res.json()) as { likes: number };
          setLikes(data.likes);
        }
      } catch {
        // silent — stale count shown
      }
    });
  }

  // ----- Action: toggle star -----
  function handleStar() {
    startStarTransition(async () => {
      try {
        const res = await fetch(`/api/schematic/${slug}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'star' }),
        });
        if (res.ok) {
          const data = (await res.json()) as { stars: number };
          setStars(data.stars);
        }
      } catch {
        // silent
      }
    });
  }

  // ----- Action: append new comment (called by form) -----
  function handleCommentAdded(comment: SharedComment) {
    setComments((prev) => [...prev, comment]);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ---- Editor / Viewer ---- */}
      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
          <div className="flex items-center gap-4 font-mono text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">{title}</span>
            <span>by @{ownerUsername}</span>
            <span>{new Date(createdAt).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Social actions */}
            <SocialButton
              icon={<HeartIcon />}
              count={likes}
              onClick={handleLike}
              disabled={likePending}
              label="Like this schematic"
            />
            <SocialButton
              icon={<StarIcon />}
              count={stars}
              onClick={handleStar}
              disabled={starPending}
              label="Star this schematic"
            />
            {/* Owner edit toggle */}
            {isOwner && (
              <button
                onClick={() => setEditMode((m) => !m)}
                className={[
                  'inline-flex h-7 items-center gap-1.5 rounded-md border px-3 font-mono text-[11px]',
                  'uppercase tracking-wider transition-colors',
                  editMode
                    ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
                    : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                ].join(' ')}
              >
                {editMode ? 'Stop editing' : 'Edit'}
              </button>
            )}
          </div>
        </div>

        <div className="px-2 py-1 font-mono text-[10px] text-muted-foreground opacity-60">
          {editMode ? 'Editing mode' : 'Read-only view'}
        </div>

        <SchematicEditor
          initialState={initialState}
          readOnly={!editMode}
          className="h-[60vh]"
        />
      </section>

      {/* ---- Comments ---- */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Discussion
          <span className="ml-2 font-normal opacity-60">({comments.length})</span>
        </h2>

        <div className="mt-4 space-y-4">
          {comments.map((c) => (
            <CommentItem key={c.id} comment={c} />
          ))}
          {comments.length === 0 && (
            <p className="text-[13px] text-muted-foreground">No comments yet. Be the first!</p>
          )}
        </div>

        <CommentForm slug={slug} onAdded={handleCommentAdded} />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Social button
// ---------------------------------------------------------------------------

function SocialButton({
  icon,
  count,
  onClick,
  disabled,
  label,
}: {
  icon: React.ReactNode;
  count: number;
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={[
        'inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5',
        'font-mono text-[11px] uppercase tracking-wider transition-colors',
        'bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground',
        disabled ? 'opacity-50 cursor-not-allowed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon}
      <span>{count}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Icons (inline SVG)
// ---------------------------------------------------------------------------

function HeartIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Comment item
// ---------------------------------------------------------------------------

function CommentItem({ comment }: { comment: SharedComment }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 font-mono text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">
          @{comment.username}
        </span>
        <span>·</span>
        <time dateTime={comment.createdAt}>
          {new Date(comment.createdAt).toLocaleDateString()}
        </time>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-foreground">{comment.text}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comment form
// ---------------------------------------------------------------------------

function CommentForm({
  slug,
  onAdded,
}: {
  slug: string;
  onAdded: (comment: SharedComment) => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;

    startTransition(async () => {
      try {
        const res = await fetch(`/api/schematic/${slug}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmed }),
        });
        if (res.status === 401) {
          setError('Sign in to comment.');
          return;
        }
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          setError(data.error ?? 'Failed to post comment.');
          return;
        }
        const data = (await res.json()) as {
          comment: {
            id: string;
            user_id: string;
            text: string;
            created_at: string;
          };
        };
        onAdded({
          id: data.comment.id,
          text: data.comment.text,
          // Optimistic: username not returned by the insert. Page refresh shows real username.
          username: 'you',
          createdAt: data.comment.created_at,
        });
        setValue('');
        setError(null);
      } catch {
        setError('Network error. Try again.');
      }
    });
  }

  return (
    <div className="mt-4">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Write something…"
        rows={3}
        className={[
          'w-full resize-none rounded-md border border-border bg-background px-3 py-2',
          'text-sm text-foreground placeholder:text-muted-foreground',
          'focus:outline-none focus:ring-1 focus:ring-ring',
        ].join(' ')}
      />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={pending || !value.trim()}
          className={[
            'inline-flex h-8 items-center rounded-md bg-primary px-4 text-xs font-medium',
            'text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
          ].join(' ')}
        >
          {pending ? 'Posting…' : 'Post'}
        </button>
        <span className="font-mono text-[10px] text-muted-foreground opacity-60">
          Sign in required to post
        </span>
      </div>
    </div>
  );
}
