/**
 * KiCad-specific extractor: parsed S-exp tree → typed `KiCadSchematic` shape.
 *
 * What we pull out of the .kicad_sch file (V0 scope):
 *   - root meta: version, generator
 *   - symbol instances: designator, value, optional mpn, (at x y rot), uuid
 *   - wires: list of (x1,y1)→(x2,y2) segments
 *   - junctions: (x,y)
 *   - labels (local + global): text + (x,y,rot)
 *
 * What we *deliberately* ignore for V0:
 *   - lib_symbols geometry (boxes, pins, polylines) — symbols render as
 *     generic boxes, not as proper KiCad shapes. PLAN §6 acknowledges this.
 *   - text annotations, no_connects, hierarchical_label sheets, paper size,
 *     title block, sheet instances. These don't affect circuit topology.
 *   - properties beyond Reference/Value/MPN (e.g. Footprint, Datasheet) —
 *     surfaced later if needed for AI summary, but not for V0 render.
 *
 * Versions: tested against the KiCad 7 (`20230121`) and KiCad 8 (`20231120`)
 * file format ranges. We accept anything in that window; older/newer get a
 * typed warning so the user knows a re-export might fix it.
 *
 * Refs:
 *   https://gitlab.com/kicad/code/kicad/-/blob/master/eeschema/sch_io/kicad_sexpr/
 *   Hard-truth note: KiCad has never published a formal grammar — the source
 *   is the spec. Numbers below come from the `SCH_IO_KICAD_SEXPR::*` writer.
 */

import {
  arg,
  argNum,
  children,
  findAll,
  firstChild,
  head,
  isAtom,
  isList,
  parse as parseSexp,
  type SExp,
} from './sexp';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface KiCadMeta {
  version: number;
  generator: string;
}

export interface Symbol {
  uuid: string | null;
  libId: string;
  designator: string; // R1, U1, …
  value: string; // 10k, LM358, …
  mpn: string | null; // optional custom property "MPN"
  x: number;
  y: number;
  rot: number; // degrees, 0|90|180|270
  mirror: 'none' | 'x' | 'y'; // KiCad's mirror flag (`(mirror x|y)`)
}

export interface Wire {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Junction {
  x: number;
  y: number;
}

export interface Label {
  kind: 'local' | 'global';
  text: string;
  x: number;
  y: number;
  rot: number;
}

/**
 * Pin geometry as defined inside a `(lib_symbols (symbol "Device:R" …))`
 * block. Coordinates are in the lib_symbol's *own* local frame (mm), and
 * the `(at x y rot)` is the pin's electrical *connection point* — wires
 * attach here. The `length` extends inward toward the symbol body.
 *
 * For most KiCad symbols the pins live inside a nested unit symbol named
 * `"<libname>_1_1"` (or `_0_1`, `_2_1` for multi-unit parts). We collect
 * pins from any nested unit since for V0 we don't care about unit boundaries.
 */
export interface LibPin {
  number: string; // KiCad's `(number "1")` — what wires connect by
  name: string; // e.g. "K", "A", "G", "D", "S", "~"
  x: number; // local coord
  y: number; // local coord
  rot: number; // 0|90|180|270 — direction the pin extends from connection point
  length: number; // in mm; rarely needed but kept for completeness
}

export interface LibSymbolDef {
  libId: string; // "Device:R", "Device:LED", etc.
  pins: LibPin[];
}

export interface KiCadSchematic {
  meta: KiCadMeta;
  /**
   * Map from lib_id → pin geometry. Populated from the embedded
   * `(lib_symbols …)` block. Used by the renderer to compute *world*
   * pin positions per instance.
   */
  libSymbols: Map<string, LibSymbolDef>;
  symbols: Symbol[];
  wires: Wire[];
  junctions: Junction[];
  labels: Label[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class KiCadParseError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[kicad:${code}] ${message}`);
    this.name = 'KiCadParseError';
    this.code = code;
  }
}

// V0 hard cap. Originally 5 (PLAN §2); raised to 50 once the renderer's
// auto-scale + lib_symbols pin alignment proved out on real KiCad uploads.
// At 50 a single circuit covers most useful sub-systems (full op-amp stage,
// LDO with decoupling + reverse-protection, MCU minimum boot, level shifters).
// schematics.component_count column has its own check (between 0 and 5);
// migration 0006 lifts that to (between 0 and 50).
export const MAX_COMPONENTS_V0 = 50;

// Tested KiCad eeschema file format range. Outside this we *warn* (still parse)
// because the format is largely additive across minor versions. Bumped to
// 20260101 to accept KiCad 9.0 files (`generator_version "9.0"`, version
// `20250114`) seen in the wild — the additions in 9 (`embedded_fonts`,
// `exclude_from_sim`, `dnp`) are all ignorable for our render path.
const SUPPORTED_VERSION_MIN = 20221218; // KiCad 7 RC
const SUPPORTED_VERSION_MAX = 20260101; // KiCad 9.x generous upper bound

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a `.kicad_sch` file's source into our typed shape.
 *
 * Throws `KiCadParseError` on:
 *   - non-kicad_sch root
 *   - missing required meta
 *   - missing Reference or Value on any symbol
 *   - more than `MAX_COMPONENTS_V0` symbols
 *
 * Non-fatal issues (e.g. unsupported version, unrecognised mirror) get pushed
 * onto `warnings` so the UI can surface them without aborting.
 */
export function parseKiCadSchematic(src: string): KiCadSchematic {
  const ast = parseSexp(src);
  if (!isList(ast) || head(ast) !== 'kicad_sch') {
    throw new KiCadParseError(
      'WRONG_ROOT',
      'Top-level form must be (kicad_sch …). Did you upload a different file type?',
    );
  }
  const warnings: string[] = [];

  // Meta
  const versionForm = firstChild(ast, 'version');
  const generatorForm = firstChild(ast, 'generator');
  if (!versionForm) {
    throw new KiCadParseError('NO_VERSION', 'Missing (version …) form.');
  }
  const version = argNum(versionForm, 0);
  if (version === undefined) {
    throw new KiCadParseError('BAD_VERSION', 'Invalid (version …) value.');
  }
  if (version < SUPPORTED_VERSION_MIN || version > SUPPORTED_VERSION_MAX) {
    warnings.push(
      `KiCad file version ${version} is outside the tested range ` +
        `[${SUPPORTED_VERSION_MIN}..${SUPPORTED_VERSION_MAX}]. Render may be partial.`,
    );
  }
  const generator = generatorForm ? (arg(generatorForm, 0) ?? 'unknown') : 'unknown';

  // ----- lib_symbols: pin geometry per used symbol type ------------------
  // Structure (KiCad 7/8/9):
  //   (lib_symbols
  //     (symbol "Device:LED"
  //       (symbol "LED_1_1"                  ; nested unit symbol (1_1, 0_1, …)
  //         (pin passive line
  //           (at -3.81 0 0)
  //           (length 2.54)
  //           (name "K" ...)
  //           (number "1" ...))
  //         (pin passive line
  //           (at 3.81 0 180)
  //           (length 2.54)
  //           (name "A" ...)
  //           (number "2" ...)))
  //     ...))
  //
  // We collect pins from ALL nested unit symbols and key them by the OUTER
  // lib_id string. Multi-unit parts (e.g. dual op-amps with units 1, 2,
  // and 3 sharing pwr) get their pins merged — fine for V0's render purposes.
  const libSymbols = new Map<string, LibSymbolDef>();
  const libSymbolsForm = firstChild(ast, 'lib_symbols');
  if (libSymbolsForm) {
    for (const sym of children(libSymbolsForm, 'symbol')) {
      const libIdRaw = arg(sym, 0);
      if (!libIdRaw) continue;
      const pins: LibPin[] = [];
      // Outer symbol may have direct (pin …) entries (rare) and nested
      // (symbol "<unit>_n_m" …) blocks. Walk nested-symbol pins via findAll
      // so we capture all units regardless of nesting depth.
      for (const pin of findAll(sym, 'pin')) {
        const at = firstChild(pin, 'at');
        const numForm = firstChild(pin, 'number');
        const nameForm = firstChild(pin, 'name');
        const lenForm = firstChild(pin, 'length');
        if (!at) continue;
        const x = argNum(at, 0);
        const y = argNum(at, 1);
        const rot = argNum(at, 2) ?? 0;
        if (x === undefined || y === undefined) continue;
        const number = numForm ? (arg(numForm, 0) ?? '') : '';
        if (!number) continue; // pin without a number is unusable for connectivity
        pins.push({
          number,
          name: nameForm ? (arg(nameForm, 0) ?? '') : '',
          x,
          y,
          rot,
          length: lenForm ? (argNum(lenForm, 0) ?? 0) : 0,
        });
      }
      // De-dup by pin number (multi-unit parts repeat pins per unit).
      const uniq = new Map<string, LibPin>();
      for (const p of pins) if (!uniq.has(p.number)) uniq.set(p.number, p);
      libSymbols.set(libIdRaw, { libId: libIdRaw, pins: Array.from(uniq.values()) });
    }
  }

  // Symbol instances. KiCad nests each instance directly under root as
  //   (symbol (lib_id "...") (at x y rot) (uuid "...") (mirror x|y)?
  //          (property "Reference" "R1" ...) (property "Value" "10k" ...) ...)
  const symbolForms = children(ast, 'symbol').filter((s) => firstChild(s, 'lib_id'));
  if (symbolForms.length > MAX_COMPONENTS_V0) {
    throw new KiCadParseError(
      'TOO_MANY_COMPONENTS',
      `V0 supports at most ${MAX_COMPONENTS_V0} components per circuit; this file has ${symbolForms.length}.`,
    );
  }

  const symbols: Symbol[] = [];
  for (const s of symbolForms) {
    const libIdForm = firstChild(s, 'lib_id');
    const atForm = firstChild(s, 'at');
    if (!libIdForm || !atForm) {
      warnings.push('A symbol is missing lib_id or at; skipped.');
      continue;
    }
    const libId = arg(libIdForm, 0) ?? '';
    const x = argNum(atForm, 0);
    const y = argNum(atForm, 1);
    const rot = argNum(atForm, 2) ?? 0;
    if (x === undefined || y === undefined) {
      warnings.push(`Symbol ${libId} has invalid (at …); skipped.`);
      continue;
    }

    // Properties — by name. KiCad 7 stores them as
    //   (property "Reference" "R1" (at 0 0 0) (effects ...))
    let designator = '';
    let value = '';
    let mpn: string | null = null;
    for (const p of children(s, 'property')) {
      const name = arg(p, 0);
      const v = arg(p, 1) ?? '';
      if (name === 'Reference') designator = v;
      else if (name === 'Value') value = v;
      else if (name === 'MPN' || name === 'mpn') mpn = v;
    }
    if (!designator) {
      throw new KiCadParseError(
        'MISSING_REFERENCE',
        `Symbol ${libId} is missing its Reference property (the designator like R1, U1).`,
      );
    }
    if (!value) {
      throw new KiCadParseError(
        'MISSING_VALUE',
        `Symbol ${libId} (${designator}) is missing its Value property.`,
      );
    }

    // Mirror flag — `(mirror x)` or `(mirror y)`, or absent.
    let mirror: Symbol['mirror'] = 'none';
    const mirrorForm = firstChild(s, 'mirror');
    if (mirrorForm) {
      const m = arg(mirrorForm, 0);
      if (m === 'x' || m === 'y') mirror = m;
      else warnings.push(`Symbol ${designator}: unknown mirror "${m}".`);
    }

    // UUID
    const uuidForm = firstChild(s, 'uuid');
    const uuid = uuidForm ? (arg(uuidForm, 0) ?? null) : null;

    symbols.push({ uuid, libId, designator, value, mpn, x, y, rot, mirror });
  }

  // Wires.
  // Shape:  (wire (pts (xy x y) (xy x y)) (stroke ...) (uuid "..."))
  const wires: Wire[] = [];
  for (const w of children(ast, 'wire')) {
    const pts = firstChild(w, 'pts');
    if (!pts) continue;
    const xyForms = children(pts, 'xy');
    if (xyForms.length < 2) continue;
    const a = xyForms[0]!;
    const b = xyForms[1]!;
    const x1 = argNum(a, 0);
    const y1 = argNum(a, 1);
    const x2 = argNum(b, 0);
    const y2 = argNum(b, 1);
    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) continue;
    wires.push({ x1, y1, x2, y2 });
  }

  // Junctions.
  const junctions: Junction[] = [];
  for (const j of children(ast, 'junction')) {
    const at = firstChild(j, 'at');
    if (!at) continue;
    const x = argNum(at, 0);
    const y = argNum(at, 1);
    if (x !== undefined && y !== undefined) junctions.push({ x, y });
  }

  // Labels (local + global).
  const labels: Label[] = [];
  for (const kind of ['label', 'global_label'] as const) {
    for (const l of children(ast, kind)) {
      const text = arg(l, 0) ?? '';
      const at = firstChild(l, 'at');
      if (!at || !text) continue;
      const x = argNum(at, 0);
      const y = argNum(at, 1);
      const rot = argNum(at, 2) ?? 0;
      if (x !== undefined && y !== undefined) {
        labels.push({ kind: kind === 'label' ? 'local' : 'global', text, x, y, rot });
      }
    }
  }

  return {
    meta: { version, generator },
    libSymbols,
    symbols,
    wires,
    junctions,
    labels,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// World-coordinate pin computation
// ---------------------------------------------------------------------------

/**
 * Apply a KiCad 2D transform (rotate then translate) to a local point.
 *
 * KiCad's rotation is counter-clockwise in degrees, applied in the schematic
 * frame where +Y points DOWN (it's the EDA convention — same as SVG).
 * Standard 2D rotation in a +Y-down frame for CCW angle θ:
 *   x' =  x cos θ + y sin θ
 *   y' = -x sin θ + y cos θ
 * (Note the sign flips relative to math-textbook +Y-up convention.)
 *
 * In practice all KiCad rotations are 0/90/180/270 so we hard-code those
 * cases to avoid floating-point dust.
 */
export function transformLocalToWorld(
  local: { x: number; y: number },
  inst: { x: number; y: number; rot: number; mirror?: 'none' | 'x' | 'y' },
): { x: number; y: number } {
  let { x, y } = local;
  // Mirror first (KiCad applies mirror in the local frame before rotating).
  if (inst.mirror === 'x') y = -y;
  else if (inst.mirror === 'y') x = -x;
  // Rotation
  const r = ((inst.rot % 360) + 360) % 360;
  let rx: number;
  let ry: number;
  if (r === 0) {
    rx = x;
    ry = y;
  } else if (r === 90) {
    rx = y;
    ry = -x;
  } else if (r === 180) {
    rx = -x;
    ry = -y;
  } else if (r === 270) {
    rx = -y;
    ry = x;
  } else {
    // Off-grid rotation — fall back to general formula.
    const t = (r * Math.PI) / 180;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    rx = x * cos + y * sin;
    ry = -x * sin + y * cos;
  }
  return { x: rx + inst.x, y: ry + inst.y };
}

// ---------------------------------------------------------------------------
// Diagnostic — used by tests and the upload server action for fast
// pre-checks without a full parse round-trip.
// ---------------------------------------------------------------------------

/**
 * Quick "does this look like a kicad_sch file at all" heuristic. Cheap
 * substring check before we run the full parser. The full parser is also
 * authoritative; this just lets us fail fast on obvious wrong-file uploads.
 */
export function looksLikeKiCadSchematic(src: string): boolean {
  if (typeof src !== 'string' || src.length < 16) return false;
  // Both KiCad 7 and 8 always start with `(kicad_sch (version <num>)`.
  return /^\s*\(kicad_sch\b/.test(src);
}

/**
 * Helper used by tests to assert tree-shaped equality of small substructures
 * without leaking the full SExp internal representation.
 */
export function _flatten(node: SExp): unknown {
  if (isAtom(node)) return node.value;
  return [head(node), ...node.items.slice(1).map((c) => _flatten(c))];
}
