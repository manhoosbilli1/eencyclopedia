'use client';

/**
 * Tiny client form that posts circuit_id to the regenerateSummary server
 * action. Lives next to the AI summary panel; only shown to the owner.
 */

import { useFormState, useFormStatus } from 'react-dom';
import { regenerateSummary, type ActionResult } from '@/lib/circuits/actions';

function PendingButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-border bg-background px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider hover:bg-muted disabled:opacity-50"
    >
      {pending ? 'Regenerating…' : '↻ Regenerate summary'}
    </button>
  );
}

export function RegenerateButton({ circuitId }: { circuitId: string }) {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(
    regenerateSummary,
    null,
  );
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="circuit_id" value={circuitId} />
      <PendingButton />
      {state?.ok ? (
        <span role="status" className="text-[10px] text-muted-foreground">
          Summary refreshed.
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
