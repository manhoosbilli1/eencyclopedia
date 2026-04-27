'use client';

/**
 * Owner-only action to rebuild the canonical S-exp, SVG, structured component
 * rows, and AI summary from the stored raw .kicad_sch.
 */

import { useFormState, useFormStatus } from 'react-dom';
import { rebuildDerivedArtifacts, type ActionResult } from '@/lib/circuits/actions';

function PendingButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-border bg-background px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider hover:bg-muted disabled:opacity-50"
    >
      {pending ? 'Rebuilding…' : '↻ Rebuild'}
    </button>
  );
}

export function RebuildButton({ circuitId }: { circuitId: string }) {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(
    rebuildDerivedArtifacts,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="circuit_id" value={circuitId} />
      <PendingButton />
      {state?.ok ? (
        <span role="status" className="text-[10px] text-muted-foreground">
          {state.warnings?.[0] ?? 'Artifacts refreshed.'}
        </span>
      ) : null}
      {state && !state.ok ? (
        <span role="alert" className="text-[10px] text-destructive">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
