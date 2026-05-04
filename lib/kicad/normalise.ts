/**
 * KiCad AST → `eencyc-schematic` canonical form.
 *
 * Per PLAN §6.1, the canonical S-exp shape is a much smaller subset of KiCad
 * carrying only what we need for AI summaries, search, and re-render. The
 * trade-off: throwing out KiCad-specific fields (lib_symbols, sheet_instances,
 * effects, stroke widths) cuts storage size and prompt token count by ~70%
 * for typical 5-component circuits.
 *
 * Connectivity strategy (best-effort, V0-safe):
 *   - Resolve each symbol pin's world position from `lib_symbols`
 *   - Build a tiny connectivity graph over wire endpoints, junctions, labels,
 *     and component pins
 *   - Attach labels and power-symbol values to the graph as explicit net names
 *   - For unlabeled nets, derive a stable fallback (`D1_A`, `BT1_NEG`,
 *     `unnamed_1`, etc.) instead of leaving every pin as `unknown`
 *
 * This is intentionally conservative. We do NOT try to be a full ERC engine;
 * we just want the canonical S-expression and AI prompt to retain meaningful
 * node names whenever the file gives us enough geometry to recover them.
 *
 * Two outputs:
 *   - toCanonicalSExp(sch): string for persistence (`schematics.sexp` column)
 *   - toCanonicalJson(sch): typed object for prompt construction
 */

import { transformLocalToWorld, type KiCadSchematic, type Symbol as KiCadSymbol, type Label, type LibPin } from './parse';

// ---------------------------------------------------------------------------
// Public types — the canonical form
// ---------------------------------------------------------------------------

export interface CanonicalComponent {
  designator: string;
  mpn: string | null;
  value: string;
  /** Original KiCad lib_id (e.g. "Device:R_Small"). The renderer keys off this. */
  libId: string;
  pos: { x: number; y: number };
  rot: number;
  mirror: 'none' | 'x' | 'y';
  /**
   * Pin list — number, net (best-effort), local pin coord (in symbol frame),
   * world pin coord (after applying instance transform). World coords are
   * what the renderer uses to attach wires.
   *
   * `local` is from the file's lib_symbols block; if a lib_id wasn't found
   * (unknown symbol), the entry's pins[] is empty.
   */
  pins: {
    number: string;
    name: string;
    net: string;
    local: { x: number; y: number };
    world: { x: number; y: number };
  }[];
}

export interface CanonicalSchematic {
  version: 1;
  units: 'mm';
  components: CanonicalComponent[];
  /** All net names derivable from connectivity + reasonable fallbacks. */
  nets: string[];
  /** Carried through for the renderer; not part of the prompt sent to the LLM. */
  geom: {
    wires: KiCadSchematic['wires'];
    junctions: KiCadSchematic['junctions'];
    labels: Label[];
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function normalise(sch: KiCadSchematic): CanonicalSchematic {
  const components = sch.symbols.map((s) => toComponent(s, sch));
  const netState = inferNetNames(sch, components);

  const netNameSet = new Set<string>();
  const componentsWithNets = components.map((comp, componentIndex) => ({
    ...comp,
    pins: comp.pins.map((pin, pinIndex) => {
      const pointId = netState.pinPointIds[componentIndex]?.[pinIndex];
      const root = pointId === undefined ? null : netState.uf.find(pointId);
      const netName = root === null ? inferStandalonePinNetName(comp, pin) : netState.netNamesByRoot.get(root);
      if (netName) netNameSet.add(netName);
      return {
        ...pin,
        net: netName ?? inferStandalonePinNetName(comp, pin),
      };
    }),
  }));

  const nets = Array.from(netNameSet).sort(compareNetNames);

  return {
    version: 1,
    units: 'mm',
    components: componentsWithNets,
    nets,
    geom: {
      wires: sch.wires,
      junctions: sch.junctions,
      labels: sch.labels,
    },
  };
}

function toComponent(s: KiCadSymbol, sch: KiCadSchematic): CanonicalComponent {
  // Look up the lib_symbols definition for authoritative pin geometry. If
  // it's not present (unknown lib_id, or file omitted lib_symbols), we
  // emit a component with no pins — the renderer falls back to a labeled
  // box and the AI summary uses position-only data.
  const def = sch.libSymbols.get(s.libId);
  const libPins: LibPin[] = def?.pins ?? [];
  // Sort pins by number so renderer can rely on a stable order.
  const sorted = [...libPins].sort((a, b) => {
    const na = Number(a.number);
    const nb = Number(b.number);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.number.localeCompare(b.number);
  });

  const pins = sorted.map((p) => {
    const world = transformLocalToWorld(
      { x: p.x, y: p.y },
      { x: s.x, y: s.y, rot: s.rot, mirror: s.mirror },
    );
    return {
      number: p.number,
      name: p.name,
      net: 'unknown',
      local: { x: p.x, y: p.y },
      world,
    };
  });

  return {
    designator: s.designator,
    mpn: s.mpn,
    value: s.value,
    libId: s.libId,
    pos: { x: s.x, y: s.y },
    rot: s.rot,
    mirror: s.mirror,
    pins,
  };
}

/**
 * Render the canonical schematic to its S-exp form for storage in the
 * `schematics.sexp` column. Round-trippable with `parseSexp` from sexp.ts.
 */
export function toCanonicalSExp(c: CanonicalSchematic): string {
  const parts: string[] = [];
  parts.push(`(eencyc-schematic`);
  parts.push(`  (version ${c.version})`);
  parts.push(`  (units ${c.units})`);
  for (const comp of c.components) {
    const pinForms = comp.pins
      .map((p) => `(pin ${quote(p.number)} (net ${quote(p.net)}))`)
      .join(' ');
    parts.push(
      `  (component ` +
        `(designator ${quote(comp.designator)}) ` +
        `(mpn ${quote(comp.mpn ?? '')}) ` +
        `(value ${quote(comp.value)}) ` +
        `(pos ${num(comp.pos.x)} ${num(comp.pos.y)}) ` +
        `(rot ${num(comp.rot)})` +
        (pinForms ? ` ${pinForms}` : '') +
        `)`,
    );
  }
  for (const n of c.nets) {
    parts.push(`  (net ${quote(n)})`);
  }
  parts.push(`)`);
  return parts.join('\n');
}

/**
 * JSON view used to build the AI summary prompt. Strips the renderer-only
 * geometry fields so the LLM doesn't waste tokens on pixel coordinates.
 */
export function toPromptJson(c: CanonicalSchematic) {
  return {
    version: c.version,
    units: c.units,
    components: c.components,
    nets: c.nets,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface GraphPointBase {
  x: number;
  y: number;
}

interface WirePoint extends GraphPointBase {
  kind: 'wire';
}

interface JunctionPoint extends GraphPointBase {
  kind: 'junction';
}

interface LabelPoint extends GraphPointBase {
  kind: 'label';
  label: Label;
}

interface PinPoint extends GraphPointBase {
  kind: 'pin';
  componentIndex: number;
  pinIndex: number;
}

type GraphPoint = WirePoint | JunctionPoint | LabelPoint | PinPoint;

interface WireSegment {
  a: number;
  b: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface NetInferenceState {
  uf: UnionFind;
  pinPointIds: number[][];
  netNamesByRoot: Map<number, string>;
}

function inferNetNames(
  sch: KiCadSchematic,
  components: CanonicalComponent[],
): NetInferenceState {
  const points: GraphPoint[] = [];
  const pinPointIds: number[][] = components.map(() => []);

  const addPoint = (point: GraphPoint): number => {
    points.push(point);
    return points.length - 1;
  };

  const wireSegments: WireSegment[] = sch.wires.map((wire) => {
    const a = addPoint({ kind: 'wire', x: wire.x1, y: wire.y1 });
    const b = addPoint({ kind: 'wire', x: wire.x2, y: wire.y2 });
    return { a, b, x1: wire.x1, y1: wire.y1, x2: wire.x2, y2: wire.y2 };
  });

  for (const junction of sch.junctions) {
    addPoint({ kind: 'junction', x: junction.x, y: junction.y });
  }
  for (const label of sch.labels) {
    addPoint({ kind: 'label', x: label.x, y: label.y, label });
  }
  components.forEach((component, componentIndex) => {
    component.pins.forEach((pin, pinIndex) => {
      const pointId = addPoint({
        kind: 'pin',
        x: pin.world.x,
        y: pin.world.y,
        componentIndex,
        pinIndex,
      });
      pinPointIds[componentIndex]![pinIndex] = pointId;
    });
  });

  const uf = new UnionFind(points.length);
  for (const segment of wireSegments) {
    uf.union(segment.a, segment.b);
  }

  const byCoord = new Map<string, number[]>();
  points.forEach((point, index) => {
    const key = coordKey(point.x, point.y);
    const bucket = byCoord.get(key);
    if (bucket) bucket.push(index);
    else byCoord.set(key, [index]);
  });
  for (const group of byCoord.values()) {
    const first = group[0];
    if (first === undefined) continue;
    for (const index of group.slice(1)) uf.union(first, index);
  }

  for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
    const point = points[pointIndex]!;
    for (const segment of wireSegments) {
      if (pointLiesOnSegment(point, segment)) {
        uf.union(pointIndex, segment.a);
      }
    }
  }

  const netNamesByRoot = chooseNetNames(components, points, pinPointIds, uf);
  return { uf, pinPointIds, netNamesByRoot };
}

function chooseNetNames(
  components: CanonicalComponent[],
  points: GraphPoint[],
  pinPointIds: number[][],
  uf: UnionFind,
): Map<number, string> {
  const rootsWithPins = new Set<number>();
  const candidatesByRoot = new Map<number, Array<{ priority: number; name: string }>>();

  const addCandidate = (root: number, priority: number, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const bucket = candidatesByRoot.get(root);
    const candidate = { priority, name: trimmed };
    if (bucket) bucket.push(candidate);
    else candidatesByRoot.set(root, [candidate]);
  };

  components.forEach((component, componentIndex) => {
    component.pins.forEach((_pin, pinIndex) => {
      const pointId = pinPointIds[componentIndex]?.[pinIndex];
      if (pointId === undefined) return;
      const root = uf.find(pointId);
      rootsWithPins.add(root);
    });
  });

  for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
    const point = points[pointIndex]!;
    if (point.kind !== 'label') continue;
    const root = uf.find(pointIndex);
    addCandidate(root, point.label.kind === 'global' ? 1 : 2, point.label.text);
  }

  components.forEach((component, componentIndex) => {
    if (!isPowerComponent(component)) return;
    const pointId = pinPointIds[componentIndex]?.[0];
    if (pointId === undefined) return;
    addCandidate(uf.find(pointId), 0, component.value);
  });

  const netNamesByRoot = new Map<number, string>();
  let unnamedCounter = 1;

  for (const root of rootsWithPins) {
    const candidates = candidatesByRoot.get(root) ?? [];
    const explicit = dedupeCandidates(candidates).sort(compareCandidates);
    if (explicit.length > 0) {
      netNamesByRoot.set(root, explicit[0]!.name);
      continue;
    }

    const semantic = inferSemanticNetName(root, components, pinPointIds, uf);
    if (semantic) {
      netNamesByRoot.set(root, semantic);
      continue;
    }

    netNamesByRoot.set(root, `unnamed_${unnamedCounter}`);
    unnamedCounter += 1;
  }

  return netNamesByRoot;
}

function inferSemanticNetName(
  root: number,
  components: CanonicalComponent[],
  pinPointIds: number[][],
  uf: UnionFind,
): string | null {
  const candidates: Array<{ score: number; name: string }> = [];

  components.forEach((component, componentIndex) => {
    component.pins.forEach((pin, pinIndex) => {
      const pointId = pinPointIds[componentIndex]?.[pinIndex];
      if (pointId === undefined || uf.find(pointId) !== root) return;
      const alias = semanticAlias(pin.name);
      if (!alias) return;
      candidates.push({
        score: semanticScore(alias),
        name: `${sanitizeDesignator(component.designator)}_${alias}`,
      });
    });
  });

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });
  return candidates[0]!.name;
}

function inferStandalonePinNetName(
  component: CanonicalComponent,
  pin: CanonicalComponent['pins'][number],
): string {
  const alias = semanticAlias(pin.name);
  return alias ? `${sanitizeDesignator(component.designator)}_${alias}` : 'unknown';
}

function dedupeCandidates(
  candidates: Array<{ priority: number; name: string }>,
): Array<{ priority: number; name: string }> {
  const seen = new Set<string>();
  const deduped: Array<{ priority: number; name: string }> = [];
  for (const candidate of candidates) {
    const key = `${candidate.priority}:${candidate.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

function compareCandidates(
  a: { priority: number; name: string },
  b: { priority: number; name: string },
): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.name.localeCompare(b.name);
}

function compareNetNames(a: string, b: string): number {
  const aUnnamed = unnamedNetOrdinal(a);
  const bUnnamed = unnamedNetOrdinal(b);
  if (aUnnamed !== null || bUnnamed !== null) {
    if (aUnnamed === null) return -1;
    if (bUnnamed === null) return 1;
    return aUnnamed - bUnnamed;
  }
  return a.localeCompare(b);
}

function unnamedNetOrdinal(name: string): number | null {
  const match = /^unnamed_(\d+)$/.exec(name);
  return match ? Number(match[1]) : null;
}

function coordKey(x: number, y: number): string {
  return `${x.toFixed(3)},${y.toFixed(3)}`;
}

function pointLiesOnSegment(point: GraphPointBase, segment: WireSegment): boolean {
  const eps = 1e-3;
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const len = Math.hypot(dx, dy);
  if (len <= eps) {
    return Math.hypot(point.x - segment.x1, point.y - segment.y1) <= eps;
  }
  const cross = (point.x - segment.x1) * dy - (point.y - segment.y1) * dx;
  if (Math.abs(cross) / len > eps) return false;

  const minX = Math.min(segment.x1, segment.x2) - eps;
  const maxX = Math.max(segment.x1, segment.x2) + eps;
  const minY = Math.min(segment.y1, segment.y2) - eps;
  const maxY = Math.max(segment.y1, segment.y2) + eps;
  return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
}

function semanticAlias(pinName: string): string | null {
  const raw = pinName.trim().toUpperCase();
  if (!raw || raw === '~') return null;

  switch (raw) {
    case '+':
      return 'POS';
    case '-':
      return 'NEG';
    case 'V+':
      return 'VPOS';
    case 'V-':
      return 'VNEG';
    case 'A':
      return 'ANODE';
    case 'K':
      return 'CATHODE';
    case 'G':
      return 'GATE';
    case 'D':
      return 'DRAIN';
    case 'S':
      return 'SOURCE';
    case 'B':
      return 'BASE';
    case 'C':
      return 'COLLECTOR';
    case 'E':
      return 'EMITTER';
    case 'IN':
    case 'OUT':
    case 'VIN':
    case 'VOUT':
    case 'VBUS':
    case 'VBAT':
    case 'VCC':
    case 'VDD':
    case 'GND':
      return raw;
    default:
      return /^[A-Z][A-Z0-9_+-]{1,15}$/.test(raw) ? raw.replace(/[^A-Z0-9]+/g, '_') : null;
  }
}

function semanticScore(alias: string): number {
  switch (alias) {
    case 'POS':
    case 'NEG':
    case 'VPOS':
    case 'VNEG':
    case 'VIN':
    case 'VOUT':
    case 'VBUS':
    case 'VBAT':
    case 'VCC':
    case 'VDD':
    case 'GND':
      return 100;
    case 'OUT':
    case 'IN':
    case 'ANODE':
    case 'CATHODE':
    case 'GATE':
    case 'DRAIN':
    case 'SOURCE':
    case 'BASE':
    case 'COLLECTOR':
    case 'EMITTER':
      return 80;
    default:
      return 40;
  }
}

function sanitizeDesignator(designator: string): string {
  return designator
    .trim()
    .replace(/^#+/, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function isPowerComponent(component: CanonicalComponent): boolean {
  return component.libId.toLowerCase().startsWith('power:');
}

class UnionFind {
  private readonly parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }

  find(x: number): number {
    const parent = this.parent[x]!;
    if (parent === x) return x;
    const root = this.find(parent);
    this.parent[x] = root;
    return root;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

function quote(v: string): string {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function num(v: number): string {
  // KiCad stores coords with high precision; keep up to 6 decimals, no exp.
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

// ---------------------------------------------------------------------------
// Round-trip: parse canonical S-exp back to CanonicalSchematic
// ---------------------------------------------------------------------------

/**
 * Re-parse the canonical eencyc S-exp stored in `schematics.sexp` back into
 * a `CanonicalSchematic`. This is the inverse of `toCanonicalSExp`.
 *
 * The canonical format carries components + nets but NOT geometry (wires,
 * junctions, labels) — those are renderer-only and not persisted. The returned
 * `geom` fields are empty arrays.
 *
 * Pin `local` and `world` coordinates are set to zero — they are not stored
 * in the canonical S-exp. Callers that need geometry must use the renderer
 * pipeline instead.
 */
export function parseCanonicalSExp(src: string): CanonicalSchematic {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { parse } = require('./sexp') as typeof import('./sexp');
  const ast = parse(src);

  if (ast.type !== 'list') throw new Error('Expected a list at root');

  const items = ast.items;
  const components: CanonicalComponent[] = [];
  const nets: string[] = [];

  for (const item of items) {
    if (item.type !== 'list') continue;
    const tag = item.items[0];
    if (!tag || tag.type !== 'atom') continue;

    if (tag.value === 'component') {
      components.push(parseComponentItem(item.items.slice(1)));
    } else if (tag.value === 'net') {
      const v = item.items[1];
      if (v && v.type === 'atom') nets.push(v.value);
    }
  }

  return {
    version: 1,
    units: 'mm',
    components,
    nets,
    geom: { wires: [], junctions: [], labels: [] },
  };
}

type SExpList = import('./sexp').List;
type SExpItem = import('./sexp').SExp;

function parseComponentItem(attrs: SExpItem[]): CanonicalComponent {
  let designator = '';
  let mpn: string | null = null;
  let value = '';
  let libId = '';
  let posX = 0, posY = 0, rot = 0;
  const pins: CanonicalComponent['pins'] = [];

  for (const attr of attrs) {
    if (attr.type !== 'list') continue;
    const tag = attr.items[0];
    if (!tag || tag.type !== 'atom') continue;

    const get = (i: number): string => {
      const n = attr.items[i];
      return n && n.type === 'atom' ? n.value : '';
    };

    switch (tag.value) {
      case 'designator': designator = get(1); break;
      case 'lib_id':     libId = get(1); break;
      case 'mpn':        mpn = get(1) || null; break;
      case 'value':      value = get(1); break;
      case 'pos':
        posX = parseFloat(get(1)) || 0;
        posY = parseFloat(get(2)) || 0;
        break;
      case 'rot':        rot = parseFloat(get(1)) || 0; break;
      case 'pin': {
        const pinNum = get(1);
        let net = 'unknown';
        for (const sub of (attr as SExpList).items.slice(2)) {
          if (sub.type === 'list') {
            const st = sub.items[0];
            if (st && st.type === 'atom' && st.value === 'net') {
              const nv = sub.items[1];
              if (nv && nv.type === 'atom') net = nv.value;
            }
          }
        }
        pins.push({ number: pinNum, name: pinNum, net, local: { x: 0, y: 0 }, world: { x: 0, y: 0 } });
        break;
      }
    }
  }

  // If lib_id wasn't stored (older format), try to derive it from designator prefix
  if (!libId) libId = guessLibIdFromDesignator(designator);

  return {
    designator, mpn, value, libId,
    pos: { x: posX, y: posY },
    rot, mirror: 'none', pins,
  };
}

function guessLibIdFromDesignator(des: string): string {
  const prefix = des.replace(/\d+$/, '').toUpperCase();
  const map: Record<string, string> = {
    R: 'Device:R', C: 'Device:C', L: 'Device:L',
    D: 'Device:D', Q: 'Device:Q_NPN', U: 'Device:U',
    J: 'Connector:Conn_01x01', SW: 'Device:SW_Push',
    F: 'Device:Fuse', Y: 'Device:Crystal',
  };
  return map[prefix] ?? 'Device:Unknown';
}
