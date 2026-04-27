'use client';

/**
 * "Backfill stuck circuits" — one-click action that runs the Gemini summary
 * + Voyage embedding pipeline against every owned circuit currently missing
 * either field.
 *
 * Lives on /library, only rendered when the server-side count of stuck
 * circuits > 0 (see the parent page). The action paces itself at ~3.5s
 * per circuit to stay under Gemini's free-tier RPM, so a 9-circuit
 * backfill takes ~30s. We surface progress as a result summary; for the
 * 7-day-sprint timeline that's good enough — V1 can stream a per-circuit
 * progress feed.
 */

import { useFormState, useFormStatus } from 'react-dom';
import {
  backfillMyCircuits,
  type BackfillActionResult,
} from '@/lib/circuits/actions';

function PendingButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-9 items-center rounded-md bg-amber-500/90 px-3 text-xs font-medium text-amber-50 hover:bg-amber-500 disabled:opacity-60"
      title={`Regenerate AI summary + embedding for ${count} circuit${count === 1 ? '' : 's'}.`}
    >
      {pending ? 'Backfilling… (≈3.5s/circuit)' : `↻ Backfill ${count} stuck circuit${count === 1 ? '' : 's'}`}
    </button>
  );
}

export function BackfillButton({ count }: { count: number }) {
  const [state, formAction] = useFormState<BackfillActionResult | null, FormData>(
    backfillMyCircuits,
    null,
  );

  if (count <= 0 && !state?.ok) return null;

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <PendingButton count={count} />
      {state?.ok ? (
        <span
          role="status"
          aria-live="polite"
          className="text-[11px] text-muted-foreground"
        >
          {state.total === 0
            ? 'Nothing to backfill.'
            : `${state.succeeded}/${state.total} succeeded${state.failed > 0 ? `, ${state.failed} failed` : ''}.`}
        </span>
      ) : null}
      {state?.ok && state.errors.length > 0 ? (
        <details className="text-[11px] text-destructive">
          <summary className="cursor-pointer">Show errors</summary>
          <ul className="mt-1 space-y-0.5 font-mono">
            {state.errors.slice(0, 5).map((e) => (
              <li key={e.circuitId}>
                <span className="opacity-80">{e.title}:</span> {e.code}
              </li>
            ))}
            {state.errors.length > 5 ? (
              <li className="opacity-70">…and {state.errors.length - 5} more.</li>
            ) : null}
          </ul>
        </details>
      ) : null}
      {state && !state.ok ? (
        <span role="alert" className="text-[11px] text-destructive">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
