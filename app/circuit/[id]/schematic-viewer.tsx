'use client';

/**
 * SchematicViewer — shows an interactive SchematicEditor when a rawKicadUrl
 * is available (fetches + parses client-side). Falls back to the static SVG
 * with hover tooltips when only an svgContent string is provided.
 */

import { useCallback, useRef, useState } from 'react';
import { SchematicEditor } from '@/components/schematic/SchematicEditor';
import type { EditorState } from '@/components/schematic/editorTypes';

interface Props {
  svgContent: string;
  circuitId: string;
  chatHref: string;
  /** If provided, the component will fetch + parse this URL for interactive editing. */
  rawKicadUrl?: string | null;
}

export function SchematicViewer({ svgContent, circuitId, chatHref, rawKicadUrl }: Props) {
  const [mode, setMode] = useState<'svg' | 'editor' | 'loading' | 'error'>('svg');
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleSave = useCallback(async (state: EditorState) => {
    const [{ fromEditorState }, { saveSchematicEdits }] = await Promise.all([
      import('@/lib/kicad/fromEditorState'),
      import('@/lib/circuits/editorActions'),
    ]);
    const kicadString = fromEditorState(state);
    const formData = new FormData();
    formData.set('circuit_id', circuitId);
    formData.set('source', kicadString);
    const result = await saveSchematicEdits(null, formData);
    const msg = result.ok ? 'Saved.' : `Save failed: ${result.error ?? 'unknown error'}`;
    setSaveMsg(msg);
    setTimeout(() => setSaveMsg(null), 3000);
  }, [circuitId]);

  const handleDownload = useCallback(async (state: EditorState) => {
    const { downloadKicadSch } = await import('@/lib/kicad/exportUtils');
    await downloadKicadSch(state, 'schematic.kicad_sch');
  }, []);

  const loadEditor = useCallback(async () => {
    if (!rawKicadUrl) return;
    setMode('loading');
    try {
      const res = await fetch(rawKicadUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
  }, [rawKicadUrl]);

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
        <StaticViewer svgContent={svgContent} circuitId={circuitId} chatHref={chatHref} />
      </div>
    );
  }

  if (mode === 'editor' && editorState) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            interactive mode — changes are local only
          </span>
          <button
            type="button"
            onClick={() => setMode('svg')}
            className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            ← static view
          </button>
        </div>
        <div
          className="relative overflow-hidden rounded-lg border border-border transition-all duration-300"
          style={{ height: expanded ? '80vh' : 480 }}
          onMouseEnter={() => setExpanded(true)}
          onMouseLeave={() => setExpanded(false)}
        >
          {saveMsg && (
            <div className="absolute top-2 right-2 z-30 rounded bg-card border border-border px-2 py-1 text-xs font-mono">
              {saveMsg}
            </div>
          )}
          <SchematicEditor
            initialState={editorState}
            circuitId={circuitId}
            onSave={handleSave}
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
      <StaticViewer svgContent={svgContent} circuitId={circuitId} chatHref={chatHref} />
      {rawKicadUrl && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={loadEditor}
            className="rounded border border-border bg-muted/30 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ⤢ open in editor
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

function StaticViewer({ svgContent, circuitId, chatHref }: {
  svgContent: string;
  circuitId: string;
  chatHref: string;
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
    const target = e.target as Element | null;
    if (!target) return;
    let el: Element | null = target;
    while (el && el !== containerRef.current) {
      const designator = el.getAttribute('data-designator');
      const net = el.getAttribute('data-net');
      if (designator || net) {
        const query = designator
          ? `Explain ${designator} (${el.getAttribute('data-value') ?? ''}) in circuit ${circuitId}`
          : `Explain net ${net ?? ''} in circuit ${circuitId}`;
        window.location.href = `${chatHref}&q=${encodeURIComponent(query)}`;
        return;
      }
      el = el.parentElement;
    }
  }, [circuitId, chatHref]);

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
