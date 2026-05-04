'use client';

import { useState, useTransition, useRef } from 'react';
import { addComment, deleteComment } from '@/lib/circuits/comments';

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  username?: string | null;
  replies?: Comment[];
}

interface Props {
  circuitId: string;
  comments: Comment[];
  currentUserId: string | null;
}

export function CommentsSection({ circuitId, comments, currentUserId }: Props) {
  return (
    <section className="mt-8 rounded-lg border border-border bg-card p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Discussion
        <span className="ml-2 font-normal opacity-60">({comments.length})</span>
      </h2>

      <div className="mt-4 space-y-4">
        {comments.map((c) => (
          <CommentItem
            key={c.id}
            comment={c}
            circuitId={circuitId}
            currentUserId={currentUserId}
            depth={0}
          />
        ))}
      </div>

      {currentUserId ? (
        <CommentForm circuitId={circuitId} label="Leave a comment" />
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          <a href="/login" className="underline hover:text-foreground">Sign in</a> to comment.
        </p>
      )}
    </section>
  );
}

function CommentItem({
  comment, circuitId, currentUserId, depth,
}: {
  comment: Comment;
  circuitId: string;
  currentUserId: string | null;
  depth: number;
}) {
  const [showReply, setShowReply] = useState(false);
  const [pending, startTransition] = useTransition();
  const isOwn = currentUserId === comment.user_id;

  function handleDelete() {
    startTransition(async () => {
      await deleteComment({ commentId: comment.id, circuitId });
    });
  }

  return (
    <div className={depth > 0 ? 'ml-6 border-l border-border pl-4' : ''}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">@{comment.username ?? 'unknown'}</span>
          <span>·</span>
          <time dateTime={comment.created_at}>
            {new Date(comment.created_at).toLocaleDateString()}
          </time>
        </div>
        <div className="flex gap-3 font-mono text-[11px] text-muted-foreground">
          {depth === 0 && currentUserId && (
            <button onClick={() => setShowReply(!showReply)} className="hover:text-foreground">
              reply
            </button>
          )}
          {isOwn && (
            <button
              onClick={handleDelete}
              disabled={pending}
              className="text-destructive/60 hover:text-destructive"
            >
              delete
            </button>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-foreground">{comment.content}</p>

      {showReply && (
        <div className="mt-3">
          <CommentForm
            circuitId={circuitId}
            parentId={comment.id}
            label="Reply"
            onDone={() => setShowReply(false)}
          />
        </div>
      )}

      {comment.replies?.map((r) => (
        <CommentItem
          key={r.id} comment={r} circuitId={circuitId}
          currentUserId={currentUserId} depth={depth + 1}
        />
      ))}
    </div>
  );
}

function CommentForm({
  circuitId, parentId, label, onDone,
}: {
  circuitId: string;
  parentId?: string;
  label: string;
  onDone?: () => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);

  function submit() {
    if (!value.trim()) return;
    startTransition(async () => {
      const r = await addComment({ circuitId, content: value, parentId });
      if (r.ok) {
        setValue('');
        setError(null);
        onDone?.();
      } else {
        setError(r.error ?? 'Failed to post.');
      }
    });
  }

  return (
    <div className="mt-3">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Write something..."
        rows={3}
        className={[
          'w-full resize-none rounded-md border border-border bg-background px-3 py-2',
          'text-sm text-foreground placeholder:text-muted-foreground',
          'focus:outline-none focus:ring-1 focus:ring-ring',
        ].join(' ')}
      />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      <button
        onClick={submit}
        disabled={pending || !value.trim()}
        className={[
          'mt-2 inline-flex h-8 items-center rounded-md bg-primary px-4 text-xs font-medium',
          'text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
        ].join(' ')}
      >
        {pending ? 'Posting…' : label}
      </button>
    </div>
  );
}
