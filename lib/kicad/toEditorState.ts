/**
 * Convert a CanonicalSchematic (from normalise.ts) into an EditorState
 * suitable for the interactive SchematicEditor component.
 */

import type { CanonicalSchematic, CanonicalComponent } from './normalise';
import type { EditorState, EditorComponent } from '@/components/schematic/editorTypes';

let _idCounter = 0;
function uid() { return `el_${++_idCounter}_${Math.random().toString(36).slice(2,7)}`; }

export function toEditorState(c: CanonicalSchematic): EditorState {
  const components: EditorComponent[] = c.components
    .filter((comp) => !comp.designator.startsWith('#'))
    .map((comp) => canonicalToEditorComp(comp));

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

function canonicalToEditorComp(comp: CanonicalComponent): EditorComponent {
  // Prefer world-coordinate centre from pins if available
  let cx = comp.pos.x;
  let cy = comp.pos.y;

  if (comp.pins.length >= 2) {
    const xs = comp.pins.map((p) => p.world.x);
    const ys = comp.pins.map((p) => p.world.y);
    cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  }

  return {
    id: uid(),
    libId: comp.libId,
    designator: comp.designator,
    value: comp.value,
    x: cx, y: cy,
    rot: comp.rot,
    mirror: comp.mirror,
  };
}
