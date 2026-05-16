/**
 * Convert a CanonicalSchematic (from normalise.ts) into an EditorState
 * suitable for the interactive SchematicEditor component.
 *
 * Two important behaviours for KiCad-fidelity in the editor preview:
 *   1. We DO NOT filter out `#PWR` / power symbols. They round-trip into the
 *      editor and render as proper power flags (KiCad style) — without them
 *      the preview would silently drop +3.3V/+5V/GND markers from the file.
 *   2. We propagate the file's lib_symbol geometry (`embeddedShapes`,
 *      `pinsLocal`) onto each EditorComponent so the editor can draw
 *      KiCad-authentic bodies and pin positions instead of falling back to
 *      the generic glyph catalog (which doesn't know e.g. BSS138 MOSFETs).
 *   3. Component `x, y` is the KiCad instance anchor (the lib_symbol local
 *      origin in world coords). This keeps embedded shapes aligned and makes
 *      fromEditorState's `(at x y rot)` round-trip the original placement.
 */

import type { CanonicalSchematic, CanonicalComponent } from './normalise';
import type { EditorState, EditorComponent } from '@/components/schematic/editorTypes';

let _idCounter = 0;
function uid() { return `el_${++_idCounter}_${Math.random().toString(36).slice(2,7)}`; }

export function toEditorState(c: CanonicalSchematic): EditorState {
  const libGraphics = c.geom.libGraphics ?? new Map();

  const components: EditorComponent[] = c.components.map((comp) =>
    canonicalToEditorComp(comp, libGraphics),
  );

  const wires = c.geom.wires.map((w) => ({
    id: uid(),
    x1: w.x1, y1: w.y1,
    x2: w.x2, y2: w.y2,
  }));

  const junctions = c.geom.junctions.map((j) => ({
    id: uid(), x: j.x, y: j.y,
  }));

  const labels = c.geom.labels.map((l) => ({
    id: uid(), text: l.text, x: l.x, y: l.y, rot: l.rot, kind: l.kind,
  }));

  return { components, wires, junctions, labels, noConnects: [], texts: [] };
}

function canonicalToEditorComp(
  comp: CanonicalComponent,
  libGraphics: Map<string, { shapes: Array<unknown>; isPower: boolean }>,
): EditorComponent {
  const libGfx = libGraphics.get(comp.libId);
  const isPower = comp.designator.startsWith('#') || !!libGfx?.isPower;

  // We anchor at the original KiCad instance position (comp.pos), NOT the
  // pin midpoint. The pin midpoint was historically used so the generic
  // glyph would visually centre on the wires; but the generic glyph's pin
  // offsets are symmetric around (0,0), so anchor == midpoint for those
  // cases. For components with embedded geometry, the anchor is the only
  // correct origin because the lib_symbol shapes are drawn relative to it.
  return {
    id: uid(),
    libId: comp.libId,
    designator: comp.designator,
    value: comp.value,
    x: comp.pos.x,
    y: comp.pos.y,
    rot: comp.rot,
    mirror: comp.mirror,
    mpn: comp.mpn ?? undefined,
    embeddedShapes: libGfx?.shapes as EditorComponent['embeddedShapes'],
    pinsLocal: comp.pins.length > 0
      ? comp.pins.map((p) => ({ number: p.number, x: p.local.x, y: p.local.y }))
      : undefined,
    isPower,
    properties: comp.properties?.map((p) => ({
      name: p.name,
      text: p.value,
      x: p.x,
      y: p.y,
      rot: p.rot,
      hide: p.hide,
    })),
  };
}
