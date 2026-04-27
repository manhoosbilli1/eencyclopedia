'use client';

/**
 * Multi-file upload form for the admin seed page. Browser-side only — the
 * actual ingest is `bulkSeedCircuits` in lib/circuits/actions.ts.
 *
 * Implementation notes:
 *   - We use a controlled file input so we can show file names + sizes
 *     before the user submits. Browsers don't expose folder structure;
 *     each file in the picker is independent.
 *   - The submit button is disabled until at least one file is selected.
 *   - Per-file errors come back from the server action and are rendered
 *     in a foldable panel; the loop continues past individual failures
 *     so a single bad file doesn't abort 29 good ones.
 */

import { useFormState, useFormStatus } from 'react-dom';
import { useState, type ChangeEvent } from 'react';
import {
  bulkSeedCircuits,
  type BulkSeedActionResult,
} from '@/lib/circuits/actions';

function PendingButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
    >
      {pending ? 'Seeding…' : 'Seed all'}
    </button>
  );
}

interface FileMeta {
  name: string;
  size: number;
}

export function SeedForm() {
  const [state, formAction] = useFormState<BulkSeedActionResult | null, FormData>(
    bulkSeedCircuits,
    null,
  );
  const [files, setFiles] = useState<FileMeta[]>([]);

  function onPicked(e: ChangeEvent<HTMLInputElement>) {
    const list = e.currentTarget.files;
    if (!list) {
      setFiles([]);
      return;
    }
    const arr: FileMeta[] = [];
    for (const f of Array.from(list)) {
      arr.push({ name: f.name, size: f.size });
    }
    setFiles(arr);
  }

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Visibility for new circuits</legend>
        <div className="mt-1 flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="visibility" value="public" defaultChecked />
            Public — appears in the library, search-indexed.
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="visibility" value="unlisted" />
            Unlisted — accessible by URL only.
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="visibility" value="private" />
            Private — only you can see them.
          </label>
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="files">
          .kicad_sch files
        </label>
        <input
          id="files"
          name="files"
          type="file"
          accept=".kicad_sch,text/plain"
          multiple
          onChange={onPicked}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
        />
        {files.length > 0 ? (
          <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto rounded-md border border-border bg-card p-2 font-mono text-[11px]">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="truncate">{f.name}</span>
                <span className="text-muted-foreground">{(f.size / 1024).toFixed(1)} KiB</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No files selected yet.</p>
        )}
      </div>

      <PendingButton disabled={files.length === 0} />

      {state?.ok ? (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          <p>
            <strong>{state.succeeded}/{state.total}</strong> succeeded
            {state.failed > 0 ? `, ${state.failed} failed` : ''}.
          </p>
          {state.created.length > 0 ? (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                Created circuits
              </summary>
              <ul className="mt-1 space-y-0.5">
                {state.created.map((c) => (
                  <li key={c.circuitId} className="font-mono">
                    <a
                      href={`/circuit/${c.circuitId}`}
                      className="underline hover:text-foreground"
                    >
                      {c.title}
                    </a>{' '}
                    <span className="text-muted-foreground">({c.filename})</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {state.errors.length > 0 ? (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-destructive">
                Show {state.errors.length} error{state.errors.length === 1 ? '' : 's'}
              </summary>
              <ul className="mt-1 space-y-0.5 font-mono text-destructive">
                {state.errors.map((e, i) => (
                  <li key={`${e.filename}-${i}`}>
                    <strong>{e.filename}</strong> [{e.code}]: {e.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
      {state && !state.ok ? (
        <p
          role="alert"
          aria-live="assertive"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
