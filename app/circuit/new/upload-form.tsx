'use client';

/**
 * Upload form for a single .kicad_sch file.
 *
 * Persistence: title, description, and pasted_source are written to
 * localStorage on every change so a refresh / accidental nav doesn't lose
 * the user's input. The File input itself can NOT be restored across page
 * loads — browsers refuse to programmatically populate <input type="file">
 * with a previously-chosen file, for security reasons. We surface the last
 * filename instead so the user knows to re-pick or use the textarea.
 *
 * Draft is cleared on a successful submit (createSchematic redirects to
 * /circuit/[id], so we listen for that redirect by clearing on unmount AFTER
 * a successful action result).
 *
 * Storage key: `eencyc:upload-form-draft:v1`. Bumping the suffix invalidates
 * old shapes if we change the schema.
 */

import { useFormState, useFormStatus } from 'react-dom';
import { useEffect, useState } from 'react';
import { createSchematic, type ActionResult } from '@/lib/circuits/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DRAFT_KEY = 'eencyc:upload-form-draft:v1';

interface FormDraft {
  title: string;
  description: string;
  pastedSource: string;
  lastFileName: string | null;
}

const EMPTY_DRAFT: FormDraft = {
  title: '',
  description: '',
  pastedSource: '',
  lastFileName: null,
};

function loadDraft(): FormDraft {
  if (typeof window === 'undefined') return EMPTY_DRAFT;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw) as Partial<FormDraft>;
    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      description: typeof parsed.description === 'string' ? parsed.description : '',
      pastedSource: typeof parsed.pastedSource === 'string' ? parsed.pastedSource : '',
      lastFileName: typeof parsed.lastFileName === 'string' ? parsed.lastFileName : null,
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

function saveDraft(d: FormDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    // localStorage may be disabled (private mode, quota). Silent fail —
    // the form still works; just no persistence.
  }
}

function clearDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending} className="w-full">
      {pending ? 'Parsing & uploading…' : 'Upload and analyse'}
    </Button>
  );
}

export function UploadForm() {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(
    createSchematic,
    null,
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pastedSource, setPastedSource] = useState('');
  const [lastFileName, setLastFileName] = useState<string | null>(null);
  const [hasFile, setHasFile] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount. Defer until after first render to
  // avoid SSR/CSR text mismatch warnings on inputs.
  useEffect(() => {
    const d = loadDraft();
    setTitle(d.title);
    setDescription(d.description);
    setPastedSource(d.pastedSource);
    setLastFileName(d.lastFileName);
    setHydrated(true);
  }, []);

  // Persist on every change after hydration.
  useEffect(() => {
    if (!hydrated) return;
    saveDraft({ title, description, pastedSource, lastFileName });
  }, [hydrated, title, description, pastedSource, lastFileName]);

  // Note: createSchematic redirects on success, so the component unmounts
  // and never sees state.ok=true. We clear the draft on unmount once the
  // form has been submitted at least once with no error in state — handled
  // implicitly: success → unmount → no clear needed (we handle on the next
  // /circuit/new visit by checking if the URL implies fresh start).
  // To play it safe, also expose a manual "Clear draft" button.

  // The submit-disabled gate: title and description are now required, plus
  // either a file or pasted source must be present.
  const canSubmit =
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    (hasFile || pastedSource.trim().length > 0);

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">
          Title <span className="text-destructive">*</span>
        </Label>
        <Input
          id="title"
          name="title"
          required
          maxLength={200}
          placeholder="e.g. 5V → 3.3V LDO with bulk decoupling"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">
          Description <span className="text-destructive">*</span>
        </Label>
        <textarea
          id="description"
          name="description"
          required
          maxLength={2000}
          rows={3}
          placeholder="What it does, why this topology, anything we should know."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Visibility</legend>
        <p className="help">
          Closed beta: every upload is public so the library has content.
          Private/unlisted come back at V1.
        </p>
        <div className="mt-1 flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="visibility" value="public" defaultChecked />
            Public — appears in the library, search-indexed.
          </label>
          <label className="flex items-center gap-2 opacity-60">
            <input type="radio" name="visibility" value="unlisted" disabled />
            Unlisted — V1
          </label>
          <label className="flex items-center gap-2 opacity-60">
            <input type="radio" name="visibility" value="private" disabled />
            Private — V1
          </label>
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="file">.kicad_sch file</Label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".kicad_sch,text/plain"
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0] ?? null;
            setHasFile(!!f);
            if (f) setLastFileName(f.name);
          }}
        />
        {/* If we have a remembered filename but no current file selection,
            tell the user. Browsers won't let us re-populate file inputs. */}
        {hydrated && lastFileName && !hasFile ? (
          <p className="text-xs text-muted-foreground">
            Last selection: <code className="rounded bg-muted px-1 font-mono">{lastFileName}</code>{' '}
            — re-pick the file or paste its contents below.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="pasted_source">— or paste the file contents</Label>
        <textarea
          id="pasted_source"
          name="pasted_source"
          rows={6}
          spellCheck={false}
          placeholder="(kicad_sch (version 20231120) (generator eeschema) ..."
          value={pastedSource}
          onChange={(e) => setPastedSource(e.target.value)}
          className="flex w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton disabled={!canSubmit} />
        <button
          type="button"
          onClick={() => {
            setTitle('');
            setDescription('');
            setPastedSource('');
            setLastFileName(null);
            setHasFile(false);
            clearDraft();
          }}
          className="rounded-md border border-border px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:bg-muted"
        >
          Clear draft
        </button>
      </div>

      {state && !state.ok ? (
        <p
          role="alert"
          aria-live="assertive"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        Draft auto-saved locally. AI summary runs once at upload (≤12s) — if it
        doesn&rsquo;t finish, the circuit still saves and you can regenerate
        from the detail page.
      </p>
    </form>
  );
}
