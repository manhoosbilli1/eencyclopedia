'use client';

/**
 * SchematicEditor v2 — KiCad-style interactive schematic editor.
 *
 * Features:
 *   - Full undo/redo (Ctrl+Z / Ctrl+Y)
 *   - Multi-select (click, shift+click, rect-drag)
 *   - Copy / paste / duplicate (Ctrl+C/V/D)
 *   - Wire drawing with orthogonal auto-routing
 *   - Auto-junctions on wire crossings
 *   - No-connect markers
 *   - Text annotations
 *   - Component rotate/mirror, double-click inline edit
 *   - Alignment tools (2+ selected)
 *   - Symbol library browser (SymbolBrowser)
 *   - Power symbols palette
 *   - KiCad-like light grey canvas, green wires, dark symbols
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { drawSymbol } from '@/lib/kicad/symbols';
import { SymbolBrowser } from './SymbolBrowser';
import BomTable from './BomTable';
import { PropertiesPanel } from './PropertiesPanel';
import type { CatalogEntry } from '@/lib/kicad/symbolCatalog';
import type {
  Clipboard,
  EditorComponent,
  EditorHistory,
  EditorJunction,
  EditorLabel,
  EditorMode,
  EditorNoConnect,
  EditorState,
  EditorText,
  EditorWire,
  Point,
  Viewport,
} from './editorTypes';
import { EMPTY_STATE, POWER_SYMBOLS } from './editorTypes';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRID = 2.54;           // mm per grid step (100mil)
const INITIAL_SCALE = 8;     // px per mm at 100%
const WIRE_SNAP_R = 2.5;     // mm — snap radius for wire/pin snapping
const MAX_HISTORY = 50;

// KiCad-inspired color palette
const COLOR = {
  canvas: '#f0f0f0',
  grid: '#b0b0b0',
  wire: '#008000',
  wireSelected: '#2563eb',
  component: '#1a1a2e',
  power: '#840000',
  junction: '#008000',
  noConnect: '#840000',
  netLabel: '#008000',
  text: '#1a1a2e',
  selection: '#2563eb',
  snapIndicator: '#2563eb',
  wirePreview: '#2563eb',
};

// ---------------------------------------------------------------------------
// UID generator
// ---------------------------------------------------------------------------

let _uid = 0;
function uid(): string {
  _uid += 1;
  return `e${_uid}_${Math.random().toString(36).slice(2, 6)}`;
}

// ---------------------------------------------------------------------------
// Snap & geometry helpers
// ---------------------------------------------------------------------------

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

function snapTo(v: number, gs: number): number {
  return Math.round(v / gs) * gs;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Apply component rotation to local pin offset → world coords */
function compPinPositions(comp: EditorComponent): Point[] {
  const draw = drawSymbol(comp.libId, comp.value);
  const rad = (-comp.rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const mx = comp.mirror === 'x' ? -1 : 1;
  return draw.pins.map((p) => {
    const lx = p.dx * mx;
    const ly = p.dy;
    return {
      x: comp.x + lx * cos - ly * sin,
      y: comp.y + lx * sin + ly * cos,
    };
  });
}

/** Point lies on a wire segment (within tolerance) */
function ptOnWire(pt: Point, w: EditorWire, tol = 0.15): boolean {
  const minX = Math.min(w.x1, w.x2) - tol;
  const maxX = Math.max(w.x1, w.x2) + tol;
  const minY = Math.min(w.y1, w.y2) - tol;
  const maxY = Math.max(w.y1, w.y2) + tol;
  if (pt.x < minX || pt.x > maxX || pt.y < minY || pt.y > maxY) return false;
  // Cross-product collinearity check
  const cross = (w.x2 - w.x1) * (pt.y - w.y1) - (w.y2 - w.y1) * (pt.x - w.x1);
  return Math.abs(cross) < tol * 10;
}

/** Check if a point is an endpoint of a wire */
function isWireEndpoint(pt: Point, w: EditorWire, tol = 0.01): boolean {
  return dist(pt, { x: w.x1, y: w.y1 }) < tol || dist(pt, { x: w.x2, y: w.y2 }) < tol;
}

/** Find nearest snap point (pin or wire endpoint) */
function findSnapPoint(
  pt: Point,
  state: EditorState,
  excludeCompIds?: Set<string>,
): Point | null {
  let best: Point | null = null;
  let bestD = WIRE_SNAP_R;

  const check = (p: Point) => {
    const d = dist(pt, p);
    if (d < bestD) {
      bestD = d;
      best = { x: p.x, y: p.y };
    }
  };

  for (const comp of state.components) {
    if (excludeCompIds?.has(comp.id)) continue;
    for (const pp of compPinPositions(comp)) check(pp);
  }
  for (const w of state.wires) {
    check({ x: w.x1, y: w.y1 });
    check({ x: w.x2, y: w.y2 });
  }

  return best;
}

/** Build auto-junctions: endpoints that lie on the middle of another wire */
function computeJunctions(state: EditorState): EditorJunction[] {
  const junctions: EditorJunction[] = [];
  const seen = new Set<string>();

  const key = (x: number, y: number) =>
    `${x.toFixed(3)},${y.toFixed(3)}`;

  // Collect all wire endpoints
  const endpoints: Point[] = [];
  for (const w of state.wires) {
    endpoints.push({ x: w.x1, y: w.y1 });
    endpoints.push({ x: w.x2, y: w.y2 });
  }

  for (const pt of endpoints) {
    const k = key(pt.x, pt.y);
    if (seen.has(k)) continue;
    // Count how many wires have this as an endpoint
    let epCount = 0;
    // Check if this point lies on the middle of any wire
    let midCount = 0;
    for (const w of state.wires) {
      if (isWireEndpoint(pt, w)) epCount++;
      else if (ptOnWire(pt, w)) midCount++;
    }
    // Junction needed when: 3+ wires meet at endpoint, or endpoint lands on mid-wire
    if (midCount > 0 || epCount >= 3) {
      seen.add(k);
      junctions.push({ id: uid(), x: pt.x, y: pt.y });
    }
  }

  return junctions;
}

/** Next available designator for a given prefix */
function nextDesignator(state: EditorState, prefix: string): string {
  const used = new Set(
    state.components
      .filter((c) => c.designator.startsWith(prefix))
      .map((c) => parseInt(c.designator.replace(prefix, ''), 10))
      .filter((n) => Number.isFinite(n)),
  );
  let n = 1;
  while (used.has(n)) n++;
  return `${prefix}${n}`;
}

/** Bounding box for a component (world coords) */
function compBBox(comp: EditorComponent): { x: number; y: number; w: number; h: number } {
  const draw = drawSymbol(comp.libId, comp.value);
  const r = (comp.rot * Math.PI) / 180;
  const corners = [
    { x: -draw.halfWidth, y: -draw.halfHeight },
    { x: draw.halfWidth, y: -draw.halfHeight },
    { x: draw.halfWidth, y: draw.halfHeight },
    { x: -draw.halfWidth, y: draw.halfHeight },
  ];
  const xs = corners.map(
    (c) => comp.x + c.x * Math.cos(r) - c.y * Math.sin(r),
  );
  const ys = corners.map(
    (c) => comp.y + c.x * Math.sin(r) + c.y * Math.cos(r),
  );
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Hit-test a world-space point against all components, returning the topmost hit or null */
function hitTestComponent(worldX: number, worldY: number, components: EditorComponent[]): EditorComponent | null {
  // Iterate in reverse so the visually-topmost (last-drawn) component wins
  for (let i = components.length - 1; i >= 0; i--) {
    const c = components[i];
    if (!c) continue;
    const draw = drawSymbol(c.libId, c.value);
    // For rotated bounding boxes use the axis-aligned envelope
    // For 90/270 deg the width and height axes swap
    const hw = (c.rot === 90 || c.rot === 270 ? draw.halfHeight : draw.halfWidth) + 1;
    const hh = (c.rot === 90 || c.rot === 270 ? draw.halfWidth : draw.halfHeight) + 1;
    const dx = Math.abs(worldX - c.x);
    const dy = Math.abs(worldY - c.y);
    if (dx <= hw && dy <= hh) return c;
  }
  return null;
}

// ---------------------------------------------------------------------------
// State & action types
// ---------------------------------------------------------------------------

type Action =
  | { type: 'SET_STATE'; state: EditorState }
  | { type: 'ADD_COMP'; comp: EditorComponent }
  | { type: 'DELETE_SELECTED'; ids: Set<string> }
  | { type: 'MOVE_COMPS'; moves: Array<{ id: string; x: number; y: number }>; wireUpdates: Array<{ id: string; x1: number; y1: number; x2: number; y2: number }> }
  | { type: 'ROTATE_COMP'; id: string }
  | { type: 'MIRROR_COMP'; id: string }
  | { type: 'UPDATE_COMP'; id: string; value: string; designator: string }
  | { type: 'UPDATE_COMP_PARTIAL'; id: string; changes: Partial<EditorComponent> }
  | { type: 'UPDATE_COMP_FIELD'; id: string; field: 'value' | 'designator' | 'mpn' | 'footprint'; fieldValue: string }
  | { type: 'ADD_WIRE'; wire: EditorWire }
  | { type: 'ADD_LABEL'; label: EditorLabel }
  | { type: 'ADD_NO_CONNECT'; nc: EditorNoConnect }
  | { type: 'ADD_TEXT'; text: EditorText }
  | { type: 'UPDATE_TEXT'; id: string; text: string }
  | { type: 'ALIGN'; ids: Set<string>; axis: 'left' | 'right' | 'top' | 'bottom' | 'centerH' | 'centerV' | 'distributeH' | 'distributeV' }
  | { type: 'PASTE'; comps: EditorComponent[]; wires: EditorWire[]; labels: EditorLabel[]; texts: EditorText[] }
  | { type: 'RECOMPUTE_JUNCTIONS' };

interface FullState {
  editor: EditorState;
  history: EditorHistory;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function pushHistory(history: EditorHistory, prev: EditorState): EditorHistory {
  const past = [...history.past, prev].slice(-MAX_HISTORY);
  return { past, future: [] };
}

function editorReducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'SET_STATE':
      return action.state;

    case 'ADD_COMP':
      return { ...state, components: [...state.components, action.comp] };

    case 'DELETE_SELECTED': {
      const ids = action.ids;
      const comps = state.components.filter((c) => !ids.has(c.id));
      const wires = state.wires.filter((w) => !ids.has(w.id));
      const labels = state.labels.filter((l) => !ids.has(l.id));
      const texts = state.texts.filter((t) => !ids.has(t.id));
      const ncs = state.noConnects.filter((n) => !ids.has(n.id));
      const next: EditorState = { ...state, components: comps, wires, labels, texts, noConnects: ncs };
      return { ...next, junctions: computeJunctions(next) };
    }

    case 'MOVE_COMPS': {
      const moveMap = new Map(action.moves.map((m) => [m.id, m]));
      const wireMap = new Map(action.wireUpdates.map((w) => [w.id, w]));
      const comps = state.components.map((c) => {
        const mv = moveMap.get(c.id);
        return mv ? { ...c, x: mv.x, y: mv.y } : c;
      });
      const wires = state.wires.map((w) => {
        const wu = wireMap.get(w.id);
        return wu ? { ...w, x1: wu.x1, y1: wu.y1, x2: wu.x2, y2: wu.y2 } : w;
      });
      const next: EditorState = { ...state, components: comps, wires };
      return { ...next, junctions: computeJunctions(next) };
    }

    case 'ROTATE_COMP':
      return {
        ...state,
        components: state.components.map((c) =>
          c.id === action.id ? { ...c, rot: (c.rot + 90) % 360 } : c,
        ),
      };

    case 'MIRROR_COMP':
      return {
        ...state,
        components: state.components.map((c) =>
          c.id === action.id
            ? { ...c, mirror: c.mirror === 'x' ? 'none' : 'x' }
            : c,
        ),
      };

    case 'UPDATE_COMP':
      return {
        ...state,
        components: state.components.map((c) =>
          c.id === action.id
            ? { ...c, value: action.value, designator: action.designator }
            : c,
        ),
      };

    case 'UPDATE_COMP_FIELD':
      return {
        ...state,
        components: state.components.map((c) =>
          c.id === action.id ? { ...c, [action.field]: action.fieldValue } : c,
        ),
      };

    case 'UPDATE_COMP_PARTIAL':
      return {
        ...state,
        components: state.components.map((c) =>
          c.id === action.id ? { ...c, ...action.changes } : c,
        ),
      };

    case 'ADD_WIRE': {
      const next: EditorState = { ...state, wires: [...state.wires, action.wire] };
      return { ...next, junctions: computeJunctions(next) };
    }

    case 'ADD_LABEL':
      return { ...state, labels: [...state.labels, action.label] };

    case 'ADD_NO_CONNECT':
      return { ...state, noConnects: [...state.noConnects, action.nc] };

    case 'ADD_TEXT':
      return { ...state, texts: [...state.texts, action.text] };

    case 'UPDATE_TEXT':
      return {
        ...state,
        texts: state.texts.map((t) =>
          t.id === action.id ? { ...t, text: action.text } : t,
        ),
      };

    case 'ALIGN': {
      const ids = action.ids;
      const selected = state.components.filter((c) => ids.has(c.id));
      if (selected.length < 2) return state;
      const updated = (() => {
        switch (action.axis) {
          case 'left': {
            const ref = Math.min(...selected.map((c) => compBBox(c).x));
            return state.components.map((c) =>
              ids.has(c.id) ? { ...c, x: c.x + (ref - compBBox(c).x) } : c,
            );
          }
          case 'right': {
            const ref = Math.max(...selected.map((c) => { const b = compBBox(c); return b.x + b.w; }));
            return state.components.map((c) => {
              if (!ids.has(c.id)) return c;
              const b = compBBox(c); return { ...c, x: c.x + (ref - (b.x + b.w)) };
            });
          }
          case 'top': {
            const ref = Math.min(...selected.map((c) => compBBox(c).y));
            return state.components.map((c) =>
              ids.has(c.id) ? { ...c, y: c.y + (ref - compBBox(c).y) } : c,
            );
          }
          case 'bottom': {
            const ref = Math.max(...selected.map((c) => { const b = compBBox(c); return b.y + b.h; }));
            return state.components.map((c) => {
              if (!ids.has(c.id)) return c;
              const b = compBBox(c); return { ...c, y: c.y + (ref - (b.y + b.h)) };
            });
          }
          case 'centerH': {
            const ref = selected.reduce((s, c) => s + c.x, 0) / selected.length;
            return state.components.map((c) =>
              ids.has(c.id) ? { ...c, x: ref } : c,
            );
          }
          case 'centerV': {
            const ref = selected.reduce((s, c) => s + c.y, 0) / selected.length;
            return state.components.map((c) =>
              ids.has(c.id) ? { ...c, y: ref } : c,
            );
          }
          case 'distributeH': {
            const sorted = [...selected].sort((a, b) => a.x - b.x);
            if (sorted.length < 2) return state.components;
            const first = sorted[0];
            const last = sorted[sorted.length - 1];
            if (!first || !last) return state.components;
            const step = (last.x - first.x) / (sorted.length - 1);
            const xMap = new Map(sorted.map((c, i) => [c.id, first.x + i * step]));
            return state.components.map((c) => {
              const nx = xMap.get(c.id);
              return nx !== undefined ? { ...c, x: nx } : c;
            });
          }
          case 'distributeV': {
            const sorted = [...selected].sort((a, b) => a.y - b.y);
            if (sorted.length < 2) return state.components;
            const first = sorted[0];
            const last = sorted[sorted.length - 1];
            if (!first || !last) return state.components;
            const step = (last.y - first.y) / (sorted.length - 1);
            const yMap = new Map(sorted.map((c, i) => [c.id, first.y + i * step]));
            return state.components.map((c) => {
              const ny = yMap.get(c.id);
              return ny !== undefined ? { ...c, y: ny } : c;
            });
          }
          default:
            return state.components;
        }
      })();
      return { ...state, components: updated };
    }

    case 'PASTE':
      return {
        ...state,
        components: [...state.components, ...action.comps],
        wires: [...state.wires, ...action.wires],
        labels: [...state.labels, ...action.labels],
        texts: [...state.texts, ...action.texts],
      };

    case 'RECOMPUTE_JUNCTIONS':
      return { ...state, junctions: computeJunctions(state) };

    default:
      return state;
  }
}

// Full state reducer wrapping undo/redo
function fullReducer(
  fs: FullState,
  action: { type: 'UNDO' } | { type: 'REDO' } | { type: 'EDITOR'; inner: Action },
): FullState {
  if (action.type === 'UNDO') {
    const prev = fs.history.past.at(-1);
    if (!prev) return fs;
    return {
      editor: prev,
      history: {
        past: fs.history.past.slice(0, -1),
        future: [fs.editor, ...fs.history.future].slice(0, MAX_HISTORY),
      },
    };
  }
  if (action.type === 'REDO') {
    const next = fs.history.future[0];
    if (!next) return fs;
    return {
      editor: next,
      history: {
        past: [...fs.history.past, fs.editor].slice(-MAX_HISTORY),
        future: fs.history.future.slice(1),
      },
    };
  }
  // EDITOR action — mutates editor state and pushes history for state-changing actions
  const stateless = new Set<string>(['RECOMPUTE_JUNCTIONS']);
  const newEditor = editorReducer(fs.editor, action.inner);
  if (newEditor === fs.editor) return fs;
  if (stateless.has(action.inner.type)) {
    return { ...fs, editor: newEditor };
  }
  return {
    editor: newEditor,
    history: pushHistory(fs.history, fs.editor),
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SchematicEditorProps {
  initialState: EditorState;
  onChange?: (state: EditorState) => void;
  onSave?: (state: EditorState) => Promise<void>;
  onDownload?: (state: EditorState) => void;
  readOnly?: boolean;
  className?: string;
  circuitId?: string;
}

// ---------------------------------------------------------------------------
// Wire in progress
// ---------------------------------------------------------------------------

interface WireInProgress {
  start: Point;
  current: Point;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SchematicEditor({
  initialState,
  onChange,
  onSave,
  onDownload,
  readOnly = false,
  className = '',
  circuitId,
}: SchematicEditorProps) {
  const [fs, rawDispatch] = useReducer(fullReducer, {
    editor: initialState,
    history: { past: [], future: [] },
  });

  const state = fs.editor;

  const dispatch = useCallback(
    (action: Action) => rawDispatch({ type: 'EDITOR', inner: action }),
    [],
  );

  // Mode & placement
  const [mode, setMode] = useState<EditorMode>('select');
  const [placingLibId, setPlacingLibId] = useState<string>('Device:R');
  const [placingValue, setPlacingValue] = useState<string>('10k');
  const [placingPrefix, setPlacingPrefix] = useState<string>('R');

  // Selection (Set of IDs)
  const [selection, setSelection] = useState<Set<string>>(new Set());

  // Clipboard
  const [clipboard, setClipboard] = useState<Clipboard>({
    components: [], wires: [], labels: [], texts: [],
  });

  // Ghost for placement preview
  const [ghostPos, setGhostPos] = useState<Point | null>(null);
  const [snapIndicator, setSnapIndicator] = useState<Point | null>(null);

  // Wire in progress
  const [wireIP, setWireIP] = useState<WireInProgress | null>(null);

  // Text placement popup
  const [textPopup, setTextPopup] = useState<{ pos: Point; value: string } | null>(null);

  // Inline edit for component properties
  const [editing, setEditing] = useState<{
    id: string;
    value: string;
    designator: string;
  } | null>(null);

  // Inline edit for text annotations
  const [editingText, setEditingText] = useState<{ id: string; text: string } | null>(null);

  // Label drag state: which component label is being dragged
  const labelDragRef = useRef<{
    compId: string;
    field: 'designatorOffset' | 'valueOffset';
    startWorld: Point;
    startOffset: { x: number; y: number };
  } | null>(null);

  // Symbol browser
  const [showBrowser, setShowBrowser] = useState(false);

  // Power palette popover
  const [showPowerPalette, setShowPowerPalette] = useState(false);

  // BOM panel
  const [showBom, setShowBom] = useState(false);

  // Viewport
  const [viewport, setViewport] = useState<Viewport>({ panX: 80, panY: 80, scale: INITIAL_SCALE });

  // Cursor world position (for status bar)
  const [cursorWorld, setCursorWorld] = useState<Point>({ x: 0, y: 0 });

  // Dragging state
  const dragRef = useRef<{
    compIds: string[];
    startPositions: Map<string, Point>;
    startWorld: Point;
    moved: boolean;
  } | null>(null);

  // Rectangle selection
  const rectSelectRef = useRef<{ start: Point; end: Point } | null>(null);
  const [rectSelectDraw, setRectSelectDraw] = useState<{ start: Point; end: Point } | null>(null);

  // Pan
  const panRef = useRef<{ startPanX: number; startPanY: number; startMouseX: number; startMouseY: number } | null>(null);

  // Space bar pan
  const spacePanRef = useRef(false);

  // SVG element
  const svgRef = useRef<SVGSVGElement>(null);

  // Save in-flight
  const [saving, setSaving] = useState(false);

  // Notify parent
  useEffect(() => {
    onChange?.(state);
  }, [state, onChange]);

  // Re-sync if prop changes (e.g. external load)
  const prevInitRef = useRef<EditorState>(initialState);
  useEffect(() => {
    if (initialState !== prevInitRef.current) {
      prevInitRef.current = initialState;
      dispatch({ type: 'SET_STATE', state: initialState });
    }
  }, [initialState, dispatch]);

  // Fit to screen on initial mount (after SVG has dimensions)
  const didFitRef = useRef(false);
  useEffect(() => {
    if (didFitRef.current) return;
    const t = setTimeout(() => {
      fitToScreen();
      didFitRef.current = true;
    }, 80);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Grid size (configurable)
  const [gridSize, setGridSize] = useState(2.54);

  // Track mouse-inside-canvas for keyboard capture
  const mouseInCanvasRef = useRef(false);
  const [inCanvas, setInCanvas] = useState(false);

  // ---------------------------------------------------------------------------
  // Coordinate helpers
  // ---------------------------------------------------------------------------

  const screenToWorld = useCallback(
    (screenX: number, screenY: number): Point => {
      const rect = svgRef.current?.getBoundingClientRect();
      const sx = screenX - (rect?.left ?? 0) - viewport.panX;
      const sy = screenY - (rect?.top ?? 0) - viewport.panY;
      return { x: sx / viewport.scale, y: sy / viewport.scale };
    },
    [viewport],
  );

  const worldToScreen = useCallback(
    (wx: number, wy: number): Point => ({
      x: wx * viewport.scale + viewport.panX,
      y: wy * viewport.scale + viewport.panY,
    }),
    [viewport],
  );

  // ---------------------------------------------------------------------------
  // Fit to screen
  // ---------------------------------------------------------------------------

  const fitToScreen = useCallback(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;

    const all: Point[] = [];
    for (const c of state.components) {
      all.push({ x: c.x, y: c.y });
    }
    for (const w of state.wires) {
      all.push({ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
    }
    for (const l of state.labels) all.push({ x: l.x, y: l.y });

    if (all.length === 0) {
      setViewport({ panX: W / 2, panY: H / 2, scale: INITIAL_SCALE });
      return;
    }

    const minX = Math.min(...all.map((p) => p.x));
    const maxX = Math.max(...all.map((p) => p.x));
    const minY = Math.min(...all.map((p) => p.y));
    const maxY = Math.max(...all.map((p) => p.y));
    const contentW = Math.max(maxX - minX, 20);
    const contentH = Math.max(maxY - minY, 20);
    const margin = 0.85;
    const sc = Math.min((W / contentW) * margin, (H / contentH) * margin, 40);
    const newScale = Math.max(sc, 2);
    const panX = W / 2 - ((minX + maxX) / 2) * newScale;
    const panY = H / 2 - ((minY + maxY) / 2) * newScale;
    setViewport({ panX, panY, scale: newScale });
  }, [state]);

  // ---------------------------------------------------------------------------
  // Place a component from catalog
  // ---------------------------------------------------------------------------

  const startPlace = useCallback((libId: string, value: string, prefix: string) => {
    setPlacingLibId(libId);
    setPlacingValue(value);
    setPlacingPrefix(prefix);
    setMode('place');
    setShowBrowser(false);
    setShowPowerPalette(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Copy / paste helpers
  // ---------------------------------------------------------------------------

  const copySelected = useCallback(() => {
    const comps = state.components.filter((c) => selection.has(c.id));
    const wires = state.wires.filter((w) => selection.has(w.id));
    const labels = state.labels.filter((l) => selection.has(l.id));
    const texts = state.texts.filter((t) => selection.has(t.id));
    setClipboard({ components: comps, wires, labels, texts });
  }, [state, selection]);

  const paste = useCallback(
    (offsetMm = 5) => {
      if (
        clipboard.components.length === 0 &&
        clipboard.wires.length === 0 &&
        clipboard.labels.length === 0 &&
        clipboard.texts.length === 0
      ) {
        return;
      }
      const idMap = new Map<string, string>();
      const remapId = (old: string) => {
        if (!idMap.has(old)) idMap.set(old, uid());
        return idMap.get(old) as string;
      };
      const comps = clipboard.components.map((c) => ({
        ...c,
        id: remapId(c.id),
        x: c.x + offsetMm,
        y: c.y + offsetMm,
        designator: nextDesignator(state, c.designator.replace(/\d+$/, '')),
      }));
      const wires = clipboard.wires.map((w) => ({
        ...w,
        id: uid(),
        x1: w.x1 + offsetMm,
        y1: w.y1 + offsetMm,
        x2: w.x2 + offsetMm,
        y2: w.y2 + offsetMm,
      }));
      const labels = clipboard.labels.map((l) => ({
        ...l,
        id: uid(),
        x: l.x + offsetMm,
        y: l.y + offsetMm,
      }));
      const texts = clipboard.texts.map((t) => ({
        ...t,
        id: uid(),
        x: t.x + offsetMm,
        y: t.y + offsetMm,
      }));
      dispatch({ type: 'PASTE', comps, wires, labels, texts });
      setSelection(new Set([...comps.map((c) => c.id), ...wires.map((w) => w.id)]));
    },
    [clipboard, dispatch, state],
  );

  // ---------------------------------------------------------------------------
  // Delete selected
  // ---------------------------------------------------------------------------

  const deleteSelected = useCallback(() => {
    if (selection.size === 0) return;
    dispatch({ type: 'DELETE_SELECTED', ids: new Set(selection) });
    setSelection(new Set());
  }, [dispatch, selection]);

  // ---------------------------------------------------------------------------
  // Wire stretching helper: when components move, pull connected wire endpoints
  // ---------------------------------------------------------------------------

  const wireUpdatesForMove = useCallback(
    (
      compIds: string[],
      oldPositions: Map<string, Point>,
      newPositions: Map<string, Point>,
    ): Array<{ id: string; x1: number; y1: number; x2: number; y2: number }> => {
      // Build old pin positions for all moved comps
      const oldPinMap = new Map<string, Point[]>();
      for (const id of compIds) {
        const comp = state.components.find((c) => c.id === id);
        const oldPos = oldPositions.get(id);
        if (!comp || !oldPos) continue;
        const phantom = { ...comp, x: oldPos.x, y: oldPos.y };
        oldPinMap.set(id, compPinPositions(phantom));
      }
      const newPinMap = new Map<string, Point[]>();
      for (const id of compIds) {
        const comp = state.components.find((c) => c.id === id);
        const newPos = newPositions.get(id);
        if (!comp || !newPos) continue;
        const phantom = { ...comp, x: newPos.x, y: newPos.y };
        newPinMap.set(id, compPinPositions(phantom));
      }

      const updates: Array<{ id: string; x1: number; y1: number; x2: number; y2: number }> = [];
      for (const wire of state.wires) {
        let x1 = wire.x1, y1 = wire.y1, x2 = wire.x2, y2 = wire.y2;
        let changed = false;

        for (const id of compIds) {
          const oldPins = oldPinMap.get(id) ?? [];
          const newPins = newPinMap.get(id) ?? [];
          for (let i = 0; i < oldPins.length; i++) {
            const op = oldPins[i];
            const np = newPins[i];
            if (!op || !np) continue;
            if (dist({ x: x1, y: y1 }, op) < 0.01) {
              x1 = np.x; y1 = np.y; changed = true;
            }
            if (dist({ x: x2, y: y2 }, op) < 0.01) {
              x2 = np.x; y2 = np.y; changed = true;
            }
          }
        }

        if (changed) updates.push({ id: wire.id, x1, y1, x2, y2 });
      }
      return updates;
    },
    [state],
  );

  // ---------------------------------------------------------------------------
  // Mouse wheel zoom
  // ---------------------------------------------------------------------------

  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setViewport((v) => {
        const newScale = Math.min(80, Math.max(1, v.scale * factor));
        return {
          panX: mx - (mx - v.panX) * (newScale / v.scale),
          panY: my - (my - v.panY) * (newScale / v.scale),
          scale: newScale,
        };
      });
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Mouse down
  // ---------------------------------------------------------------------------

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      // Middle mouse or space+drag → pan
      if (e.button === 1 || spacePanRef.current) {
        panRef.current = {
          startPanX: viewport.panX,
          startPanY: viewport.panY,
          startMouseX: e.clientX,
          startMouseY: e.clientY,
        };
        e.preventDefault();
        return;
      }

      if (e.button !== 0) return;

      const raw = screenToWorld(e.clientX, e.clientY);

      // Rectangle selection start (select mode, empty area click)
      if (mode === 'select') {
        // Bounding-box hit test first — allows clicking anywhere inside the component
        const hitComp = hitTestComponent(raw.x, raw.y, state.components);
        if (hitComp && !readOnly) {
          if (!e.shiftKey && !selection.has(hitComp.id)) {
            setSelection(new Set([hitComp.id]));
          } else if (e.shiftKey) {
            setSelection((prev) => {
              const next = new Set(prev);
              if (next.has(hitComp.id)) next.delete(hitComp.id);
              else next.add(hitComp.id);
              return next;
            });
            return;
          }
          const dragIds = selection.has(hitComp.id)
            ? [...selection].filter((id) => state.components.some((c) => c.id === id))
            : [hitComp.id];
          const startPositions = new Map<string, Point>();
          for (const id of dragIds) {
            const c = state.components.find((cc) => cc.id === id);
            if (c) startPositions.set(id, { x: c.x, y: c.y });
          }
          dragRef.current = {
            compIds: dragIds,
            startPositions,
            startWorld: raw,
            moved: false,
          };
          return;
        }

        const snapPt = findSnapPoint(raw, state);
        if (!snapPt) {
          rectSelectRef.current = { start: raw, end: raw };
          setRectSelectDraw({ start: raw, end: raw });
        }
      }
    },
    [viewport, screenToWorld, mode, state, selection, readOnly],
  );

  // ---------------------------------------------------------------------------
  // Mouse move
  // ---------------------------------------------------------------------------

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const raw = screenToWorld(e.clientX, e.clientY);
      const snappedGrid = { x: snapTo(raw.x, gridSize), y: snapTo(raw.y, gridSize) };
      setCursorWorld(snappedGrid);

      // Pan
      if (panRef.current) {
        const pan = panRef.current;
        setViewport((v) => ({
          ...v,
          panX: pan.startPanX + (e.clientX - pan.startMouseX),
          panY: pan.startPanY + (e.clientY - pan.startMouseY),
        }));
        return;
      }

      // Label drag
      if (labelDragRef.current) {
        const ld = labelDragRef.current;
        const delta = {
          x: raw.x - ld.startWorld.x,
          y: raw.y - ld.startWorld.y,
        };
        const newOffset = {
          x: ld.startOffset.x + delta.x,
          y: ld.startOffset.y + delta.y,
        };
        dispatch({
          type: 'UPDATE_COMP_PARTIAL',
          id: ld.compId,
          changes: { [ld.field]: newOffset },
        });
        return;
      }

      // Component drag
      if (dragRef.current) {
        dragRef.current.moved = true;
        const delta = {
          x: raw.x - dragRef.current.startWorld.x,
          y: raw.y - dragRef.current.startWorld.y,
        };
        const moves: Array<{ id: string; x: number; y: number }> = [];
        const oldPositions = new Map<string, Point>();
        const newPositions = new Map<string, Point>();
        for (const id of dragRef.current.compIds) {
          const startPos = dragRef.current.startPositions.get(id);
          if (!startPos) continue;
          const nx = snapTo(startPos.x + delta.x, gridSize);
          const ny = snapTo(startPos.y + delta.y, gridSize);
          moves.push({ id, x: nx, y: ny });
          oldPositions.set(id, startPos);
          newPositions.set(id, { x: nx, y: ny });
        }
        const wireUpdates = wireUpdatesForMove(
          dragRef.current.compIds,
          oldPositions,
          newPositions,
        );
        dispatch({ type: 'MOVE_COMPS', moves, wireUpdates });
        return;
      }

      // Rectangle selection update
      if (rectSelectRef.current) {
        rectSelectRef.current.end = raw;
        setRectSelectDraw({ start: rectSelectRef.current.start, end: raw });
        return;
      }

      // Ghost placement preview
      if (mode === 'place') {
        const snapped = findSnapPoint(raw, state) ?? snappedGrid;
        setGhostPos(snapped);
        setSnapIndicator(findSnapPoint(raw, state));
        return;
      }

      // Wire in progress
      if (mode === 'wire' && wireIP) {
        const snapped = findSnapPoint(raw, state) ?? snappedGrid;
        setWireIP((w) => (w ? { ...w, current: snapped } : null));
        setSnapIndicator(findSnapPoint(raw, state));
        return;
      }
    },
    [screenToWorld, wireIP, mode, state, dispatch, wireUpdatesForMove, gridSize],
  );

  // ---------------------------------------------------------------------------
  // Mouse up
  // ---------------------------------------------------------------------------

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      panRef.current = null;

      if (labelDragRef.current) {
        labelDragRef.current = null;
        return;
      }

      if (dragRef.current) {
        dragRef.current = null;
        // Recompute junctions after move
        dispatch({ type: 'RECOMPUTE_JUNCTIONS' });
        return;
      }

      // Finalise rectangle selection
      if (rectSelectRef.current) {
        const { start, end } = rectSelectRef.current;
        rectSelectRef.current = null;
        setRectSelectDraw(null);

        const rx = Math.min(start.x, end.x);
        const ry = Math.min(start.y, end.y);
        const rw = Math.abs(end.x - start.x);
        const rh = Math.abs(end.y - start.y);

        // Only act if there was a meaningful drag
        if (rw > 1 && rh > 1) {
          const newSel = new Set<string>();
          for (const comp of state.components) {
            const b = compBBox(comp);
            if (b.x >= rx && b.y >= ry && b.x + b.w <= rx + rw && b.y + b.h <= ry + rh) {
              newSel.add(comp.id);
            }
          }
          for (const w of state.wires) {
            if (
              w.x1 >= rx && w.y1 >= ry && w.x1 <= rx + rw && w.y1 <= ry + rh &&
              w.x2 >= rx && w.y2 >= ry && w.x2 <= rx + rw && w.y2 <= ry + rh
            ) {
              newSel.add(w.id);
            }
          }
          if (e.shiftKey) {
            setSelection((prev) => new Set([...prev, ...newSel]));
          } else {
            setSelection(newSel);
          }
          return;
        }
      }
    },
    [dispatch, state],
  );

  // ---------------------------------------------------------------------------
  // Canvas click (empty canvas, mode-specific actions)
  // ---------------------------------------------------------------------------

  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      if (panRef.current) return;

      const raw = screenToWorld(e.clientX, e.clientY);
      const snappedGrid = { x: snapTo(raw.x, gridSize), y: snapTo(raw.y, gridSize) };

      if (mode === 'wire') {
        const snapped = findSnapPoint(raw, state) ?? snappedGrid;

        if (!wireIP) {
          setWireIP({ start: snapped, current: snapped });
          return;
        }

        const from = wireIP.start;
        if (dist(from, snapped) < 0.1) return;

        // Build orthogonal wire (H first then V)
        const mid: Point = { x: snapped.x, y: from.y };
        if (
          Math.abs(from.x - snapped.x) > 0.1 &&
          Math.abs(from.y - snapped.y) > 0.1
        ) {
          dispatch({ type: 'ADD_WIRE', wire: { id: uid(), x1: from.x, y1: from.y, x2: mid.x, y2: mid.y } });
          dispatch({ type: 'ADD_WIRE', wire: { id: uid(), x1: mid.x, y1: mid.y, x2: snapped.x, y2: snapped.y } });
        } else {
          dispatch({ type: 'ADD_WIRE', wire: { id: uid(), x1: from.x, y1: from.y, x2: snapped.x, y2: snapped.y } });
        }

        // If landed on a pin or wire endpoint → end wire; otherwise continue from here
        const landedSnap = findSnapPoint(snapped, state);
        if (landedSnap && dist(landedSnap, snapped) < 0.05) {
          setWireIP(null);
        } else {
          setWireIP({ start: snapped, current: snapped });
        }
        return;
      }

      if (mode === 'place') {
        const pt = findSnapPoint(raw, state) ?? snappedGrid;
        const comp: EditorComponent = {
          id: uid(),
          libId: placingLibId,
          designator: nextDesignator(state, placingPrefix),
          value: placingValue,
          x: pt.x, y: pt.y,
          rot: 0,
          mirror: 'none',
        };
        dispatch({ type: 'ADD_COMP', comp });
        // Stay in place mode for next placement
        return;
      }

      if (mode === 'no_connect') {
        const pt = snappedGrid;
        // Find nearest pin
        let nearestPin: Point | null = null;
        let nearestDist = WIRE_SNAP_R;
        for (const comp of state.components) {
          for (const pp of compPinPositions(comp)) {
            const d = dist(raw, pp);
            if (d < nearestDist) { nearestDist = d; nearestPin = pp; }
          }
        }
        const pos = nearestPin ?? pt;
        dispatch({
          type: 'ADD_NO_CONNECT',
          nc: { id: uid(), x: pos.x, y: pos.y },
        });
        return;
      }

      if (mode === 'text') {
        setTextPopup({ pos: snappedGrid, value: '' });
        return;
      }

      // Select mode — click on empty canvas → deselect
      if (mode === 'select' && !e.shiftKey) {
        setSelection(new Set());
        setEditing(null);
      }
    },
    [mode, wireIP, state, placingLibId, placingValue, placingPrefix, dispatch, screenToWorld, gridSize],
  );

  // ---------------------------------------------------------------------------
  // Component click/double-click/mousedown
  // ---------------------------------------------------------------------------

  const handleCompMouseDown = useCallback(
    (e: React.MouseEvent, comp: EditorComponent) => {
      if (readOnly || mode !== 'select') return;
      e.stopPropagation();

      if (!e.shiftKey && !selection.has(comp.id)) {
        setSelection(new Set([comp.id]));
      } else if (e.shiftKey) {
        setSelection((prev) => {
          const next = new Set(prev);
          if (next.has(comp.id)) next.delete(comp.id);
          else next.add(comp.id);
          return next;
        });
        return; // Don't start drag when toggling
      }

      // Start drag for all currently selected components (or just this one)
      const dragIds = selection.has(comp.id)
        ? [...selection].filter((id) => state.components.some((c) => c.id === id))
        : [comp.id];

      const startPositions = new Map<string, Point>();
      for (const id of dragIds) {
        const c = state.components.find((cc) => cc.id === id);
        if (c) startPositions.set(id, { x: c.x, y: c.y });
      }

      dragRef.current = {
        compIds: dragIds,
        startPositions,
        startWorld: screenToWorld(e.clientX, e.clientY),
        moved: false,
      };
    },
    [readOnly, mode, selection, state, screenToWorld],
  );

  const handleCompDblClick = useCallback(
    (e: React.MouseEvent, comp: EditorComponent) => {
      if (readOnly || mode !== 'select') return;
      e.stopPropagation();
      setEditing({ id: comp.id, value: comp.value, designator: comp.designator });
    },
    [readOnly, mode],
  );

  const handleWireClick = useCallback(
    (e: React.MouseEvent, wire: EditorWire) => {
      if (mode !== 'select') return;
      e.stopPropagation();
      if (e.shiftKey) {
        setSelection((prev) => {
          const next = new Set(prev);
          if (next.has(wire.id)) next.delete(wire.id);
          else next.add(wire.id);
          return next;
        });
      } else {
        setSelection(new Set([wire.id]));
      }
    },
    [mode],
  );

  const handleLabelClick = useCallback(
    (e: React.MouseEvent, label: EditorLabel) => {
      if (mode !== 'select') return;
      e.stopPropagation();
      if (e.shiftKey) {
        setSelection((prev) => {
          const next = new Set(prev);
          if (next.has(label.id)) next.delete(label.id);
          else next.add(label.id);
          return next;
        });
      } else {
        setSelection(new Set([label.id]));
      }
    },
    [mode],
  );

  const handleTextDblClick = useCallback(
    (e: React.MouseEvent, text: EditorText) => {
      if (readOnly || mode !== 'select') return;
      e.stopPropagation();
      setEditingText({ id: text.id, text: text.text });
    },
    [readOnly, mode],
  );

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

      // Capture browser shortcuts when mouse is inside canvas
      if (mouseInCanvasRef.current && !isInput) {
        const browserKeys = ['+', '=', '-', 'F5', 'F3', 'F12'];
        if (browserKeys.includes(e.key) || (e.ctrlKey && ['f', 'p', 'r', 'g', 's', 'w', 'l'].includes(e.key.toLowerCase()))) {
          e.preventDefault();
        }
      }

      if (e.key === ' ') {
        spacePanRef.current = true;
      }

      if (e.key === 'Escape') {
        if (!mouseInCanvasRef.current) return;
        setWireIP(null);
        setGhostPos(null);
        setTextPopup(null);
        setEditing(null);
        setEditingText(null);
        setShowBrowser(false);
        setShowPowerPalette(false);
        if (mode !== 'select') {
          setMode('select');
        } else {
          setSelection(new Set());
        }
        return;
      }

      if (isInput) return;

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        rawDispatch({ type: 'UNDO' });
        return;
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'y' || (e.key === 'z' && e.shiftKey))
      ) {
        e.preventDefault();
        rawDispatch({ type: 'REDO' });
        return;
      }

      // Copy / Paste / Duplicate
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        copySelected();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        paste();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        copySelected();
        paste();
        return;
      }

      // Select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        const all = new Set<string>([
          ...state.components.map((c) => c.id),
          ...state.wires.map((w) => w.id),
        ]);
        setSelection(all);
        return;
      }

      // Delete
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.size > 0) {
        deleteSelected();
        return;
      }

      // Rotate (R)
      if (e.key === 'r' && selection.size > 0) {
        for (const id of selection) {
          if (state.components.some((c) => c.id === id)) {
            dispatch({ type: 'ROTATE_COMP', id });
          }
        }
        return;
      }

      // Mirror (X)
      if (e.key === 'x' && selection.size > 0) {
        for (const id of selection) {
          if (state.components.some((c) => c.id === id)) {
            dispatch({ type: 'MIRROR_COMP', id });
          }
        }
        return;
      }

      // Mode shortcuts — only fire when mouse is inside canvas
      if (!mouseInCanvasRef.current) return;

      // Mode shortcuts (KiCad-compatible)
      if (e.key === 's' && !e.ctrlKey && !e.shiftKey) setMode('select');
      if (e.key === 'w' && !e.ctrlKey) { e.preventDefault(); setMode('wire'); }
      if ((e.key === 'q' || e.key === 'Q') && !e.ctrlKey) setMode('no_connect');
      if (e.key === 't' && !e.ctrlKey) { e.preventDefault(); setMode('text'); }
      if (e.key === 'a' && !e.ctrlKey) { e.preventDefault(); setShowBrowser(true); }
      // L = Add Net Label (KiCad standard) — activate label placement via text popup
      if (e.key === 'l' && !e.ctrlKey) {
        e.preventDefault();
        setMode('text');
      }
      // P = Power symbols palette
      if (e.key === 'p' && !e.ctrlKey) {
        e.preventDefault();
        setShowPowerPalette((v) => !v);
      }
      // Home = Fit to screen (KiCad standard)
      if (e.key === 'Home') {
        e.preventDefault();
        fitToScreen();
      }
      // F = Flip/Mirror (KiCad: X mirror)
      if (e.key === 'f' && !e.ctrlKey && selection.size > 0) {
        for (const id of selection) {
          if (state.components.some((c) => c.id === id)) dispatch({ type: 'MIRROR_COMP', id });
        }
      }
      // E = Edit properties (same as double-click, opens inline editor)
      if (e.key === 'e' && !e.ctrlKey && selection.size === 1) {
        const [selId] = [...selection];
        const selComp = state.components.find((c) => c.id === selId);
        if (selComp) {
          setEditing({ id: selComp.id, value: selComp.value ?? '', designator: selComp.designator });
        }
      }

      // Zoom
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setViewport((v) => ({ ...v, scale: Math.min(80, v.scale * 1.2) }));
      }
      if (e.key === '-') {
        e.preventDefault();
        setViewport((v) => ({ ...v, scale: Math.max(1, v.scale / 1.2) }));
      }
    };

    const upHandler = (e: KeyboardEvent) => {
      if (e.key === ' ') spacePanRef.current = false;
    };

    window.addEventListener('keydown', handler);
    window.addEventListener('keyup', upHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('keyup', upHandler);
    };
  }, [mode, selection, state, copySelected, paste, deleteSelected, dispatch]);

  // ---------------------------------------------------------------------------
  // Grid SVG pattern
  // ---------------------------------------------------------------------------

  const gridPatternId = 'sg-grid';
  const dotSize = Math.max(0.5, 1.0);

  const groupTransform = `translate(${viewport.panX} ${viewport.panY}) scale(${viewport.scale})`;

  // ---------------------------------------------------------------------------
  // Cursor style
  // ---------------------------------------------------------------------------

  const cursorStyle: string =
    spacePanRef.current ? 'grab' :
    !inCanvas ? 'default' :
    mode === 'wire' || mode === 'no_connect' ? 'crosshair' :
    mode === 'place' || mode === 'text' ? 'cell' :
    'default';

  // ---------------------------------------------------------------------------
  // Selection helpers
  // ---------------------------------------------------------------------------

  const selectedComps = useMemo(
    () => state.components.filter((c) => selection.has(c.id)),
    [state.components, selection],
  );

  const hasMultipleSelected = selectedComps.length >= 2;

  // Single selected component — drives PropertiesPanel
  const singleSelectedComp = selection.size === 1 ? (selectedComps[0] ?? null) : null;

  // ---------------------------------------------------------------------------
  // Align dispatch helper
  // ---------------------------------------------------------------------------

  const alignSelected = useCallback(
    (axis: 'left' | 'right' | 'top' | 'bottom' | 'centerH' | 'centerV' | 'distributeH' | 'distributeV') => {
      dispatch({ type: 'ALIGN', ids: new Set(selectedComps.map((c) => c.id)), axis });
    },
    [dispatch, selectedComps],
  );

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const ghostDraw = useMemo(() => {
    try {
      return drawSymbol(placingLibId, placingValue);
    } catch {
      return null;
    }
  }, [placingLibId, placingValue]);

  // ---------------------------------------------------------------------------
  // Save handler
  // ---------------------------------------------------------------------------

  const handleSave = useCallback(async () => {
    if (!onSave || saving) return;
    setSaving(true);
    try {
      await onSave(state);
    } finally {
      setSaving(false);
    }
  }, [onSave, state, saving]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={`relative flex h-full flex-col overflow-hidden ${className}`}>
      {/* Symbol browser panel (shown as side panel) */}
      {showBrowser && (
        <div className="absolute inset-y-0 right-0 z-20 w-72 shadow-2xl border-l border-border">
          <SymbolBrowser
            onPlace={(entry: CatalogEntry) => {
              startPlace(entry.libId, entry.defaultValue, entry.designatorPrefix);
            }}
            onClose={() => setShowBrowser(false)}
          />
        </div>
      )}

      {/* BOM panel */}
      {showBom && (
        <div className="absolute inset-y-0 right-0 z-20 w-96 shadow-2xl border-l border-border overflow-auto bg-background">
          <BomTable
            components={state.components}
            onClose={() => setShowBom(false)}
            onUpdateComponent={(id, field, value) => {
              dispatch({ type: 'UPDATE_COMP_FIELD', id, field, fieldValue: value });
            }}
          />
        </div>
      )}

      {/* Properties panel — slides in from right when a single component is selected */}
      {!showBrowser && !showBom && (
        <PropertiesPanel
          component={singleSelectedComp}
          onUpdate={(id, changes) =>
            dispatch({ type: 'UPDATE_COMP_PARTIAL', id, changes })
          }
          onClose={() => setSelection(new Set())}
        />
      )}

      {/* Toolbar */}
      {!readOnly && (
        <EditorToolbar
          mode={mode}
          canUndo={fs.history.past.length > 0}
          canRedo={fs.history.future.length > 0}
          hasSelection={selection.size > 0}
          hasMultipleSelected={hasMultipleSelected}
          saving={saving}
          showSave={!!onSave && !!circuitId}
          showDownload={!!onDownload}
          showPowerPalette={showPowerPalette}
          onMode={(m) => {
            setMode(m);
            setWireIP(null);
            setGhostPos(null);
          }}
          onUndo={() => rawDispatch({ type: 'UNDO' })}
          onRedo={() => rawDispatch({ type: 'REDO' })}
          onDelete={deleteSelected}
          onRotate={() => {
            for (const id of selection) {
              if (state.components.some((c) => c.id === id)) dispatch({ type: 'ROTATE_COMP', id });
            }
          }}
          onMirror={() => {
            for (const id of selection) {
              if (state.components.some((c) => c.id === id)) dispatch({ type: 'MIRROR_COMP', id });
            }
          }}
          onFitScreen={fitToScreen}
          onZoomIn={() => setViewport((v) => ({ ...v, scale: Math.min(80, v.scale * 1.2) }))}
          onZoomOut={() => setViewport((v) => ({ ...v, scale: Math.max(1, v.scale / 1.2) }))}
          onOpenBrowser={() => setShowBrowser((s) => !s)}
          onBom={() => setShowBom((s) => !s)}
          onTogglePowerPalette={() => setShowPowerPalette((s) => !s)}
          onPowerSymbol={(libId, value) => startPlace(libId, value, '#PWR')}
          onAlign={alignSelected}
          onSave={handleSave}
          onDownload={onDownload ? () => onDownload(state) : undefined}
          gridSize={gridSize}
          onGridSizeChange={setGridSize}
        />
      )}

      {/* Canvas */}
      <svg
        ref={svgRef}
        className="w-full flex-1 select-none"
        style={{ background: COLOR.canvas, cursor: cursorStyle, minHeight: 420 }}
        onMouseEnter={() => {
          mouseInCanvasRef.current = true;
          setInCanvas(true);
          const active = document.activeElement;
          if (active instanceof HTMLElement && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
            active.blur();
          }
        }}
        onMouseLeave={() => {
          mouseInCanvasRef.current = false;
          setInCanvas(false);
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleSvgClick}
        onContextMenu={(e) => {
          e.preventDefault();
          setWireIP(null);
          setGhostPos(null);
          if (mode !== 'select') setMode('select');
        }}
      >
        <defs>
          <pattern
            id={gridPatternId}
            x={viewport.panX % (gridSize * viewport.scale)}
            y={viewport.panY % (gridSize * viewport.scale)}
            width={gridSize * viewport.scale}
            height={gridSize * viewport.scale}
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx="0" cy="0"
              r={dotSize}
              fill={COLOR.grid}
              opacity={0.5}
            />
          </pattern>
        </defs>

        {/* Grid dots */}
        <rect width="100%" height="100%" fill={`url(#${gridPatternId})`} />

        {/* World-space content */}
        <g transform={groupTransform} color={COLOR.component}>
          {/* Wires */}
          {state.wires.map((w) => (
            <WireEl
              key={w.id}
              wire={w}
              selected={selection.has(w.id)}
              onClick={(e) => handleWireClick(e, w)}
            />
          ))}

          {/* Wire in progress preview */}
          {wireIP && mode === 'wire' && (
            <WirePreview from={wireIP.start} to={wireIP.current} />
          )}

          {/* Junctions */}
          {state.junctions.map((j) => (
            <circle
              key={j.id}
              cx={j.x} cy={j.y}
              r={0.8}
              fill={COLOR.junction}
              pointerEvents="none"
            />
          ))}

          {/* No-connect markers */}
          {state.noConnects.map((nc) => (
            <NoConnectEl key={nc.id} nc={nc} selected={selection.has(nc.id)} />
          ))}

          {/* Labels */}
          {state.labels.map((l) => (
            <LabelEl
              key={l.id}
              label={l}
              selected={selection.has(l.id)}
              onClick={(e) => handleLabelClick(e, l)}
            />
          ))}

          {/* Text annotations */}
          {state.texts.map((t) => (
            <TextEl
              key={t.id}
              text={t}
              selected={selection.has(t.id)}
              editing={editingText?.id === t.id ? editingText : null}
              onClick={(e) => {
                if (mode !== 'select') return;
                e.stopPropagation();
                setSelection(new Set([t.id]));
              }}
              onDblClick={(e) => handleTextDblClick(e, t)}
              onEditCommit={(v) => {
                dispatch({ type: 'UPDATE_TEXT', id: t.id, text: v });
                setEditingText(null);
              }}
              onEditChange={(v) => setEditingText((et) => et ? { ...et, text: v } : null)}
            />
          ))}

          {/* Components */}
          {state.components.map((comp) => (
            <ComponentEl
              key={comp.id}
              comp={comp}
              selected={selection.has(comp.id)}
              editing={editing?.id === comp.id ? editing : null}
              onMouseDown={(e) => handleCompMouseDown(e, comp)}
              onDblClick={(e) => handleCompDblClick(e, comp)}
              onEditCommit={(value, designator) => {
                dispatch({ type: 'UPDATE_COMP', id: comp.id, value, designator });
                setEditing(null);
              }}
              onEditChange={(field, v) =>
                setEditing((ed) =>
                  ed ? { ...ed, [field]: v } : null,
                )
              }
            />
          ))}

          {/* Placement ghost */}
          {mode === 'place' && ghostPos && ghostDraw && (
            <g
              transform={`translate(${ghostPos.x} ${ghostPos.y})`}
              opacity={0.55}
              pointerEvents="none"
              color={COLOR.component}
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: ghostDraw.svg }}
            />
          )}

          {/* Snap indicator circle */}
          {snapIndicator && (
            <circle
              cx={snapIndicator.x} cy={snapIndicator.y}
              r={0.9}
              fill="none"
              stroke={COLOR.snapIndicator}
              strokeWidth={0.3}
              pointerEvents="none"
            />
          )}

          {/* Rectangle selection box */}
          {rectSelectDraw && (
            <rect
              x={Math.min(rectSelectDraw.start.x, rectSelectDraw.end.x)}
              y={Math.min(rectSelectDraw.start.y, rectSelectDraw.end.y)}
              width={Math.abs(rectSelectDraw.end.x - rectSelectDraw.start.x)}
              height={Math.abs(rectSelectDraw.end.y - rectSelectDraw.start.y)}
              fill={`${COLOR.selection}1a`}
              stroke={COLOR.selection}
              strokeWidth={0.25}
              strokeDasharray="1.5 0.75"
              pointerEvents="none"
            />
          )}
        </g>
      </svg>

      {/* Text placement popup */}
      {textPopup && (
        <TextPopup
          screenPos={worldToScreen(textPopup.pos.x, textPopup.pos.y)}
          value={textPopup.value}
          onChange={(v) => setTextPopup((tp) => tp ? { ...tp, value: v } : null)}
          onConfirm={() => {
            if (textPopup.value.trim()) {
              dispatch({
                type: 'ADD_TEXT',
                text: {
                  id: uid(),
                  text: textPopup.value,
                  x: textPopup.pos.x,
                  y: textPopup.pos.y,
                  fontSize: 2.5,
                  bold: false,
                  italic: false,
                },
              });
            }
            setTextPopup(null);
          }}
          onCancel={() => setTextPopup(null)}
        />
      )}

      {/* Status bar */}
      <div
        className="flex items-center gap-4 border-t border-border bg-background px-3 py-1 font-mono text-[10px] text-muted-foreground"
        style={{ flexShrink: 0 }}
      >
        <span>X: {cursorWorld.x.toFixed(2)} Y: {cursorWorld.y.toFixed(2)} mm</span>
        <span className="opacity-40">|</span>
        <span>{state.components.length} comp</span>
        <span>{state.wires.length} wire</span>
        <span className="opacity-40">|</span>
        <span>zoom {Math.round((viewport.scale / INITIAL_SCALE) * 100)}%</span>
        {!readOnly && (
          <span className="ml-auto opacity-60">
            {mode === 'select' && 'Click/drag rect to select · R rotate · X mirror · Del delete · Dbl-click edit'}
            {mode === 'wire' && 'Click start wire · Click again to route · Esc cancel'}
            {mode === 'place' && `Click to place ${placingLibId} · Esc done`}
            {mode === 'no_connect' && 'Click pin to place no-connect marker · Esc done'}
            {mode === 'text' && 'Click to add text annotation · Esc done'}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

interface EditorToolbarProps {
  mode: EditorMode;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  hasMultipleSelected: boolean;
  saving: boolean;
  showSave: boolean;
  showDownload: boolean;
  showPowerPalette: boolean;
  onMode: (m: EditorMode) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onRotate: () => void;
  onMirror: () => void;
  onFitScreen: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onOpenBrowser: () => void;
  onBom: () => void;
  onTogglePowerPalette: () => void;
  onPowerSymbol: (libId: string, value: string) => void;
  onAlign: (axis: 'left' | 'right' | 'top' | 'bottom' | 'centerH' | 'centerV' | 'distributeH' | 'distributeV') => void;
  onSave: () => void;
  onDownload?: () => void;
  gridSize: number;
  onGridSizeChange: (gs: number) => void;
}

function EditorToolbar({
  mode, canUndo, canRedo, hasSelection, hasMultipleSelected,
  saving, showSave, showDownload, showPowerPalette,
  onMode, onUndo, onRedo, onDelete, onRotate, onMirror,
  onFitScreen, onZoomIn, onZoomOut, onOpenBrowser, onBom, onTogglePowerPalette,
  onPowerSymbol, onAlign, onSave, onDownload, gridSize, onGridSizeChange,
}: EditorToolbarProps) {
  return (
    <div className="relative flex flex-wrap items-center gap-1 border-b border-border bg-background px-2 py-1.5">
      {/* Mode buttons */}
      <TBtn active={mode === 'select'} onClick={() => onMode('select')} title="Select (S)">
        <SelectIcon />
      </TBtn>
      <TBtn active={mode === 'wire'} onClick={() => onMode('wire')} title="Wire (W)">
        <WireIcon />
      </TBtn>
      <TBtn active={mode === 'no_connect'} onClick={() => onMode('no_connect')} title="No-Connect (N)">
        <NCIcon />
      </TBtn>
      <TBtn active={mode === 'text'} onClick={() => onMode('text')} title="Text (T)">
        <TextIcon />
      </TBtn>

      <Sep />

      {/* Component actions */}
      <TBtn active={false} onClick={onRotate} disabled={!hasSelection} title="Rotate (R)">
        <RotateIcon />
      </TBtn>
      <TBtn active={false} onClick={onMirror} disabled={!hasSelection} title="Mirror X (X)">
        <MirrorIcon />
      </TBtn>
      <TBtn active={false} onClick={onDelete} disabled={!hasSelection} title="Delete (Del)">
        <DeleteIcon />
      </TBtn>

      <Sep />

      {/* Power palette */}
      <div className="relative">
        <TBtn active={showPowerPalette} onClick={onTogglePowerPalette} title="Power symbols">
          <PwrIcon />
        </TBtn>
        {showPowerPalette && (
          <div className="absolute left-0 top-full z-30 mt-1 w-28 rounded border border-border bg-background shadow-lg">
            {POWER_SYMBOLS.map((ps) => (
              <button
                key={ps.libId}
                type="button"
                onClick={() => onPowerSymbol(ps.libId, ps.value)}
                className="w-full px-3 py-1 text-left font-mono text-[11px] text-foreground hover:bg-muted"
              >
                {ps.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Add symbol */}
      <TBtn active={false} onClick={onOpenBrowser} title="Add Symbol (A)">
        <AddSymbolIcon />
      </TBtn>

      {/* BOM */}
      <TBtn active={false} onClick={onBom} title="Bill of Materials">
        <BomIcon />
      </TBtn>

      <Sep />

      {/* Alignment tools — only shown when 2+ selected */}
      {hasMultipleSelected && (
        <>
          <TBtn active={false} onClick={() => onAlign('left')} title="Align left edges">
            <AlignLIcon />
          </TBtn>
          <TBtn active={false} onClick={() => onAlign('right')} title="Align right edges">
            <AlignRIcon />
          </TBtn>
          <TBtn active={false} onClick={() => onAlign('top')} title="Align top edges">
            <AlignTIcon />
          </TBtn>
          <TBtn active={false} onClick={() => onAlign('bottom')} title="Align bottom edges">
            <AlignBIcon />
          </TBtn>
          <TBtn active={false} onClick={() => onAlign('centerH')} title="Align horizontal centers">
            <AlignCHIcon />
          </TBtn>
          <TBtn active={false} onClick={() => onAlign('centerV')} title="Align vertical centers">
            <AlignCVIcon />
          </TBtn>
          <TBtn active={false} onClick={() => onAlign('distributeH')} title="Distribute horizontally">
            <DistHIcon />
          </TBtn>
          <TBtn active={false} onClick={() => onAlign('distributeV')} title="Distribute vertically">
            <DistVIcon />
          </TBtn>
          <Sep />
        </>
      )}

      {/* Undo / Redo */}
      <TBtn active={false} onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        <UndoIcon />
      </TBtn>
      <TBtn active={false} onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">
        <RedoIcon />
      </TBtn>

      <Sep />

      {/* Zoom */}
      <TBtn active={false} onClick={onZoomIn} title="Zoom in (+)">
        <ZoomInIcon />
      </TBtn>
      <TBtn active={false} onClick={onZoomOut} title="Zoom out (-)">
        <ZoomOutIcon />
      </TBtn>
      <TBtn active={false} onClick={onFitScreen} title="Fit to screen">
        <FitIcon />
      </TBtn>

      <Sep />

      {/* Grid size selector */}
      <select
        title="Grid size"
        value={String(gridSize)}
        onChange={(e) => onGridSizeChange(Number(e.target.value))}
        className="h-6 rounded border border-border bg-background px-1 font-mono text-[10px] text-foreground focus:outline-none"
      >
        <option value="0.635">0.635mm (25mil)</option>
        <option value="1">1mm</option>
        <option value="1.27">1.27mm (50mil)</option>
        <option value="1.5">1.5mm</option>
        <option value="2.54">2.54mm (100mil)</option>
        <option value="3">3mm</option>
        <option value="5">5mm</option>
      </select>

      {/* Save / Download */}
      {(showSave || showDownload) && <Sep />}
      {showSave && (
        <TBtn active={false} onClick={onSave} disabled={saving} title="Save to database">
          <span className="font-mono text-[10px]">{saving ? '…' : 'Save'}</span>
        </TBtn>
      )}
      {showDownload && onDownload && (
        <TBtn active={false} onClick={onDownload} title="Download">
          <DownloadIcon />
        </TBtn>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar button
// ---------------------------------------------------------------------------

function TBtn({
  active, onClick, disabled = false, title, children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex h-6 min-w-[24px] items-center justify-center rounded px-1 text-xs transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
        disabled ? 'pointer-events-none opacity-30' : '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

function SelectIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="currentColor">
      <path d="M2 2l4 10 1.5-3L11 12l1-1-3.5-3.5L12 6z" />
    </svg>
  );
}
function WireIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8">
      <polyline points="2,12 2,6 8,6 8,2 12,2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function NCIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8">
      <line x1="3" y1="3" x2="11" y2="11" strokeLinecap="round" />
      <line x1="11" y1="3" x2="3" y2="11" strokeLinecap="round" />
    </svg>
  );
}
function TextIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6">
      <polyline points="2,3 7,3 12,3" /><line x1="7" y1="3" x2="7" y2="12" />
    </svg>
  );
}
function RotateIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 7a4 4 0 1 0 4-4" /><polyline points="4,1 3,4 6,4" />
    </svg>
  );
}
function MirrorIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6">
      <line x1="7" y1="1" x2="7" y2="13" strokeDasharray="2 1.5" />
      <polyline points="2,4 5,7 2,10" /><polyline points="12,4 9,7 12,10" />
    </svg>
  );
}
function DeleteIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6">
      <polyline points="2,3.5 12,3.5" />
      <path d="M5 3.5V2h4v1.5" />
      <rect x="3" y="3.5" width="8" height="8.5" rx="0.8" />
    </svg>
  );
}
function PwrIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6">
      <line x1="7" y1="2" x2="7" y2="8" /><line x1="3" y1="8" x2="11" y2="8" />
      <line x1="4" y1="10" x2="10" y2="10" /><line x1="5" y1="12" x2="9" y2="12" />
    </svg>
  );
}
function AddSymbolIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="1" y="4" width="9" height="6" rx="0.8" />
      <line x1="12" y1="2" x2="12" y2="8" /><line x1="9.5" y1="5" x2="14.5" y2="5" />
    </svg>
  );
}
function UndoIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M2 5a5 5 0 1 1 .5 3" /><polyline points="2,2 2,5.5 5.5,5.5" />
    </svg>
  );
}
function RedoIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 5a5 5 0 1 0-.5 3" /><polyline points="12,2 12,5.5 8.5,5.5" />
    </svg>
  );
}
function FitIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6">
      <polyline points="1,4 1,1 4,1" /><polyline points="10,1 13,1 13,4" />
      <polyline points="1,10 1,13 4,13" /><polyline points="10,13 13,13 13,10" />
    </svg>
  );
}
function ZoomInIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="6" cy="6" r="4" /><line x1="9" y1="9" x2="13" y2="13" />
      <line x1="4" y1="6" x2="8" y2="6" /><line x1="6" y1="4" x2="6" y2="8" />
    </svg>
  );
}
function ZoomOutIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="6" cy="6" r="4" /><line x1="9" y1="9" x2="13" y2="13" />
      <line x1="4" y1="6" x2="8" y2="6" />
    </svg>
  );
}
function DownloadIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M7 2v7m0 0l-3-3m3 3l3-3" /><line x1="2" y1="12" x2="12" y2="12" />
    </svg>
  );
}
function BomIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="1" width="12" height="12" rx="1" />
      <line x1="4" y1="4" x2="10" y2="4" />
      <line x1="4" y1="7" x2="10" y2="7" />
      <line x1="4" y1="10" x2="7" y2="10" />
    </svg>
  );
}
function AlignLIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4">
      <line x1="2" y1="1" x2="2" y2="13" /><rect x="2" y="3" width="7" height="3" />
      <rect x="2" y="8" width="5" height="2" />
    </svg>
  );
}
function AlignRIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4">
      <line x1="12" y1="1" x2="12" y2="13" /><rect x="5" y="3" width="7" height="3" />
      <rect x="7" y="8" width="5" height="2" />
    </svg>
  );
}
function AlignTIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4">
      <line x1="1" y1="2" x2="13" y2="2" /><rect x="3" y="2" width="3" height="7" />
      <rect x="8" y="2" width="2" height="5" />
    </svg>
  );
}
function AlignBIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4">
      <line x1="1" y1="12" x2="13" y2="12" /><rect x="3" y="5" width="3" height="7" />
      <rect x="8" y="7" width="2" height="5" />
    </svg>
  );
}
function AlignCHIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4">
      <line x1="7" y1="1" x2="7" y2="13" strokeDasharray="1.5 1" /><rect x="3" y="4" width="8" height="3" />
      <rect x="4" y="9" width="6" height="2" />
    </svg>
  );
}
function AlignCVIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4">
      <line x1="1" y1="7" x2="13" y2="7" strokeDasharray="1.5 1" /><rect x="4" y="3" width="3" height="8" />
      <rect x="9" y="4" width="2" height="6" />
    </svg>
  );
}
function DistHIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="1" y="3" width="2" height="8" /><rect x="6" y="4" width="2" height="6" />
      <rect x="11" y="3" width="2" height="8" />
    </svg>
  );
}
function DistVIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="3" y="1" width="8" height="2" /><rect x="4" y="6" width="6" height="2" />
      <rect x="3" y="11" width="8" height="2" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Wire element
// ---------------------------------------------------------------------------

function WireEl({
  wire, selected, onClick,
}: {
  wire: EditorWire;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <g>
      <line
        x1={wire.x1} y1={wire.y1} x2={wire.x2} y2={wire.y2}
        stroke="transparent"
        strokeWidth={3}
        style={{ cursor: 'pointer' }}
        onClick={onClick}
      />
      <line
        x1={wire.x1} y1={wire.y1} x2={wire.x2} y2={wire.y2}
        stroke={selected ? COLOR.wireSelected : COLOR.wire}
        strokeWidth={selected ? 0.7 : 0.5}
        strokeLinecap="round"
        pointerEvents="none"
      />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Wire preview
// ---------------------------------------------------------------------------

function WirePreview({ from, to }: { from: Point; to: Point }) {
  const isOrth =
    Math.abs(from.x - to.x) < 0.1 || Math.abs(from.y - to.y) < 0.1;
  const mid: Point = { x: to.x, y: from.y };

  return (
    <g pointerEvents="none" opacity={0.7}>
      {isOrth ? (
        <line
          x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke={COLOR.wirePreview}
          strokeWidth={0.5}
          strokeDasharray="1.5 0.8"
          strokeLinecap="round"
        />
      ) : (
        <>
          <line
            x1={from.x} y1={from.y} x2={mid.x} y2={mid.y}
            stroke={COLOR.wirePreview}
            strokeWidth={0.5}
            strokeDasharray="1.5 0.8"
            strokeLinecap="round"
          />
          <line
            x1={mid.x} y1={mid.y} x2={to.x} y2={to.y}
            stroke={COLOR.wirePreview}
            strokeWidth={0.5}
            strokeDasharray="1.5 0.8"
            strokeLinecap="round"
          />
        </>
      )}
      <circle cx={to.x} cy={to.y} r={0.55} fill={COLOR.wirePreview} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// No-connect marker
// ---------------------------------------------------------------------------

function NoConnectEl({
  nc, selected,
}: {
  nc: EditorNoConnect;
  selected: boolean;
}) {
  const d = 1.4;
  const col = selected ? COLOR.wireSelected : COLOR.noConnect;
  return (
    <g pointerEvents="visibleStroke">
      <line
        x1={nc.x - d} y1={nc.y - d} x2={nc.x + d} y2={nc.y + d}
        stroke={col} strokeWidth={0.55} strokeLinecap="round"
      />
      <line
        x1={nc.x + d} y1={nc.y - d} x2={nc.x - d} y2={nc.y + d}
        stroke={col} strokeWidth={0.55} strokeLinecap="round"
      />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Label element
// ---------------------------------------------------------------------------

function LabelEl({
  label, selected, onClick,
}: {
  label: EditorLabel;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const textLen = Math.max(label.text.length * 1.8 + 3, 8);
  const fh = 1.4;
  const flagPath =
    `M ${fmt(label.x)},${fmt(label.y)} ` +
    `L ${fmt(label.x + 1.4)},${fmt(label.y - fh)} ` +
    `L ${fmt(label.x + textLen)},${fmt(label.y - fh)} ` +
    `L ${fmt(label.x + textLen)},${fmt(label.y + fh)} ` +
    `L ${fmt(label.x + 1.4)},${fmt(label.y + fh)} Z`;

  return (
    <g
      style={{ cursor: 'pointer' }}
      onClick={onClick}
      transform={label.rot ? `rotate(${label.rot} ${label.x} ${label.y})` : undefined}
    >
      <path
        d={flagPath}
        fill={selected ? `${COLOR.wireSelected}33` : `${COLOR.netLabel}15`}
        stroke={selected ? COLOR.wireSelected : COLOR.netLabel}
        strokeWidth={0.3}
      />
      <text
        x={label.x + 2.4}
        y={label.y + 0.9}
        fontSize="2.2"
        fill={selected ? COLOR.wireSelected : COLOR.netLabel}
        pointerEvents="none"
      >
        {label.text}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Text annotation element
// ---------------------------------------------------------------------------

function TextEl({
  text, selected, editing, onClick, onDblClick, onEditCommit, onEditChange,
}: {
  text: EditorText;
  selected: boolean;
  editing: { id: string; text: string } | null;
  onClick: (e: React.MouseEvent) => void;
  onDblClick: (e: React.MouseEvent) => void;
  onEditCommit: (v: string) => void;
  onEditChange: (v: string) => void;
}) {
  const fs = text.fontSize;
  return (
    <g
      style={{ cursor: 'pointer' }}
      onClick={onClick}
      onDoubleClick={onDblClick}
    >
      {selected && (
        <rect
          x={text.x - 1} y={text.y - fs - 0.5}
          width={text.text.length * fs * 0.6 + 2} height={fs + 1.5}
          fill="none" stroke={COLOR.wireSelected} strokeWidth={0.3} strokeDasharray="1 0.5"
          pointerEvents="none"
        />
      )}
      {editing ? (
        <foreignObject x={text.x - 1} y={text.y - fs - 0.5} width={80} height={fs + 2.5}>
          <input
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ref={(el: any) => el?.focus()}
            value={editing.text}
            onChange={(e) => onEditChange(e.target.value)}
            onBlur={() => onEditCommit(editing.text)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onEditCommit(editing.text);
              if (e.key === 'Escape') onEditCommit(editing.text);
            }}
            style={{
              width: '100%',
              fontSize: `${fs}px`,
              background: '#ffffff',
              color: COLOR.text,
              border: `${0.2}px solid ${COLOR.wireSelected}`,
              padding: '0.2px 0.4px',
              outline: 'none',
            }}
          />
        </foreignObject>
      ) : (
        <text
          x={text.x} y={text.y}
          fontSize={fs}
          fontWeight={text.bold ? 'bold' : 'normal'}
          fontStyle={text.italic ? 'italic' : 'normal'}
          fill={selected ? COLOR.wireSelected : COLOR.text}
          pointerEvents="none"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {text.text}
        </text>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Component element
// ---------------------------------------------------------------------------

interface CompEditState {
  id: string;
  value: string;
  designator: string;
}

function ComponentEl({
  comp, selected, editing, onMouseDown, onDblClick, onEditCommit, onEditChange,
}: {
  comp: EditorComponent;
  selected: boolean;
  editing: CompEditState | null;
  onMouseDown: (e: React.MouseEvent) => void;
  onDblClick: (e: React.MouseEvent) => void;
  onEditCommit: (value: string, designator: string) => void;
  onEditChange: (field: 'value' | 'designator', v: string) => void;
}) {
  const draw = drawSymbol(comp.libId, comp.value);
  const isPower = comp.libId.toLowerCase().startsWith('power:');

  const transform =
    `translate(${comp.x} ${comp.y}) rotate(${-comp.rot})` +
    (comp.mirror === 'x' ? ' scale(-1 1)' : comp.mirror === 'y' ? ' scale(1 -1)' : '');

  const hw = draw.halfWidth + 1.5;
  const hh = draw.halfHeight + 1.5;

  const strokeColor = isPower ? COLOR.power : COLOR.component;

  return (
    <g
      onMouseDown={onMouseDown}
      onDoubleClick={onDblClick}
      style={{ cursor: 'move' }}
    >
      {/* Selection box */}
      {selected && (
        <rect
          x={comp.x - hw} y={comp.y - hh}
          width={hw * 2} height={hh * 2}
          fill="none"
          stroke={COLOR.wireSelected}
          strokeWidth={0.4}
          strokeDasharray="1.5 0.75"
          rx={0.8}
          pointerEvents="none"
          transform={comp.rot ? `rotate(${-comp.rot} ${comp.x} ${comp.y})` : undefined}
        />
      )}

      {/* Pin snap circles when selected */}
      {selected &&
        compPinPositions(comp).map((p, i) => (
          <circle
            key={i}
            cx={p.x} cy={p.y}
            r={0.6}
            fill={COLOR.wireSelected}
            pointerEvents="none"
          />
        ))}

      {/* Symbol glyph */}
      {/* eslint-disable-next-line react/no-danger */}
      <g
        transform={transform}
        color={strokeColor}
        dangerouslySetInnerHTML={{ __html: draw.svg }}
      />

      {/* Labels (not for power symbols) */}
      {!isPower && (
        <>
          {/* Designator */}
          {editing ? (
            <foreignObject x={comp.x - 9} y={comp.y - hh - 3.5} width={18} height={4}>
              <input
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ref={(el: any) => el?.focus()}
                value={editing.designator}
                onChange={(e) => onEditChange('designator', e.target.value)}
                onBlur={() => onEditCommit(editing.value, editing.designator)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onEditCommit(editing.value, editing.designator);
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    // Move focus to value (handled by re-render with same editing obj)
                  }
                }}
                style={{
                  width: '100%',
                  fontSize: '2px',
                  background: '#ffffff',
                  color: '#1a1a2e',
                  border: `0.2px solid ${COLOR.wireSelected}`,
                  padding: '0.3px 0.5px',
                  outline: 'none',
                }}
              />
            </foreignObject>
          ) : (
            <text
              x={comp.x} y={comp.y - hh - 1}
              fontSize="2.2"
              fontWeight="600"
              fill={selected ? COLOR.wireSelected : COLOR.component}
              textAnchor="middle"
              pointerEvents="none"
            >
              {comp.designator}
            </text>
          )}

          {/* Value */}
          {editing ? (
            <foreignObject x={comp.x - 9} y={comp.y + hh + 0.5} width={18} height={4}>
              <input
                value={editing.value}
                onChange={(e) => onEditChange('value', e.target.value)}
                onBlur={() => onEditCommit(editing.value, editing.designator)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onEditCommit(editing.value, editing.designator);
                }}
                style={{
                  width: '100%',
                  fontSize: '2px',
                  background: '#ffffff',
                  color: '#1a1a2e',
                  border: `0.2px solid ${COLOR.wireSelected}`,
                  padding: '0.3px 0.5px',
                  outline: 'none',
                }}
              />
            </foreignObject>
          ) : (
            <text
              x={comp.x} y={comp.y + hh + 2.5}
              fontSize="2.0"
              fill={selected ? COLOR.wireSelected : '#555577'}
              textAnchor="middle"
              pointerEvents="none"
            >
              {comp.value}
            </text>
          )}
        </>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Text placement popup (floating over canvas)
// ---------------------------------------------------------------------------

function TextPopup({
  screenPos, value, onChange, onConfirm, onCancel,
}: {
  screenPos: Point;
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      className="absolute z-30 flex items-center gap-1 rounded border border-border bg-background px-2 py-1 shadow-lg"
      style={{ left: screenPos.x, top: screenPos.y }}
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onConfirm();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="Text…"
        className="w-32 border-none bg-transparent font-mono text-xs text-foreground outline-none"
      />
      <button
        type="button"
        onClick={onConfirm}
        className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-primary text-primary-foreground hover:opacity-90"
      >
        OK
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="px-1.5 py-0.5 text-[10px] font-mono rounded hover:bg-muted text-muted-foreground"
      >
        ✕
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function fmt(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(3).replace(/\.?0+$/, '');
}

// Re-export EMPTY_STATE for convenience
export { EMPTY_STATE };
