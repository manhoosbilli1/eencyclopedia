/**
 * Serialise an EditorState back to a KiCad 8 .kicad_sch string.
 * The output is accepted by looksLikeKiCadSchematic() in parse.ts and
 * will round-trip cleanly through the full parse → normalise → render pipeline.
 *
 * V2 changes vs V1:
 *  - lib_symbol stubs include per-pin positions derived from drawSymbol() so
 *    that parse.ts can extract proper world-coordinate pin positions and the
 *    normalise step reconnects wires correctly.
 *  - Pin stubs inside each symbol instance reference the same pin numbers as
 *    the lib_symbol stubs (1-indexed or glyph pin numbers).
 */

import type { EditorState, EditorComponent } from '@/components/schematic/editorTypes';
import { drawSymbol } from '@/lib/kicad/symbols';

export function fromEditorState(state: EditorState): string {
  const parts: string[] = [];
  parts.push(`(kicad_sch (version 20231120) (generator eencyclopedia-editor)`);
  parts.push(``);

  // lib_symbols — one stub per unique libId, with accurate pin positions
  const libIds = [...new Set(state.components.map((c) => c.libId))];
  if (libIds.length > 0) {
    parts.push(`  (lib_symbols`);
    for (const lid of libIds) {
      parts.push(libSymbolStub(lid));
    }
    parts.push(`  )`);
    parts.push(``);
  }

  // wires
  for (const w of state.wires) {
    parts.push(`  (wire (pts (xy ${n(w.x1)} ${n(w.y1)}) (xy ${n(w.x2)} ${n(w.y2)})) (stroke (width 0) (type default)))`);
  }

  // junctions
  for (const j of state.junctions) {
    parts.push(`  (junction (at ${n(j.x)} ${n(j.y)}) (diameter 0) (color 0 0 0 0))`);
  }

  // no_connect markers
  for (const nc of state.noConnects) {
    parts.push(`  (no_connect (at ${n(nc.x)} ${n(nc.y)}) (uuid "${randomUuid()}"))`);
  }

  // labels / global_labels
  for (const l of state.labels) {
    const tag = l.kind === 'global' ? 'global_label' : 'label';
    parts.push(`  (${tag} "${esc(l.text)}" (at ${n(l.x)} ${n(l.y)} ${l.rot}) (effects (font (size 1.27 1.27))))`);
  }

  // text annotations
  for (const t of state.texts) {
    const bold = t.bold ? ' bold' : '';
    const italic = t.italic ? ' italic' : '';
    parts.push(
      `  (text "${esc(t.text)}" (at ${n(t.x)} ${n(t.y)} 0) ` +
      `(effects (font (size ${n(t.fontSize)} ${n(t.fontSize)})${bold}${italic})))`,
    );
  }

  // symbols
  for (const comp of state.components) {
    parts.push(symbolBlock(comp));
  }

  parts.push(`)`);
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// lib_symbol stub — per-pin positions come from drawSymbol()
// ---------------------------------------------------------------------------

/**
 * Build a minimal `(symbol "<libId>" …)` block that encodes the real pin
 * positions so parse.ts → normalise can compute accurate world coordinates.
 *
 * KiCad format:
 *   (symbol "Device:R"
 *     (symbol "Device:R_1_1"
 *       (pin passive line (at 0 5.08 270) (length 2.54)
 *            (name "~" (effects ...)) (number "1" (effects ...)))))
 *
 * We use a nested `_1_1` unit symbol so the parse.ts `findAll(sym, 'pin')`
 * walk that descends into nested symbols will find them.
 *
 * Pin angle convention (KiCad): the `(at x y rot)` in a pin definition is
 * the wire-attach point in the lib-symbol's local frame, and the rotation is
 * the angle the pin *line* makes (pointing away from the body toward the wire).
 * For a 2-pin vertical passive the top pin is at (0, +5.08, 270) — i.e. the
 * wire extends upward (270° in KiCad's CCW convention in the +Y-down frame).
 *
 * Since we only need the *positions* for our renderer (the angle is ignored
 * by normalise.ts when computing world coords), we hard-code angle 0 for all
 * pins — this is safe for our pipeline.
 */
function libSymbolStub(libId: string): string {
  const draw = drawSymbol(libId, '');
  const safe = esc(libId);
  // KiCad uses a "unit" sub-symbol for the actual geometry. The inner name
  // must NOT include the library prefix (e.g. "Device:") — KiCad 10 rejects
  // names like "Device:R_1_1" with "Invalid symbol unit name prefix".
  // Correct form: "R_1_1" (just the component part, then _unit_deco).
  const compName = libId.includes(':') ? libId.split(':')[1] : libId;
  const unitName = esc(`${compName}_1_1`);

  const pinLines = draw.pins.map((p) =>
    `        (pin passive line (at ${n(p.dx)} ${n(p.dy)} 0) (length 2.54)` +
    ` (name "~" (effects (font (size 1.27 1.27))))` +
    ` (number "${esc(p.number)}" (effects (font (size 1.27 1.27)))))`,
  );

  return [
    `    (symbol "${safe}"`,
    `      (symbol "${unitName}"`,
    ...pinLines,
    `      )`,
    `    )`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Symbol instance block
// ---------------------------------------------------------------------------

function symbolBlock(comp: EditorComponent): string {
  const mirrorAttr = comp.mirror === 'x' ? ' (mirror x)' : comp.mirror === 'y' ? ' (mirror y)' : '';
  const uuid = randomUuid();
  const pRef = refPropPos(comp);
  const pVal = valPropPos(comp);

  const draw = drawSymbol(comp.libId, comp.value);

  // Pin stubs reference the pin numbers from the glyph definition so they
  // align with the lib_symbol stub entries built by libSymbolStub().
  const pinStubs = draw.pins.map((p) =>
    `    (pin "${esc(p.number)}" "~" (uuid "${randomUuid()}"))`,
  ).join('\n');

  return [
    `  (symbol (lib_id "${esc(comp.libId)}") (at ${n(comp.x)} ${n(comp.y)} ${comp.rot})${mirrorAttr} (unit 1)`,
    `    (in_bom yes) (on_board yes)`,
    `    (property "Reference" "${esc(comp.designator)}" (at ${n(pRef.x)} ${n(pRef.y)} 0)`,
    `      (effects (font (size 1.27 1.27))))`,
    `    (property "Value" "${esc(comp.value)}" (at ${n(pVal.x)} ${n(pVal.y)} 0)`,
    `      (effects (font (size 1.27 1.27))))`,
    ...(comp.mpn ? [
      `    (property "MPN" "${esc(comp.mpn)}" (at ${n(pRef.x)} ${n(pRef.y + 3)} 0)`,
      `      (effects (font (size 1.27 1.27))))`,
    ] : []),
    ...(comp.footprint ? [
      `    (property "Footprint" "${esc(comp.footprint)}" (at ${n(pRef.x)} ${n(pRef.y + 6)} 0)`,
      `      (effects (font (size 1.27 1.27))))`,
    ] : []),
    pinStubs,
    `    (instances (project "eencyc" (path "/${uuid}" (reference "${esc(comp.designator)}") (unit 1))))`,
    `  )`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Property label offsets
// ---------------------------------------------------------------------------

function refPropPos(c: EditorComponent) { return { x: c.x - 4, y: c.y - 4 }; }
function valPropPos(c: EditorComponent) { return { x: c.x + 2, y: c.y + 4 }; }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function n(v: number) {
  return Number.isInteger(v) ? String(v) : v.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function esc(v: string) {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function randomUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
