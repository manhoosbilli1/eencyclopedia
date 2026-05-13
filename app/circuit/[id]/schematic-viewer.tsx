'use client';

/**
 * SchematicViewer — shows an interactive SchematicEditor when a rawKicadUrl
 * is available (fetches + parses client-side). Falls back to the static SVG
 * with hover tooltips otherwise.
 *
 * Save model:
 *   - isOwner=true  → Save button on editor calls saveSchematicEdits (overwrite)
 *   - isOwner=false → Save button calls forkSchematic (creates new circuit
 *                     row with fork_of set, redirects to the new circuit page)
 */

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SchematicEditorClient } from '@/components/schematic/SchematicEditorClient';
import type { EditorState } from '@/components/schematic/editorTypes';

interface Props {
  svgContent: string;
  circuitId: string;
  /** If provided, the component will fetch + parse this URL for interactive editing. */
  rawKicadUrl?: string | null;
  /** When false, Save acts as Fork ("save spinoff") for non-owners. */
  isOwner: boolean;
  /** When false, all interactive editor actions are disabled (anonymous viewers). */
  canEdit: boolean;
  /** Title of the parent circuit — used as the default fork title. */
  title: string;
}

export function SchematicViewer({
  svgContent, circuitId, rawKicadUrl,
  isOwner, canEdit, title,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<'svg' | 'editor' | 'loading' | 'error'>('svg');
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [tall, setTall] = useState(false);

  const flashStatus = useCallback((msg: string, ms = 3500) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), ms);
  }, []);

  // ---------------------------------------------------------------------------
  // Save (owner) — overwrite the same circuit
  // ---------------------------------------------------------------------------
  const handleSaveOwner = useCallback(async (state: EditorState) => {
    const [{ fromEditorState }, { saveSchematicEdits }] = await Promise.all([
      import('@/lib/kicad/fromEditorState'),
      import('@/lib/circuits/editorActions'),
    ]);
    const kicadString = fromEditorState(state);
    const formData = new FormData();
    formData.set('circuit_id', circuitId);
    formData.set('source', kicadString);
    const result = await saveSchematicEdits(null, formData);
    if (result.ok) {
      flashStatus('Saved.');
      // Refresh server data so the static viewer below is in sync
      router.refresh();
    } else {
      flashStatus(`Save failed: ${result.error ?? 'unknown error'}`, 5000);
    }
  }, [circuitId, flashStatus, router]);

  // ---------------------------------------------------------------------------
  // Save (fork) — non-owner: create a new circuit row, redirect there.
  // ---------------------------------------------------------------------------
  const handleSaveFork = useCallback(async (state: EditorState) => {
    if (!confirm(`Save as a spinoff of "${title}"?\nThis creates a new circuit you own; the original is unchanged.`)) {
      return;
    }
    const [{ fromEditorState }, { forkSchematic }] = await Promise.all([
      import('@/lib/kicad/fromEditorState'),
      import('@/lib/circuits/editorActions'),
    ]);
    const kicadString = fromEditorState(state);
    const formData = new FormData();
    formData.set('parent_id', circuitId);
    formData.set('source', kicadString);
    formData.set('title', `Fork of ${title}`);
    const result = await forkSchematic(null, formData);
    if (result.ok) {
      flashStatus('Spinoff saved! Redirecting…');
      router.push(`/circuit/${result.circuitId}`);
    } else {
      flashStatus(`Save failed: ${result.error ?? 'unknown error'}`, 5000);
    }
  }, [circuitId, title, flashStatus, router]);

  const handleSave = isOwner ? handleSaveOwner : handleSaveFork;

  // ---------------------------------------------------------------------------
  // Download — generate KiCad file in browser, trigger save
  // ---------------------------------------------------------------------------
  const handleDownload = useCallback(async (state: EditorState) => {
    const { downloadKicadSch } = await import('@/lib/kicad/exportUtils');
    const safe = title.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40) || 'schematic';
    await downloadKicadSch(state, `${safe}.kicad_sch`);
  }, [title]);

  // ---------------------------------------------------------------------------
  // Open in editor — fetch raw, parse, switch mode
  // ---------------------------------------------------------------------------
  const loadEditor = useCallback(async () => {
    if (!rawKicadUrl) {
      flashStatus('No raw KiCad source available for this circuit.', 5000);
      return;
    }
    setMode('loading');
    try {
      const res = await fetch(rawKicadUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status} when fetching schematic source`);
      const source = await res.text();

      const [{ parseKiCadSchematic, looksLikeKiCadSchematic }, { normalise }, { toEditorState }] =
        await Promise.all([
          import('@/lib/kicad/parse'),
          import('@/lib/kicad/normalise'),
          import('@/lib/kicad/toEditorState'),
        ]);

      if (!looksLikeKiCadSchematic(source)) throw new Error('Not a valid .kicad_sch file.');
      const ast = parseKiCadSchematic(source);
      const canonical = normalise(ast);
      setEditorState(toEditorState(canonical));
      setMode('editor');
    } catch (e: unknown) {
      setErrMsg((e as Error).message);
      setMode('error');
    }
  }, [rawKicadUrl, flashStatus]);

  // ---------------------------------------------------------------------------
  // Render branches
  // ---------------------------------------------------------------------------

  if (mode === 'loading') {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-border bg-muted/20 text-sm text-muted-foreground">
        Loading interactive schematic…
      </div>
    );
  }

  if (mode === 'error') {
    return (
      <div className="space-y-2">
        <p className="text-xs text-destructive">Could not load interactive editor: {errMsg}</p>
        <StaticViewer svgContent={svgContent} circuitId={circuitId}  />
      </div>
    );
  }

  if (mode === 'editor' && editorState) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {isOwner ? (
              <>interactive mode — Save overwrites your circuit</>
            ) : canEdit ? (
              <>interactive mode — Save creates a spinoff (your fork)</>
            ) : (
              <>interactive mode — sign in to save edits</>
            )}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setTall(v => !v)}
              className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              {tall ? '↙ compact' : '↗ expand'}
            </button>
            <button
              type="button"
              onClick={() => setMode('svg')}
              className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              ← static view
            </button>
          </div>
        </div>
        <div
          className="relative overflow-hidden rounded-lg border border-border"
          style={{ height: tall ? '85vh' : 600 }}
        >
          {statusMsg && (
            <div className="absolute top-2 right-2 z-30 rounded bg-card border border-border px-2 py-1 text-xs font-mono">
              {statusMsg}
            </div>
          )}
          <SchematicEditorClient
            initialState={editorState}
            circuitId={circuitId}
            // Save button only renders when onSave is set.
            // Anonymous viewers get a read-only editor (no save).
            onSave={canEdit ? handleSave : undefined}
            onDownload={handleDownload}
            className="h-full"
          />
        </div>
      </div>
    );
  }

  // Default: static SVG + toggle button
  return (
    <div className="space-y-2">
      {statusMsg && (
        <div className="rounded bg-card border border-border px-2 py-1 text-xs font-mono">
          {statusMsg}
        </div>
      )}
      <StaticViewer svgContent={svgContent} circuitId={circuitId}  />
      {rawKicadUrl && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={loadEditor}
            className="rounded border border-border bg-muted/30 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ⤢ {isOwner ? 'open in editor' : canEdit ? 'fork & edit' : 'open in viewer'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Original static SVG viewer (unchanged behaviour)
// ---------------------------------------------------------------------------

interface TooltipData {
  kind: 'component' | 'net';
  designator?: string;
  value?: string;
  family?: string;
  mpn?: string;
  net?: string;
  x: number;
  y: number;
}

function StaticViewer({ svgContent, circuitId }: {
  svgContent: string;
  circuitId: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as SVGElement | null;
    if (!target) return;
    let el: Element | null = target;
    while (el && el !== containerRef.current) {
      const designator = el.getAttribute('data-designator');
      const net = el.getAttribute('data-net');
      if (designator) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setTooltip({
          kind: 'component',
          designator,
          value: el.getAttribute('data-value') ?? '',
          family: el.getAttribute('data-family') ?? undefined,
          mpn: el.getAttribute('data-mpn') ?? undefined,
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
        return;
      }
      if (net && !el.getAttribute('data-designator')) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setTooltip({ kind: 'net', net, x: e.clientX - rect.left, y: e.clientY - rect.top });
        return;
      }
      el = el.parentElement;
    }
    setTooltip(null);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Click on a component or net — no action for now (chat is removed).
    // Kept as a hook point for future features (copy designator, etc.).
    void e;
    void circuitId;
  }, [circuitId]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="overflow-hidden text-foreground select-none"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setTooltip(null)}
        onClick={handleClick}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 max-w-[200px] rounded-md border border-border bg-popover px-3 py-2 shadow-md"
          style={{
            left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth ?? 400) - 220),
            top: tooltip.y + 14,
          }}
        >
          {tooltip.kind === 'component' ? (
            <div className="space-y-0.5 text-xs">
              <p className="font-mono font-semibold text-foreground">{tooltip.designator}</p>
              {tooltip.value ? <p className="text-muted-foreground">{tooltip.value}</p> : null}
              {tooltip.family ? (
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {tooltip.family.replace(/_/g, ' ')}
                </p>
              ) : null}
              {tooltip.mpn ? (
                <p className="font-mono text-[10px] text-muted-foreground">{tooltip.mpn}</p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-0.5 text-xs">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">net</p>
              <p className="font-mono font-semibold text-foreground">{tooltip.net}</p>
            </div>
          )}
          <p className="mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">click to ask AI</p>
        </div>
      )}
    </div>
  );
}
