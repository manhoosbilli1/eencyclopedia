'use client';

/**
 * Upload form — parses the .kicad_sch client-side, shows an interactive
 * SchematicEditor preview, then submits the (possibly edited) canonical
 * S-exp as pasted_source to the server action.
 *
 * Flow:
 *   1. User picks/pastes file → client-side parse → SchematicEditor
 *   2. User edits schematic in the editor (move, add, delete, wire)
 *   3. On submit → fromEditorState() → kicad_sch string → passed as pasted_source
 */

import { useFormState, useFormStatus } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createSchematic, type ActionResult } from '@/lib/circuits/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SchematicEditorClient } from '@/components/schematic/SchematicEditorClient';
import type { EditorState } from '@/components/schematic/editorTypes';

const DRAFT_KEY = 'eencyc:upload-form-draft:v2';

interface FormDraft {
  title: string;
  description: string;
  lastFileName: string | null;
}

const EMPTY_DRAFT: FormDraft = { title: '', description: '', lastFileName: null };

function loadDraft(): FormDraft {
  if (typeof window === 'undefined') return EMPTY_DRAFT;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    const p = JSON.parse(raw) as Partial<FormDraft>;
    return {
      title: typeof p.title === 'string' ? p.title : '',
      description: typeof p.description === 'string' ? p.description : '',
      lastFileName: typeof p.lastFileName === 'string' ? p.lastFileName : null,
    };
  } catch { return EMPTY_DRAFT; }
}

function saveDraft(d: FormDraft) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* silent */ }
}

function clearDraft() {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* silent */ }
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending} className="w-full">
      {pending ? 'Uploading & analysing…' : 'Save to library'}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------

export function UploadForm() {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(createSchematic, null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [lastFileName, setLastFileName] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Editor state (the schematic being edited)
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  // The serialized kicad_sch string that will be submitted
  const serializedRef = useRef<string>('');

  // Hydrate draft
  useEffect(() => {
    const d = loadDraft();
    setTitle(d.title);
    setDescription(d.description);
    setLastFileName(d.lastFileName);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveDraft({ title, description, lastFileName });
  }, [hydrated, title, description, lastFileName]);

  // When editor state changes, re-serialize
  const handleEditorChange = useCallback((es: EditorState) => {
    import('@/lib/kicad/fromEditorState').then(({ fromEditorState }) => {
      serializedRef.current = fromEditorState(es);
    });
  }, []);

  // Parse file client-side
  const parseSource = useCallback(async (source: string) => {
    setParsing(true);
    setParseError(null);
    setEditorState(null);
    try {
      // Dynamic import keeps these out of the initial bundle
      const [{ parseKiCadSchematic, looksLikeKiCadSchematic }, { normalise }, { toEditorState }] =
        await Promise.all([
          import('@/lib/kicad/parse'),
          import('@/lib/kicad/normalise'),
          import('@/lib/kicad/toEditorState'),
        ]);

      if (!looksLikeKiCadSchematic(source)) {
        setParseError('Does not look like a .kicad_sch file.');
        return;
      }

      const ast = parseKiCadSchematic(source);
      const canonical = normalise(ast);
      const es = toEditorState(canonical);
      setEditorState(es);

      const { fromEditorState } = await import('@/lib/kicad/fromEditorState');
      serializedRef.current = fromEditorState(es);
    } catch (err: unknown) {
      setParseError((err as Error).message ?? 'Parse failed.');
    } finally {
      setParsing(false);
    }
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.currentTarget.files?.[0] ?? null;
    if (!f) return;
    setLastFileName(f.name);
    const source = await f.text();
    await parseSource(source);
  }, [parseSource]);

  // Override form submit to inject serialized source
  const handleSubmit = useCallback(async (formData: FormData) => {
    if (serializedRef.current) {
      // Replace whatever is in pasted_source with our serialized editor state
      formData.set('pasted_source', serializedRef.current);
      // Remove the file so the server uses pasted_source
      formData.delete('file');
    }
    return formAction(formData);
  }, [formAction]);

  const canSubmit =
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    (editorState !== null || serializedRef.current.length > 0);

  return (
    <div className="space-y-8">
      <form action={handleSubmit} className="flex flex-col gap-6">
        {/* Title */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="title">Title <span className="text-destructive">*</span></Label>
          <Input
            id="title" name="title" required maxLength={200}
            placeholder="e.g. 5V → 3.3V LDO with bulk decoupling"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* Description */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="description">Description <span className="text-destructive">*</span></Label>
          <textarea
            id="description" name="description" required maxLength={2000} rows={3}
            placeholder="What it does, why this topology, anything we should know."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {/* Visibility */}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Visibility</legend>
          <div className="mt-1 flex flex-col gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="visibility" value="public" defaultChecked />
              Public — appears in the library, search-indexed.
            </label>
          </div>
        </fieldset>

        {/* File picker */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="file">.kicad_sch file</Label>
          <input
            id="file" name="file" type="file"
            accept=".kicad_sch,text/plain"
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
            onChange={handleFileChange}
          />
          {hydrated && lastFileName && !editorState ? (
            <p className="text-xs text-muted-foreground">
              Last: <code className="rounded bg-muted px-1 font-mono">{lastFileName}</code>
              {' '}— re-pick the file or paste below.
            </p>
          ) : null}
        </div>

        {/* Paste fallback */}
        {!editorState && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="pasted_source">— or paste file contents</Label>
            <textarea
              id="pasted_source"
              rows={5}
              spellCheck={false}
              placeholder="(kicad_sch (version 20231120) ..."
              onChange={async (e) => {
                const v = e.target.value.trim();
                if (v.length > 20) await parseSource(v);
              }}
              className="flex w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        )}

        {/* Hidden pasted_source — populated by serializer on submit */}
        <input type="hidden" name="pasted_source" value="" />

        {/* Actions */}
        <div className="flex items-center gap-3">
          <SubmitButton disabled={!canSubmit} />
          <button
            type="button"
            onClick={() => {
              setTitle(''); setDescription('');
              setLastFileName(null); setEditorState(null);
              serializedRef.current = '';
              clearDraft();
            }}
            className="rounded-md border border-border px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:bg-muted"
          >
            Clear
          </button>
        </div>

        {/* Error */}
        {state && !state.ok && (
          <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}

        <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Draft saved locally. AI summary runs once at upload.
        </p>
      </form>

      {/* Editor preview */}
      {parsing && (
        <div className="flex h-40 items-center justify-center rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground">
          Parsing schematic…
        </div>
      )}

      {parseError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {parseError}
        </div>
      )}

      {editorState && !parsing && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Schematic preview{' '}
              <span className="font-normal text-muted-foreground">— edit before saving</span>
            </h2>
            <button
              type="button"
              onClick={() => { setEditorState(null); serializedRef.current = ''; }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ✕ dismiss
            </button>
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            <SchematicEditorClient
              initialState={editorState}
              onChange={handleEditorChange}
              className="h-[520px]"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Drag components to reposition · Draw wires · Add/remove passives · Changes save with the circuit.
          </p>
        </div>
      )}
    </div>
  );
}
