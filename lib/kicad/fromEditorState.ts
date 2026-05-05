/**
 * Serialise an EditorState back to a KiCad 10–compatible .kicad_sch string.
 *
 * Output targets KiCad 9/10 (eeschema file format 20250114). Verified to:
 *   - pass looksLikeKiCadSchematic() in lib/kicad/parse.ts
 *   - round-trip through parseKiCadSchematic → normalise → renderSvg
 *   - open in KiCad 10 without errors (sheet_instances + embedded_fonts present,
 *     UUIDs on every wire/junction/label/no_connect/text, full lib_symbol
 *     metadata + body geometry, instance pin stubs in `(pin "<n>" (uuid …))`
 *     short form, shared root UUID in instance paths so KiCad keeps designators)
 */

import type { EditorState, EditorComponent } from '@/components/schematic/editorTypes';
import { drawSymbol, type PinAnchor } from '@/lib/kicad/symbols';

export function fromEditorState(state: EditorState): string {
  const rootUuid = randomUuid();
  const lines: string[] = [];

  // Header — KiCad 10 multi-line root form
  lines.push('(kicad_sch');
  lines.push('\t(version 20250114)');
  lines.push('\t(generator "eeschema")');
  lines.push('\t(generator_version "9.0")');
  lines.push(`\t(uuid "${rootUuid}")`);
  lines.push('\t(paper "A4")');

  // lib_symbols — one full stub per unique libId
  const libIds = [...new Set(state.components.map((c) => c.libId))];
  if (libIds.length > 0) {
    lines.push('\t(lib_symbols');
    for (const lid of libIds) {
      lines.push(libSymbolStub(lid));
    }
    lines.push('\t)');
  }

  // wires
  for (const w of state.wires) {
    lines.push(wireBlock(w.x1, w.y1, w.x2, w.y2));
  }

  // junctions
  for (const j of state.junctions) {
    lines.push(junctionBlock(j.x, j.y));
  }

  // no_connect markers
  for (const nc of state.noConnects) {
    lines.push(noConnectBlock(nc.x, nc.y));
  }

  // labels / global_labels
  for (const l of state.labels) {
    const tag = l.kind === 'global' ? 'global_label' : 'label';
    lines.push(labelBlock(tag, l.text, l.x, l.y, l.rot));
  }

  // text annotations
  for (const t of state.texts) {
    lines.push(textBlock(t.text, t.x, t.y, t.fontSize, t.bold, t.italic));
  }

  // symbol instances
  for (const comp of state.components) {
    lines.push(symbolBlock(comp, rootUuid));
  }

  // sheet_instances + embedded_fonts (mandatory in KiCad 10)
  lines.push('\t(sheet_instances');
  lines.push('\t\t(path "/"');
  lines.push('\t\t\t(page "1")');
  lines.push('\t\t)');
  lines.push('\t)');
  lines.push('\t(embedded_fonts no)');
  lines.push(')');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// lib_symbol stub — KiCad 10 expects full metadata + body geometry + pins
// ---------------------------------------------------------------------------

function libSymbolStub(libId: string): string {
  const draw = drawSymbol(libId, '');
  const safeLibId = esc(libId);
  // Inner unit name MUST NOT include the library prefix.
  const compName = libId.includes(':') ? libId.split(':')[1]! : libId;
  const unitNameBody = esc(`${compName}_0_1`);     // graphic body unit
  const unitNamePins = esc(`${compName}_1_1`);     // pin unit
  const isPower = libId.toLowerCase().startsWith('power:');

  // Reference designator letter for the lib_symbol property
  const refLetter = isPower ? '#PWR' : guessRefLetter(libId);

  const out: string[] = [];
  out.push(`\t\t(symbol "${safeLibId}"`);
  if (isPower) out.push('\t\t\t(power)');
  out.push('\t\t\t(pin_names');
  out.push('\t\t\t\t(offset 0.254)');
  out.push('\t\t\t)');
  out.push('\t\t\t(exclude_from_sim no)');
  out.push('\t\t\t(in_bom yes)');
  out.push('\t\t\t(on_board yes)');
  // Required properties — KiCad refuses lib_symbols missing Reference/Value.
  out.push(libProperty('Reference', refLetter, false));
  out.push(libProperty('Value', libId, false));
  out.push(libProperty('Footprint', '', true));
  out.push(libProperty('Datasheet', '', true));
  out.push(libProperty('Description', '', true));

  // Body unit (_0_1) — minimal placeholder rectangle so KiCad has something
  // to draw besides naked pins. We size it from the glyph's halfWidth/Height.
  // Power symbols don't need a body rectangle.
  if (!isPower) {
    const hw = Math.max(draw.halfWidth, 1);
    const hh = Math.max(draw.halfHeight, 1);
    out.push(`\t\t\t(symbol "${unitNameBody}"`);
    out.push('\t\t\t\t(rectangle');
    out.push(`\t\t\t\t\t(start ${n(-hw)} ${n(-hh)})`);
    out.push(`\t\t\t\t\t(end ${n(hw)} ${n(hh)})`);
    out.push('\t\t\t\t\t(stroke');
    out.push('\t\t\t\t\t\t(width 0.2032)');
    out.push('\t\t\t\t\t\t(type default)');
    out.push('\t\t\t\t\t)');
    out.push('\t\t\t\t\t(fill');
    out.push('\t\t\t\t\t\t(type none)');
    out.push('\t\t\t\t\t)');
    out.push('\t\t\t\t)');
    out.push('\t\t\t)');
  }

  // Pin unit (_1_1) — pins with correct rotation pointing AWAY from body.
  out.push(`\t\t\t(symbol "${unitNamePins}"`);
  for (const p of draw.pins) {
    out.push(pinDef(p, isPower));
  }
  out.push('\t\t\t)');

  out.push('\t\t\t(embedded_fonts no)');
  out.push('\t\t)');
  return out.join('\n');
}

function libProperty(name: string, value: string, hide: boolean): string {
  const out: string[] = [];
  out.push(`\t\t\t(property "${esc(name)}" "${esc(value)}"`);
  out.push('\t\t\t\t(at 0 0 0)');
  out.push('\t\t\t\t(effects');
  out.push('\t\t\t\t\t(font');
  out.push('\t\t\t\t\t\t(size 1.27 1.27)');
  out.push('\t\t\t\t\t)');
  if (hide) out.push('\t\t\t\t\t(hide yes)');
  out.push('\t\t\t\t)');
  out.push('\t\t\t)');
  return out.join('\n');
}

/**
 * Emit one `(pin … )` block inside a lib_symbol unit.
 *
 * Pin rotation in KiCad is the direction the pin extends from its anchor
 * (the wire-attach point). We pick the angle that points the pin OUTWARD
 * from the symbol body so the pin label sits inside, and the wire-end
 * coordinate matches the editor glyph's pin position.
 *
 * Length 0 → anchor IS the wire endpoint, matching how the editor draws pins.
 */
function pinDef(p: PinAnchor, isPower: boolean): string {
  const rot = pinRotation(p.dx, p.dy);
  const electricalType = isPower ? 'power_in' : 'passive';
  const out: string[] = [];
  out.push(`\t\t\t\t(pin ${electricalType} line`);
  out.push(`\t\t\t\t\t(at ${n(p.dx)} ${n(p.dy)} ${rot})`);
  out.push('\t\t\t\t\t(length 0)');
  out.push('\t\t\t\t\t(name "~"');
  out.push('\t\t\t\t\t\t(effects');
  out.push('\t\t\t\t\t\t\t(font');
  out.push('\t\t\t\t\t\t\t\t(size 1.27 1.27)');
  out.push('\t\t\t\t\t\t\t)');
  out.push('\t\t\t\t\t\t)');
  out.push('\t\t\t\t\t)');
  out.push(`\t\t\t\t\t(number "${esc(p.number)}"`);
  out.push('\t\t\t\t\t\t(effects');
  out.push('\t\t\t\t\t\t\t(font');
  out.push('\t\t\t\t\t\t\t\t(size 1.27 1.27)');
  out.push('\t\t\t\t\t\t\t)');
  out.push('\t\t\t\t\t\t)');
  out.push('\t\t\t\t\t)');
  out.push('\t\t\t\t)');
  return out.join('\n');
}

function pinRotation(dx: number, dy: number): number {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 0 : 180;
  }
  return dy >= 0 ? 90 : 270;
}

function guessRefLetter(libId: string): string {
  const id = libId.toLowerCase();
  if (id.startsWith('power:')) return '#PWR';
  if (id === 'device:r' || id.startsWith('device:r_')) return 'R';
  if (id === 'device:c' || id.startsWith('device:c_') ||
      id.startsWith('device:cp')) return 'C';
  if (id === 'device:l' || id.startsWith('device:l_')) return 'L';
  if (id === 'device:d' || id.startsWith('device:d_') ||
      id === 'device:led' || id.startsWith('device:led')) return 'D';
  if (id === 'device:fuse' || id.startsWith('device:fuse')) return 'F';
  if (id === 'device:crystal' || id.startsWith('device:crystal') ||
      id === 'device:resonator') return 'Y';
  if (id === 'device:battery' || id.startsWith('device:battery')) return 'BT';
  if (id.startsWith('device:sw_') || id.startsWith('switch:')) return 'SW';
  if (id.startsWith('device:q_') || id.startsWith('transistor_')) return 'Q';
  if (id.startsWith('amplifier_') || id.startsWith('comparator:') ||
      id.startsWith('regulator_') || id.startsWith('mcu_') ||
      id.startsWith('sensor') || id.startsWith('logic_') ||
      id.startsWith('memory_') || id.startsWith('interface_') ||
      id.startsWith('display:')) return 'U';
  if (id.startsWith('connector')) return 'J';
  if (id.startsWith('device:transformer') || id.startsWith('transformer:')) return 'T';
  return 'U';
}

// ---------------------------------------------------------------------------
// Symbol instance block
// ---------------------------------------------------------------------------

function symbolBlock(comp: EditorComponent, rootUuid: string): string {
  const draw = drawSymbol(comp.libId, comp.value);
  const symUuid = randomUuid();
  const out: string[] = [];

  out.push('\t(symbol');
  out.push(`\t\t(lib_id "${esc(comp.libId)}")`);
  out.push(`\t\t(at ${n(comp.x)} ${n(comp.y)} ${comp.rot})`);
  if (comp.mirror === 'x' || comp.mirror === 'y') {
    out.push(`\t\t(mirror ${comp.mirror})`);
  }
  out.push('\t\t(unit 1)');
  out.push('\t\t(exclude_from_sim no)');
  out.push('\t\t(in_bom yes)');
  out.push('\t\t(on_board yes)');
  out.push('\t\t(dnp no)');
  out.push(`\t\t(uuid "${symUuid}")`);

  // Properties — Reference, Value mandatory; Footprint/Datasheet/Description
  // always emitted (even blank) because KiCad rewrites the file with these.
  out.push(propertyBlock('Reference', comp.designator, comp.x - 4, comp.y - 4, false));
  out.push(propertyBlock('Value', comp.value, comp.x + 2, comp.y + 4, false));
  out.push(propertyBlock('Footprint', comp.footprint ?? '', comp.x, comp.y, true));
  out.push(propertyBlock('Datasheet', comp.datasheet ?? '', comp.x, comp.y, true));
  out.push(propertyBlock('Description', '', comp.x, comp.y, true));
  if (comp.mpn) {
    out.push(propertyBlock('MPN', comp.mpn, comp.x, comp.y + 6, true));
  }

  // Pin stubs — KiCad 10 short form: (pin "<num>" (uuid "<u>"))
  for (const p of draw.pins) {
    out.push(`\t\t(pin "${esc(p.number)}"`);
    out.push(`\t\t\t(uuid "${randomUuid()}")`);
    out.push('\t\t)');
  }

  // Instances — path UUID is the schematic-root UUID (shared), NOT a per-symbol UUID.
  out.push('\t\t(instances');
  out.push('\t\t\t(project "eencyclopedia"');
  out.push(`\t\t\t\t(path "/${rootUuid}"`);
  out.push(`\t\t\t\t\t(reference "${esc(comp.designator)}")`);
  out.push('\t\t\t\t\t(unit 1)');
  out.push('\t\t\t\t)');
  out.push('\t\t\t)');
  out.push('\t\t)');
  out.push('\t)');
  return out.join('\n');
}

function propertyBlock(
  name: string, value: string, x: number, y: number, hide: boolean,
): string {
  const out: string[] = [];
  out.push(`\t\t(property "${esc(name)}" "${esc(value)}"`);
  out.push(`\t\t\t(at ${n(x)} ${n(y)} 0)`);
  out.push('\t\t\t(effects');
  out.push('\t\t\t\t(font');
  out.push('\t\t\t\t\t(size 1.27 1.27)');
  out.push('\t\t\t\t)');
  if (hide) out.push('\t\t\t\t(hide yes)');
  out.push('\t\t\t)');
  out.push('\t\t)');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Wires, junctions, labels, no_connects, text — all need UUIDs in KiCad 10
// ---------------------------------------------------------------------------

function wireBlock(x1: number, y1: number, x2: number, y2: number): string {
  return [
    '\t(wire',
    '\t\t(pts',
    `\t\t\t(xy ${n(x1)} ${n(y1)}) (xy ${n(x2)} ${n(y2)})`,
    '\t\t)',
    '\t\t(stroke',
    '\t\t\t(width 0)',
    '\t\t\t(type default)',
    '\t\t)',
    `\t\t(uuid "${randomUuid()}")`,
    '\t)',
  ].join('\n');
}

function junctionBlock(x: number, y: number): string {
  return [
    '\t(junction',
    `\t\t(at ${n(x)} ${n(y)})`,
    '\t\t(diameter 0)',
    '\t\t(color 0 0 0 0)',
    `\t\t(uuid "${randomUuid()}")`,
    '\t)',
  ].join('\n');
}

function noConnectBlock(x: number, y: number): string {
  return [
    '\t(no_connect',
    `\t\t(at ${n(x)} ${n(y)})`,
    `\t\t(uuid "${randomUuid()}")`,
    '\t)',
  ].join('\n');
}

function labelBlock(
  tag: 'label' | 'global_label', text: string, x: number, y: number, rot: number,
): string {
  return [
    `\t(${tag} "${esc(text)}"`,
    `\t\t(at ${n(x)} ${n(y)} ${rot})`,
    '\t\t(effects',
    '\t\t\t(font',
    '\t\t\t\t(size 1.27 1.27)',
    '\t\t\t)',
    '\t\t\t(justify left bottom)',
    '\t\t)',
    `\t\t(uuid "${randomUuid()}")`,
    '\t)',
  ].join('\n');
}

function textBlock(
  text: string, x: number, y: number, fontSize: number,
  bold: boolean, italic: boolean,
): string {
  const fontExtras: string[] = [];
  if (bold) fontExtras.push('\t\t\t\t(bold yes)');
  if (italic) fontExtras.push('\t\t\t\t(italic yes)');
  const out: string[] = [];
  out.push(`\t(text "${esc(text)}"`);
  out.push('\t\t(exclude_from_sim no)');
  out.push(`\t\t(at ${n(x)} ${n(y)} 0)`);
  out.push('\t\t(effects');
  out.push('\t\t\t(font');
  out.push(`\t\t\t\t(size ${n(fontSize)} ${n(fontSize)})`);
  out.push(...fontExtras);
  out.push('\t\t\t)');
  out.push('\t\t)');
  out.push(`\t\t(uuid "${randomUuid()}")`);
  out.push('\t)');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function n(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function esc(v: string): string {
  // KiCad S-expression string: backslash-escape \" and \\.
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function randomUuid(): string {
  // RFC 4122 v4 — 8-4-4-4-12 lowercase hex with version/variant bits set.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
