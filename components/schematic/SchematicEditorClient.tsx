'use client';

/**
 * Client-only loader for the SchematicEditor.
 *
 * Why a separate file: the editor is a 2700-line client component with
 * heavy SVG / mouse / keyboard handlers. Loading it via next/dynamic with
 * ssr:false guarantees:
 *   - it never renders on the server (no chance of an SSR/CSR HTML mismatch)
 *   - it isn't pulled into the initial HTML bundle (smaller TTFB)
 *   - any chunk-load error is contained behind a placeholder + boundary
 *
 * Without this wrapper the editor renders fine in `pnpm dev` but exhibits
 * sporadic "buttons don't respond" issues in production builds where the
 * Sentry replay integration + Next.js hydration race can swallow click
 * handlers on heavy client subtrees.
 */

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import { EditorErrorBoundary } from './EditorErrorBoundary';
import type { SchematicEditor as SchematicEditorType } from './SchematicEditor';

const SchematicEditorInner = dynamic(
  () => import('./SchematicEditor').then((m) => ({ default: m.SchematicEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[420px] items-center justify-center bg-card">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Loading editor…
        </span>
      </div>
    ),
  },
);

export type SchematicEditorProps = ComponentProps<typeof SchematicEditorType>;

export function SchematicEditorClient(props: SchematicEditorProps) {
  return (
    <EditorErrorBoundary>
      <SchematicEditorInner {...props} />
    </EditorErrorBoundary>
  );
}
