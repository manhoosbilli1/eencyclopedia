'use client';

/**
 * Catches runtime errors thrown by the SchematicEditor tree and shows a
 * recoverable fallback UI instead of a blank page or a crashed React tree.
 *
 * Why this exists: the editor mounts a lot of mouse/keyboard handlers and
 * useReducer state. A single bad render (e.g. a malformed lib_id from an
 * upload) used to take the whole page down silently in production builds
 * because Next.js's default error UI doesn't trigger for client-side throws
 * inside event handlers/effects.
 */

import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface State {
  error: Error | null;
}

export class EditorErrorBoundary extends React.Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[SchematicEditor] crashed:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 bg-card p-6 text-center">
        <div className="font-mono text-[10px] uppercase tracking-wider text-destructive">
          Editor crashed
        </div>
        <p className="max-w-md text-sm text-muted-foreground">
          The schematic editor hit a runtime error. Refresh the page or click
          retry to reload it. If this keeps happening please report the issue.
        </p>
        <pre className="max-h-32 max-w-md overflow-auto rounded border border-border bg-muted/30 p-2 text-left font-mono text-[10px] text-muted-foreground">
          {error.message}
        </pre>
        <button
          type="button"
          onClick={this.reset}
          className="rounded border border-border bg-muted/30 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-foreground hover:bg-muted"
        >
          ↻ Retry
        </button>
      </div>
    );
  }
}
