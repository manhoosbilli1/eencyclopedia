/**
 * SVG renderer for an `eencyc-schematic` canonical AST.
 *
 * Design goals for V0:
 *   - Clean, text-free render by default. Designators and values appear only
 *     via client-side hover (SchematicViewer component, circuit/[id]).
 *   - All data needed for hover is embedded in `data-*` attributes so the
 *     client component never has to re-fetch anything.
 *   - Component glyphs align pin-to-pin with the file's wire endpoints so
 *     wires connect cleanly without stubs.
 *
 * Pipeline:
 *   1. Compute world bbox over wires + junctions + labels + pin world coords.
 *   2. For each component: pick a glyph from symbols.ts, compute the
 *      similarity transform that maps glyph-local pin anchors onto the
 *      file's pin world coords (rotate + scale + translate).
 *   3. Wrap glyph in a `<g class="comp-wrap" data-*>` so the client can
 *      attach tooltip behaviour via pointer events.
 *   4. Wires / junctions / net-labels drawn at file world coords.
 *   5. `<style>` block inside the SVG hides `.comp-label` text by default
 *      and reveals it on `.comp-wrap:hover` — pure CSS, no JS required.
 *      The React SchematicViewer component layers richer JS tooltips on top.
 *
 * What it doesn't do (V0):
 *   - Honor lib_symbols body geometry (clean consistent glyphs used instead).
 *   - Auto-route labels to avoid collisions.
 *   - Render `(text …)` annotations or `(no_connect …)` markers.
 *
 * Pure function — runs in Node (upload action) and Vitest (no DOM needed).
 */

import type { CanonicalSchematic, CanonicalComponent } from './normalise';
import { drawSymbol, type SymbolDraw } from './symbols';

export interface RenderOptions {
  /** Schematic title — used in the SVG `<title>` for a11y. */
  title: string;
  /** Padding added to the bbox in mm. Default 12. */
  paddingMm?: number;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/** Generate an inline-safe SVG string. Pure function, no side-effects. */
export function renderSvg(c: CanonicalSchematic, opts: RenderOptions): string {
  const pad = opts.paddingMm ?? 12;
  const bbox = computeBbox(c, pad);
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
      `viewBox="${num(bbox.minX)} ${num(bbox.minY)} ${num(w)} ${num(h)}" ` +
      `role="img" aria-label="${esc(opts.title)}" ` +
      `style="color:currentColor;font-family:system-ui,-apple-system,Segoe UI,sans-serif;` +
      `width:100%;height:auto;display:block;">`,
  );
  parts.push(`<title>${esc(opts.title)}</title>`);

  // CSS — hover-reveal labels, pointer cursor on interactive elements.
  // <style> inside inline SVG is safe (not for <img src=svg>).
  parts.push(
    `<style>` +
      `.comp-wrap{cursor:pointer}` +
      `.comp-label{display:none;pointer-events:none}` +
      `.comp-wrap:hover .comp-label{display:block}` +
      `.net-label-wrap{cursor:pointer}` +
      `.net-label-text{display:none;pointer-events:none}` +
      `.net-label-wrap:hover .net-label-text{display:block}` +
      `</style>`,
  );

  // Background grid
  parts.push(gridDef(bbox));

  // Wires — behind symbol bodies
  for (const wire of c.geom.wires) {
    parts.push(
      `<line x1="${num(wire.x1)}" y1="${num(wire.y1)}" ` +
        `x2="${num(wire.x2)}" y2="${num(wire.y2)}" ` +
        `stroke="currentColor" stroke-width="0.5" stroke-linecap="round"/>`,
    );
  }

  // Junctions
  for (const j of c.geom.junctions) {
    parts.push(`<circle cx="${num(j.x)}" cy="${num(j.y)}" r="0.9" fill="currentColor"/>`);
  }

  // Components
  for (const comp of c.components) {
    parts.push(renderComponent(comp));
  }

  // Net labels (on top)
  for (const l of c.geom.labels) {
    parts.push(renderNetLabel(l.text, l.x, l.y, l.rot, l.kind));
  }

  parts.push(`</svg>`);
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Component rendering
// ---------------------------------------------------------------------------

function renderComponent(comp: CanonicalComponent): string {
  const draw: SymbolDraw = drawSymbol(comp.libId, comp.value);
  const transform = computeGlyphTransform(comp, draw);

  // Power symbols (#PWR01, GND, +3V3 …): value IS the net name.
  const isPower =
    comp.designator.startsWith('#') ||
    draw.family === 'gnd' ||
    draw.family === 'power_rail';

  // a11y description for screen readers
  const desc = isPower
    ? `<desc>${esc(comp.value)} power symbol</desc>`
    : `<desc>${esc(comp.designator)} — ${esc(comp.value)}</desc>`;

  // Glyph group (carries spatial transform)
  const glyphGroup = `<g transform="${transform}">${desc}${draw.svg}</g>`;

  // Hover-only label at world coords (outside the transform so text isn't
  // scaled/rotated with the glyph body)
  const anchor = labelAnchorFor(comp);
  const labelContent = isPower
    ? `<text x="${num(anchor.x)}" y="${num(anchor.y)}" ` +
      `font-size="2.6" font-weight="600" fill="currentColor" ` +
      `text-anchor="${anchor.anchor}">${esc(comp.value)}</text>`
    : `<text x="${num(anchor.x)}" y="${num(anchor.y)}" ` +
      `font-size="2.4" fill="currentColor" text-anchor="${anchor.anchor}">${esc(comp.designator)}</text>` +
      `<text x="${num(anchor.x)}" y="${num(anchor.y + 2.8)}" ` +
      `font-size="2.2" fill="currentColor" opacity="0.7" text-anchor="${anchor.anchor}">${esc(comp.value)}</text>`;
  const labelGroup = `<g class="comp-label">${labelContent}</g>`;

  // Wrapper carries data-* for the JS SchematicViewer tooltip layer
  const dataAttrs = [
    `class="comp-wrap"`,
    `data-designator="${esc(comp.designator)}"`,
    `data-libid="${esc(comp.libId)}"`,
    `data-family="${esc(draw.family)}"`,
    `data-mpn="${esc(comp.mpn ?? '')}"`,
    `data-value="${esc(comp.value)}"`,
    isPower ? `data-net="${esc(comp.value)}"` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return `<g ${dataAttrs}>${glyphGroup}${labelGroup}</g>`;
}

// ---------------------------------------------------------------------------
// Glyph transform
// ---------------------------------------------------------------------------

/**
 * Build the SVG `transform` string that maps glyph-local pin anchors onto
 * the component's world pin coords.
 *
 * Cases:
 *   2-pin glyph + 2 file pins → similarity transform aligning midpoints with
 *     rotation and scale to match pin spans.
 *   1-pin glyph (power symbols) → translate to pin world coord, rotate by
 *     −comp.rot (KiCad CCW → SVG CW sign flip).
 *   3-pin / 5-pin / unknown → translate to `at` position, rotate, no scale.
 */
function computeGlyphTransform(comp: CanonicalComponent, draw: SymbolDraw): string {
  const filePins = comp.pins;

  if (draw.pins.length === 2 && filePins.length === 2) {
    const pairs = pairPinsByName(draw.pins, filePins);
    const gp1 = pairs[0]!.glyph;
    const gp2 = pairs[1]!.glyph;
    const fp1 = pairs[0]!.file.world;
    const fp2 = pairs[1]!.file.world;

    const gdx = gp2.dx - gp1.dx;
    const gdy = gp2.dy - gp1.dy;
    const fdx = fp2.x - fp1.x;
    const fdy = fp2.y - fp1.y;

    const gLen = Math.hypot(gdx, gdy) || 1;
    const fLen = Math.hypot(fdx, fdy) || 1;
    const scale = fLen / gLen;
    const rotDeg = ((Math.atan2(fdy, fdx) - Math.atan2(gdy, gdx)) * 180) / Math.PI;

    const gMidX = (gp1.dx + gp2.dx) / 2;
    const gMidY = (gp1.dy + gp2.dy) / 2;
    const fMidX = (fp1.x + fp2.x) / 2;
    const fMidY = (fp1.y + fp2.y) / 2;

    return (
      `translate(${num(fMidX)} ${num(fMidY)}) ` +
      `rotate(${num(rotDeg)}) ` +
      `scale(${num(scale)}) ` +
      `translate(${num(-gMidX)} ${num(-gMidY)})`
    );
  }

  if (draw.pins.length === 1 && filePins.length === 1) {
    const gp = draw.pins[0]!;
    const fp = filePins[0]!.world;
    return (
      `translate(${num(fp.x)} ${num(fp.y)}) ` +
      `rotate(${num(-comp.rot)}) ` +
      `translate(${num(-gp.dx)} ${num(-gp.dy)})`
    );
  }

  return (
    `translate(${num(comp.pos.x)} ${num(comp.pos.y)}) rotate(${num(-comp.rot)})` +
    (comp.mirror === 'x' ? ' scale(1 -1)' : comp.mirror === 'y' ? ' scale(-1 1)' : '')
  );
}

/**
 * Pair glyph pins with file pins by name (case-insensitive), falling back to
 * positional order. Name-based pairing corrects diode/LED orientation (K/A).
 */
function pairPinsByName(
  glyphPins: SymbolDraw['pins'],
  filePins: CanonicalComponent['pins'],
): Array<{ glyph: SymbolDraw['pins'][number]; file: CanonicalComponent['pins'][number] }> {
  const fileByName = new Map<string, CanonicalComponent['pins'][number]>();
  for (const fp of filePins) {
    if (fp.name && fp.name !== '~') fileByName.set(fp.name.toUpperCase(), fp);
  }
  const allMatched = glyphPins.every((gp) => fileByName.has(gp.number.toUpperCase()));
  if (allMatched && fileByName.size === glyphPins.length) {
    return glyphPins.map((gp) => ({
      glyph: gp,
      file: fileByName.get(gp.number.toUpperCase())!,
    }));
  }
  return glyphPins.map((gp, i) => ({ glyph: gp, file: filePins[i]! }));
}

/**
 * Hover-label anchor: to the right of vertical 2-pin components, above
 * horizontal ones, right of single-pin / unknown.
 */
function labelAnchorFor(
  comp: CanonicalComponent,
): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  if (comp.pins.length >= 2) {
    const a = comp.pins[0]!.world;
    const b = comp.pins[1]!.world;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    if (Math.abs(b.y - a.y) > Math.abs(b.x - a.x)) {
      return { x: midX + 4.5, y: midY - 0.5, anchor: 'start' };
    }
    return { x: midX, y: midY - 4.5, anchor: 'middle' };
  }
  return { x: comp.pos.x + 4.5, y: comp.pos.y - 1, anchor: 'start' };
}

// ---------------------------------------------------------------------------
// Net label rendering
// ---------------------------------------------------------------------------

function renderNetLabel(
  text: string,
  x: number,
  y: number,
  rot: number,
  kind: 'local' | 'global',
): string {
  const weight = kind === 'global' ? ' font-weight="600"' : '';
  const rotAttr = rot ? `transform="rotate(${num(rot)} ${num(x)} ${num(y)})"` : '';

  // Small diamond hit-target at the label attachment point (always visible)
  const d = 1.3;
  const marker =
    `<polygon points="` +
    `${num(x)},${num(y - d)} ${num(x + d)},${num(y)} ` +
    `${num(x)},${num(y + d)} ${num(x - d)},${num(y)}` +
    `" fill="currentColor" opacity="0.45"/>`;

  const label =
    `<g class="net-label-text">` +
    `<text x="${num(x + 2)}" y="${num(y - 1.5)}" font-size="2.6" fill="currentColor"${weight}>${esc(text)}</text>` +
    `</g>`;

  return (
    `<g class="net-label-wrap" data-net="${esc(text)}" data-label-kind="${kind}" ${rotAttr}>` +
    marker +
    label +
    `</g>`
  );
}

// ---------------------------------------------------------------------------
// Bbox
// ---------------------------------------------------------------------------

interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function computeBbox(c: CanonicalSchematic, pad: number): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const consider = (x: number, y: number, hw = 0, hh = 0) => {
    minX = Math.min(minX, x - hw);
    minY = Math.min(minY, y - hh);
    maxX = Math.max(maxX, x + hw);
    maxY = Math.max(maxY, y + hh);
  };

  for (const comp of c.components) {
    if (comp.pins.length > 0) {
      for (const p of comp.pins) consider(p.world.x, p.world.y, 1, 1);
    } else {
      consider(comp.pos.x, comp.pos.y, 12, 8);
    }
  }
  for (const w of c.geom.wires) {
    consider(w.x1, w.y1);
    consider(w.x2, w.y2);
  }
  for (const j of c.geom.junctions) consider(j.x, j.y);
  for (const l of c.geom.labels) consider(l.x, l.y, 12, 4);

  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 80 };
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function gridDef(bbox: BBox): string {
  return (
    `<defs>` +
    `<pattern id="g10" width="2.54" height="2.54" patternUnits="userSpaceOnUse">` +
    `<circle cx="0" cy="0" r="0.12" fill="currentColor" opacity="0.15"/>` +
    `</pattern>` +
    `</defs>` +
    `<rect x="${num(bbox.minX)}" y="${num(bbox.minY)}" ` +
    `width="${num(bbox.maxX - bbox.minX)}" height="${num(bbox.maxY - bbox.minY)}" ` +
    `fill="url(#g10)"/>`
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(3).replace(/\.?0+$/, '');
}

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
