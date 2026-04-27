/**
 * SVG renderer for an `eencyc-schematic` canonical AST.
 *
 * Pipeline:
 *   1. Compute world bbox over wires + junctions + labels + each component's
 *      pin world coords (these come from normalise, which fed them through
 *      transformLocalToWorld using the embedded lib_symbols pin geometry).
 *   2. For each component: pick a glyph from `lib/kicad/symbols.ts` based on
 *      its KiCad lib_id. Scale + rotate + translate the glyph so its pin
 *      anchors land EXACTLY on the file's pin world coords. This means
 *      wires meet the symbol pins cleanly without bridge stubs.
 *   3. Draw wires/junctions at file world coords. They naturally terminate
 *      at component pins because step 2 aligned them.
 *   4. Render labels with a small vertical/horizontal offset so they don't
 *      collide with wires.
 *
 * What it doesn't do (still V0):
 *   - Honor lib_symbols *body* geometry (the actual polylines in the file).
 *     We use our own glyphs because they're typographically clean and
 *     consistent. Body fidelity is post-V0; topology is preserved.
 *   - Auto-route labels away from each other when they overlap.
 *   - Render `(text …)` annotations or `(no_connect …)` markers.
 *
 * The renderer is a pure function so it can run in the upload server action
 * (Node) and unit tests (Vitest, jsdom-free).
 */

import type { CanonicalSchematic, CanonicalComponent } from './normalise';
import { drawSymbol, type SymbolDraw } from './symbols';

export interface RenderOptions {
  /** Schematic title used in the SVG `<title>` (a11y). */
  title: string;
  /** Padding added to the bbox in millimetres. */
  paddingMm?: number;
}

/**
 * The intrinsic pin span of a default 2-pin glyph in symbols.ts (mm). All
 * 2-pin passives have pins at (0, ±5) which is 10 mm total. We scale the
 * glyph so this maps to the file's actual pin span.
 */
const GLYPH_PIN_SPAN = 10;

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
      `style="color:currentColor;font-family:system-ui,-apple-system,Segoe UI,sans-serif;width:100%;height:auto;display:block;">`,
  );
  parts.push(`<title>${esc(opts.title)}</title>`);

  // Background grid (subtle, helps eye-balling component placement)
  parts.push(gridDef(bbox));

  // Wires first so they sit BEHIND the symbol bodies
  for (const wire of c.geom.wires) {
    parts.push(
      `<line x1="${num(wire.x1)}" y1="${num(wire.y1)}" x2="${num(wire.x2)}" y2="${num(wire.y2)}" ` +
        `stroke="currentColor" stroke-width="0.5" stroke-linecap="round" />`,
    );
  }

  // Junctions
  for (const j of c.geom.junctions) {
    parts.push(`<circle cx="${num(j.x)}" cy="${num(j.y)}" r="0.9" fill="currentColor" />`);
  }

  // Components
  for (const comp of c.components) {
    parts.push(renderComponent(comp));
  }

  // Labels (drawn last so they sit on top)
  for (const l of c.geom.labels) {
    parts.push(renderLabel(l.text, l.x, l.y, l.rot, l.kind));
  }

  parts.push(`</svg>`);
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Component rendering
// ---------------------------------------------------------------------------

function renderComponent(comp: CanonicalComponent): string {
  const draw: SymbolDraw = drawSymbol(comp.libId, comp.value);

  // Compute the transform that places the glyph in the world such that its
  // own pin anchors land on the file's pin world coords.
  const transform = computeGlyphTransform(comp, draw);

  // KiCad emits placeholder designators like '#PWR01' / '#PWR02' for power
  // symbols. The user is right that these are noise on the rendered diagram —
  // the *value* of the symbol IS the net name (GND, VBUS, +3V3, …) and that's
  // what an EE wants to see. We:
  //   - Detect designators starting with '#' and suppress visible label text.
  //   - Keep the value as the visible text AND as data-net for hover.
  //   - Tag the body group with data-net so client JS can highlight all
  //     wires sharing the same net name.
  const isPowerSymbol =
    comp.designator.startsWith('#') ||
    draw.family === 'gnd' ||
    draw.family === 'power_rail';

  const dataNetAttr = isPowerSymbol ? `data-net="${esc(comp.value)}"` : '';
  // Body of the symbol (the glyph in its local frame, transformed)
  const body =
    `<g data-designator="${esc(comp.designator)}" data-libid="${esc(comp.libId)}" ` +
    `data-family="${esc(draw.family)}" data-mpn="${esc(comp.mpn ?? '')}" ` +
    `${dataNetAttr} transform="${transform}">${draw.svg}</g>`;

  // Label placement.
  //   - For power symbols: show ONLY the net name (value), not the #PWR designator.
  //   - For everything else: designator on top + value below.
  const labelAnchor = labelAnchorFor(comp);
  const labels = isPowerSymbol
    ? `<g data-net="${esc(comp.value)}" data-power-label="${esc(comp.value)}">` +
      `<text x="${num(labelAnchor.x)}" y="${num(labelAnchor.y)}" font-size="2.6" font-weight="600" fill="currentColor" ` +
      `text-anchor="${labelAnchor.anchor}">${esc(comp.value)}</text>` +
      `</g>`
    : `<g data-designator-label="${esc(comp.designator)}">` +
      `<text x="${num(labelAnchor.x)}" y="${num(labelAnchor.y)}" font-size="2.4" fill="currentColor" ` +
      `text-anchor="${labelAnchor.anchor}">${esc(comp.designator)}</text>` +
      `<text x="${num(labelAnchor.x)}" y="${num(labelAnchor.y + 2.6)}" font-size="2.2" fill="currentColor" ` +
      `opacity="0.7" text-anchor="${labelAnchor.anchor}">${esc(comp.value)}</text>` +
      `</g>`;

  return body + labels;
}

/**
 * Build the SVG `transform` attribute that maps the glyph's local pin
 * anchors onto the component's world pin coords.
 *
 * Cases:
 *   - 2-pin glyph + 2 file pins: similarity transform — translate to the
 *     midpoint, rotate so glyph's (pin1→pin2) vector aligns with file's
 *     vector, scale so distances match.
 *   - 1-pin glyph (power symbols): translate to the file pin's world
 *     coord. No rotation/scale needed beyond what's intrinsic to the
 *     glyph.
 *   - n>2 pin glyph + n>=2 file pins: translate to the symbol's `at`
 *     position, rotate by `comp.rot`, no scale (3-pin/5-pin glyphs are
 *     drawn at a fixed size since pin distances aren't uniform).
 *   - No file pins (lib_symbol missing): translate to `at`, rotate by
 *     `comp.rot`, no scale — same as the old behaviour.
 */
function computeGlyphTransform(comp: CanonicalComponent, draw: SymbolDraw): string {
  const filePins = comp.pins;

  // Case 1: 2-pin glyph + 2 file pins → similarity alignment.
  // Pair pins by NAME first when both sides have meaningful names (e.g.
  // "K"/"A" for diodes). Otherwise fall back to positional pairing.
  // This is what gets diodes/LEDs facing the right direction electrically.
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
    // Angle from glyph vector to file vector (degrees, SVG +Y-down).
    const gAngle = Math.atan2(gdy, gdx);
    const fAngle = Math.atan2(fdy, fdx);
    const rotDeg = ((fAngle - gAngle) * 180) / Math.PI;

    // Midpoints
    const gMidX = (gp1.dx + gp2.dx) / 2;
    const gMidY = (gp1.dy + gp2.dy) / 2;
    const fMidX = (fp1.x + fp2.x) / 2;
    const fMidY = (fp1.y + fp2.y) / 2;

    // SVG transform applies in *reverse* order textually: translate then
    // rotate then scale, but in the matrix sense the order is scale → rotate
    // → translate. We construct: translate(fMid) rotate(rotDeg) scale(s) translate(-gMid)
    // so the glyph midpoint ends at the file midpoint after rotation+scale.
    return (
      `translate(${num(fMidX)} ${num(fMidY)}) ` +
      `rotate(${num(rotDeg)}) ` +
      `scale(${num(scale)}) ` +
      `translate(${num(-gMidX)} ${num(-gMidY)})`
    );
  }

  // Case 2: 1-pin glyph (power symbols).
  //
  // We DO honor the file's `comp.rot`. KiCad rotates power symbols
  // specifically so the body extends in a direction that doesn't collide
  // with the wires that connect to the pin. Ignoring rotation produces
  // overlaps in any non-trivial layout.
  //
  // Sign flip: SVG `rotate(θ)` is clockwise in +Y-down screen frame; KiCad
  // `rot=θ` is counter-clockwise. Calibrated against Circuits.kicad_sch,
  // see parse.spec.ts for the regression cases.
  if (draw.pins.length === 1 && filePins.length === 1) {
    const gp = draw.pins[0]!;
    const fp = filePins[0]!.world;
    return (
      `translate(${num(fp.x)} ${num(fp.y)}) ` +
      `rotate(${num(-comp.rot)}) ` +
      `translate(${num(-gp.dx)} ${num(-gp.dy)})`
    );
  }

  // Case 3 & 4: 3-pin / 5-pin / unknown — fixed-size glyph at instance position.
  // Same KiCad-vs-SVG rotation-sign flip as Case 2.
  return (
    `translate(${num(comp.pos.x)} ${num(comp.pos.y)}) rotate(${num(-comp.rot)})` +
    (comp.mirror === 'x' ? ' scale(1 -1)' : comp.mirror === 'y' ? ' scale(-1 1)' : '')
  );
}

/**
 * Pair glyph pins with file pins. Prefer name-based pairing where both sides
 * have non-empty names that match (case-insensitive); fall back to positional.
 * The `glyph.number` field doubles as a semantic name for our glyphs (e.g.
 * "K"/"A"/"G"/"D"/"S") because we mint them in symbols.ts.
 */
function pairPinsByName(
  glyphPins: SymbolDraw['pins'],
  filePins: CanonicalComponent['pins'],
): Array<{ glyph: SymbolDraw['pins'][number]; file: CanonicalComponent['pins'][number] }> {
  const fileByName = new Map<string, CanonicalComponent['pins'][number]>();
  for (const fp of filePins) {
    if (fp.name && fp.name !== '~') fileByName.set(fp.name.toUpperCase(), fp);
  }
  const allMatched = glyphPins.every((gp) =>
    fileByName.has(gp.number.toUpperCase()),
  );
  if (allMatched && fileByName.size === glyphPins.length) {
    return glyphPins.map((gp) => ({
      glyph: gp,
      file: fileByName.get(gp.number.toUpperCase())!,
    }));
  }
  // Positional fallback (resistors / inductors / unnamed pins)
  return glyphPins.map((gp, i) => ({ glyph: gp, file: filePins[i]! }));
}

/**
 * Pick a label anchor that puts the designator next to the symbol body
 * without overlapping its pins. For vertical 2-pin symbols we place to the
 * RIGHT; for horizontal symbols, BELOW; for power symbols, ABOVE/RIGHT
 * depending on direction.
 */
function labelAnchorFor(
  comp: CanonicalComponent,
): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  if (comp.pins.length >= 2) {
    const a = comp.pins[0]!.world;
    const b = comp.pins[1]!.world;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    // Vertical-ish: pins on a roughly vertical line → put labels to the right
    if (Math.abs(dy) > Math.abs(dx)) {
      return { x: midX + 4, y: midY - 0.5, anchor: 'start' };
    }
    // Horizontal-ish: put labels above
    return { x: midX, y: midY - 4, anchor: 'middle' };
  }
  // 1-pin / unknown — to the right of the instance position
  return { x: comp.pos.x + 4, y: comp.pos.y - 1, anchor: 'start' };
}

// ---------------------------------------------------------------------------
// Label rendering (for KiCad's local + global labels)
// ---------------------------------------------------------------------------

function renderLabel(text: string, x: number, y: number, rot: number, kind: 'local' | 'global'): string {
  const fill = 'currentColor';
  const decoration = kind === 'global' ? 'opacity="1" font-weight="600"' : 'opacity="0.85"';
  const transform = rot ? `transform="rotate(${num(rot)} ${num(x)} ${num(y)})"` : '';
  return (
    `<g data-net="${esc(text)}" data-label-kind="${kind}" ${transform}>` +
    `<text x="${num(x + 1)}" y="${num(y - 1)}" font-size="2.6" fill="${fill}" ${decoration}>` +
    `${esc(text)}</text>` +
    `</g>`
  );
}

// ---------------------------------------------------------------------------
// Bbox + grid
// ---------------------------------------------------------------------------

interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function computeBbox(c: CanonicalSchematic, pad: number): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const consider = (x: number, y: number, halfW = 0, halfH = 0) => {
    minX = Math.min(minX, x - halfW);
    minY = Math.min(minY, y - halfH);
    maxX = Math.max(maxX, x + halfW);
    maxY = Math.max(maxY, y + halfH);
  };

  // Component pins (most authoritative — these are the real wire endpoints)
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
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  };
}

function gridDef(bbox: BBox): string {
  return (
    `<defs><pattern id="g10" width="2.54" height="2.54" patternUnits="userSpaceOnUse">` +
    `<circle cx="0" cy="0" r="0.12" fill="currentColor" opacity="0.18"/>` +
    `</pattern></defs>` +
    `<rect x="${num(bbox.minX)}" y="${num(bbox.minY)}" width="${num(bbox.maxX - bbox.minX)}" ` +
    `height="${num(bbox.maxY - bbox.minY)}" fill="url(#g10)"/>`
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
