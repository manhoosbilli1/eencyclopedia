/**
 * SVG renderer for an `eencyc-schematic` canonical AST.
 *
 * What changed in V1 (vs V0):
 *   - Component labels are always visible (not hover-only). Designator
 *     sits above the midpoint, value below, in smaller text. Labels
 *     collapse gracefully on dense circuits.
 *   - Net labels now have a proper KiCad-style flag shape (filled arrow)
 *     pointing at the attachment point instead of a bare diamond.
 *   - No-connect markers (×) rendered at world positions from geom.
 *   - Global net labels rendered with a double-chevron outline.
 *   - Wires slightly thicker (0.5 vs 0.4) to match symbol stroke width.
 *   - Grid is now dots only (not crosses) for a cleaner background.
 *
 * Pure function — safe to run in Node and Vitest.
 */

import type { CanonicalSchematic, CanonicalComponent } from './normalise';
import { drawSymbol, noConnectSvg, type SymbolDraw } from './symbols';

export interface RenderOptions {
  title: string;
  paddingMm?: number;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function renderSvg(c: CanonicalSchematic, opts: RenderOptions): string {
  const pad = opts.paddingMm ?? 14;
  const bbox = computeBbox(c, pad);
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;

  const out: string[] = [];

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `viewBox="${n(bbox.minX)} ${n(bbox.minY)} ${n(w)} ${n(h)}" ` +
    `role="img" aria-label="${esc(opts.title)}" ` +
    `style="color:currentColor;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;` +
    `width:100%;height:auto;display:block;font-size:2.8px;">`,
  );
  out.push(`<title>${esc(opts.title)}</title>`);

  out.push(
    `<style>` +
    `.comp-wrap{cursor:pointer}` +
    `.comp-wrap:hover .comp-body{opacity:0.75}` +
    `.net-label-wrap{cursor:pointer}` +
    `</style>`,
  );

  // Background grid (dots at 2.54mm — 100mil KiCad grid)
  out.push(gridDef(bbox));

  // Wires — drawn behind symbols
  for (const wire of c.geom.wires) {
    out.push(
      `<line x1="${n(wire.x1)}" y1="${n(wire.y1)}" ` +
      `x2="${n(wire.x2)}" y2="${n(wire.y2)}" ` +
      `stroke="currentColor" stroke-width="0.5" stroke-linecap="round"/>`,
    );
  }

  // Junctions (filled circles, slightly larger than V0)
  for (const j of c.geom.junctions) {
    out.push(`<circle cx="${n(j.x)}" cy="${n(j.y)}" r="1.0" fill="currentColor"/>`);
  }

  // No-connect markers (present in extended geom variants)
  const geomExt = c.geom as { wires: unknown[]; junctions: unknown[]; labels: unknown[]; noConnects?: Array<{x:number;y:number}> };
  if (geomExt.noConnects) {
    for (const nc of geomExt.noConnects) {
      out.push(noConnectSvg(nc.x, nc.y));
    }
  }

  // Components (body + label)
  for (const comp of c.components) {
    out.push(renderComponent(comp));
  }

  // Net labels (on top of everything)
  for (const l of c.geom.labels) {
    out.push(renderNetLabel(l.text, l.x, l.y, l.rot, l.kind));
  }

  out.push(`</svg>`);
  return out.join('');
}

// ---------------------------------------------------------------------------
// Component rendering
// ---------------------------------------------------------------------------

function renderComponent(comp: CanonicalComponent): string {
  const draw: SymbolDraw = drawSymbol(comp.libId, comp.value);
  const xform = computeGlyphTransform(comp, draw);

  const isPower =
    comp.designator.startsWith('#') ||
    draw.family === 'gnd' ||
    draw.family === 'power_rail';

  const desc = isPower
    ? `<desc>${esc(comp.value)} power symbol</desc>`
    : `<desc>${esc(comp.designator)} — ${esc(comp.value)}</desc>`;

  const glyphGroup = `<g class="comp-body" transform="${xform}">${desc}${draw.svg}</g>`;

  // Labels — always visible, positioned relative to world midpoint
  const labelGroup = isPower ? '' : renderComponentLabel(comp);

  const dataAttrs = [
    `class="comp-wrap"`,
    `data-designator="${esc(comp.designator)}"`,
    `data-libid="${esc(comp.libId)}"`,
    `data-family="${esc(draw.family)}"`,
    `data-mpn="${esc(comp.mpn ?? '')}"`,
    `data-value="${esc(comp.value)}"`,
    isPower ? `data-net="${esc(comp.value)}"` : '',
  ].filter(Boolean).join(' ');

  return `<g ${dataAttrs}>${glyphGroup}${labelGroup}</g>`;
}

function renderComponentLabel(comp: CanonicalComponent): string {
  const anchor = labelAnchorFor(comp);
  return (
    `<g class="comp-label" pointer-events="none">` +
    `<text x="${n(anchor.x)}" y="${n(anchor.dy - 1.0)}" ` +
    `font-size="2.4" font-weight="600" fill="currentColor" ` +
    `text-anchor="${anchor.anchor}">${esc(comp.designator)}</text>` +
    `<text x="${n(anchor.x)}" y="${n(anchor.dy + 1.8)}" ` +
    `font-size="2.1" fill="currentColor" opacity="0.65" ` +
    `text-anchor="${anchor.anchor}">${esc(comp.value)}</text>` +
    `</g>`
  );
}

// ---------------------------------------------------------------------------
// Glyph transform
// ---------------------------------------------------------------------------

function computeGlyphTransform(comp: CanonicalComponent, draw: SymbolDraw): string {
  const filePins = comp.pins;

  if (draw.pins.length === 2 && filePins.length === 2) {
    const pairs = pairPinsByName(draw.pins, filePins);
    const gp1 = pairs[0]!.glyph;
    const gp2 = pairs[1]!.glyph;
    const fp1 = pairs[0]!.file.world;
    const fp2 = pairs[1]!.file.world;

    const gdx = gp2.dx - gp1.dx, gdy = gp2.dy - gp1.dy;
    const fdx = fp2.x - fp1.x,   fdy = fp2.y - fp1.y;

    const gLen = Math.hypot(gdx, gdy) || 1;
    const fLen = Math.hypot(fdx, fdy) || 1;
    const scale = fLen / gLen;
    const rotDeg = ((Math.atan2(fdy, fdx) - Math.atan2(gdy, gdx)) * 180) / Math.PI;

    const gMidX = (gp1.dx + gp2.dx) / 2, gMidY = (gp1.dy + gp2.dy) / 2;
    const fMidX = (fp1.x + fp2.x) / 2,   fMidY = (fp1.y + fp2.y) / 2;

    return (
      `translate(${n(fMidX)} ${n(fMidY)}) ` +
      `rotate(${n(rotDeg)}) ` +
      `scale(${n(scale)}) ` +
      `translate(${n(-gMidX)} ${n(-gMidY)})`
    );
  }

  if (draw.pins.length === 1 && filePins.length === 1) {
    const gp = draw.pins[0]!;
    const fp = filePins[0]!.world;
    return (
      `translate(${n(fp.x)} ${n(fp.y)}) ` +
      `rotate(${n(-comp.rot)}) ` +
      `translate(${n(-gp.dx)} ${n(-gp.dy)})`
    );
  }

  return (
    `translate(${n(comp.pos.x)} ${n(comp.pos.y)}) rotate(${n(-comp.rot)})` +
    (comp.mirror === 'x' ? ' scale(1 -1)' : comp.mirror === 'y' ? ' scale(-1 1)' : '')
  );
}

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
    return glyphPins.map((gp) => ({ glyph: gp, file: fileByName.get(gp.number.toUpperCase())! }));
  }
  return glyphPins.map((gp, i) => ({ glyph: gp, file: filePins[i]! }));
}

function labelAnchorFor(comp: CanonicalComponent): { x: number; dy: number; anchor: 'start' | 'middle' | 'end' } {
  if (comp.pins.length >= 2) {
    const a = comp.pins[0]!.world, b = comp.pins[1]!.world;
    const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
    if (Math.abs(b.y - a.y) > Math.abs(b.x - a.x)) {
      // Vertical component: label to the right
      return { x: midX + 4.5, dy: midY, anchor: 'start' };
    }
    // Horizontal component: label above
    return { x: midX, dy: midY - 4.5, anchor: 'middle' };
  }
  return { x: comp.pos.x + 5, dy: comp.pos.y - 1, anchor: 'start' };
}

// ---------------------------------------------------------------------------
// Net label rendering — KiCad-style flag arrow
// ---------------------------------------------------------------------------

function renderNetLabel(
  text: string,
  x: number,
  y: number,
  rot: number,
  kind: 'local' | 'global',
): string {
  const isGlobal = kind === 'global';
  // Flag extends 2mm per char estimate + padding, to the right
  const textLen = Math.max(text.length * 1.8 + 3, 8);
  const flagH = isGlobal ? 3.2 : 2.8;
  const fh = flagH / 2; // half-height

  // Flag path: point at left (attachment), rectangle body, arrow tip at right
  // Points go: tip (x,y) → top-right (x+textLen, y-fh) → bottom-right (x+textLen, y+fh) → close
  const flagPath = isGlobal
    ? // global: chevron both ends
      `M ${n(x)},${n(y)} L ${n(x + 1.2)},${n(y - fh)} L ${n(x + textLen)},${n(y - fh)} L ${n(x + textLen + 1.2)},${n(y)} L ${n(x + textLen)},${n(y + fh)} L ${n(x + 1.2)},${n(y + fh)} Z`
    : // local: pointed left, flat right
      `M ${n(x)},${n(y)} L ${n(x + 1.4)},${n(y - fh)} L ${n(x + textLen)},${n(y - fh)} L ${n(x + textLen)},${n(y + fh)} L ${n(x + 1.4)},${n(y + fh)} Z`;

  const rotAttr = rot ? `transform="rotate(${n(rot)} ${n(x)} ${n(y)})"` : '';

  return (
    `<g class="net-label-wrap" data-net="${esc(text)}" data-label-kind="${kind}" ${rotAttr}>` +
    `<path d="${flagPath}" fill="currentColor" opacity="0.08" stroke="currentColor" stroke-width="0.35"/>` +
    `<text x="${n(x + 2.4)}" y="${n(y + 0.9)}" ` +
    `font-size="${isGlobal ? '2.6' : '2.4'}" ` +
    `font-weight="${isGlobal ? '700' : '400'}" ` +
    `fill="currentColor">${esc(text)}</text>` +
    `</g>`
  );
}

// ---------------------------------------------------------------------------
// Bbox
// ---------------------------------------------------------------------------

interface BBox { minX: number; minY: number; maxX: number; maxY: number }

function computeBbox(c: CanonicalSchematic, pad: number): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const add = (x: number, y: number, hw = 0, hh = 0) => {
    minX = Math.min(minX, x - hw);
    minY = Math.min(minY, y - hh);
    maxX = Math.max(maxX, x + hw);
    maxY = Math.max(maxY, y + hh);
  };

  for (const comp of c.components) {
    if (comp.pins.length > 0) {
      for (const p of comp.pins) add(p.world.x, p.world.y, 2, 2);
    } else {
      add(comp.pos.x, comp.pos.y, 14, 8);
    }
  }
  for (const w of c.geom.wires) { add(w.x1, w.y1); add(w.x2, w.y2); }
  for (const j of c.geom.junctions) add(j.x, j.y);
  for (const l of c.geom.labels) add(l.x, l.y, 14, 4);

  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 120, maxY: 80 };
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function gridDef(bbox: BBox): string {
  return (
    `<defs>` +
    `<pattern id="g10" width="2.54" height="2.54" patternUnits="userSpaceOnUse">` +
    `<circle cx="0" cy="0" r="0.14" fill="currentColor" opacity="0.12"/>` +
    `</pattern>` +
    `</defs>` +
    `<rect x="${n(bbox.minX)}" y="${n(bbox.minY)}" ` +
    `width="${n(bbox.maxX - bbox.minX)}" height="${n(bbox.maxY - bbox.minY)}" ` +
    `fill="url(#g10)"/>`
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function n(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(3).replace(/\.?0+$/, '');
}

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
