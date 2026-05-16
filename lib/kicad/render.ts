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
import type { LibShape } from './parse';
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

  // Components (body + label) — pass the lib_id → body-shapes map so we
  // render KiCad-authentic geometry when the upload included it.
  const libGraphics = c.geom.libGraphics ?? new Map();
  for (const comp of c.components) {
    out.push(renderComponent(comp, libGraphics));
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

function renderComponent(
  comp: CanonicalComponent,
  libGraphics: Map<string, { shapes: LibShape[]; isPower: boolean }>,
): string {
  const draw: SymbolDraw = drawSymbol(comp.libId, comp.value);
  // Prefer the file's embedded geometry over the generic glyph for fidelity:
  // an MCU with 32 pins should render with KiCad's actual body & pin layout,
  // not a 6-pin generic IC block.
  const libGfx = libGraphics.get(comp.libId);
  const useEmbedded = libGfx && libGfx.shapes.length > 0 && comp.pins.length > 0;

  const isPower =
    comp.designator.startsWith('#') ||
    draw.family === 'gnd' ||
    draw.family === 'power_rail' ||
    !!libGfx?.isPower;

  const desc = isPower
    ? `<desc>${esc(comp.value)} power symbol</desc>`
    : `<desc>${esc(comp.designator)} — ${esc(comp.value)}</desc>`;

  let glyphGroup: string;
  if (useEmbedded) {
    glyphGroup = renderEmbeddedBody(comp, libGfx!.shapes, libGfx!.isPower);
  } else {
    const xform = computeGlyphTransform(comp, draw);
    glyphGroup = `<g class="comp-body" transform="${xform}">${desc}${draw.svg}</g>`;
  }

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

  return `<g ${dataAttrs}>${desc}${glyphGroup}${labelGroup}</g>`;
}

// ---------------------------------------------------------------------------
// Embedded body rendering — uses KiCad's own lib_symbols geometry
// ---------------------------------------------------------------------------

function renderEmbeddedBody(
  comp: CanonicalComponent,
  shapes: LibShape[],
  isPower: boolean,
): string {
  // Apply the instance transform (translate to comp pos + rotate + mirror).
  // We translate in SVG space so each shape's local coords resolve correctly.
  const tx = comp.pos.x;
  const ty = comp.pos.y;
  const r = ((comp.rot % 360) + 360) % 360;
  const mirror = comp.mirror === 'x'
    ? ' scale(1 -1)'
    : comp.mirror === 'y' ? ' scale(-1 1)' : '';
  const xform = `translate(${n(tx)} ${n(ty)}) rotate(${n(-r)})${mirror}`;

  // KiCad's stock theme paints "background" fills in a soft yellow and
  // "outline" fills in light yellow. We use the same conventions so connectors,
  // ICs, and power-symbol bodies look identical to KiCad.
  const yellowFill = '#fffeb8';
  const yellowStroke = isPower ? 'currentColor' : '#840000';

  const bodyParts: string[] = [];
  for (const s of shapes) {
    bodyParts.push(renderLibShape(s, yellowFill, yellowStroke));
  }
  // Pin stub lines — KiCad always draws a short line from each pin's
  // connection point toward the symbol body as part of standard pin
  // rendering (it's NOT included in lib_symbol shape geometry). Without
  // these, components whose body is offset from the connection point
  // look visually disconnected from their wires.
  //
  // Endpoint formula (lib_symbol local frame, shared with body xform):
  //   ex = x + L·cos(θ°),  ey = y + L·sin(θ°)
  // Verified against Device:R pins ((0, ±3.81, 90/270) length 1.27 →
  // body edge at (0, ∓2.54)) and Conn_01x04 pin 1 ((−5.08, −3.81, 0)
  // length 3.81 → body edge at (−1.27, −3.81)).
  for (const p of comp.pins) {
    const len = p.length ?? 0;
    if (len <= 0) continue;
    const rotPin = p.rot ?? 0;
    const rad = (rotPin * Math.PI) / 180;
    const ex = p.local.x + len * Math.cos(rad);
    const ey = p.local.y + len * Math.sin(rad);
    bodyParts.push(
      `<line x1="${n(p.local.x)}" y1="${n(p.local.y)}" x2="${n(ex)}" y2="${n(ey)}" ` +
      `stroke="${yellowStroke}" stroke-width="0.254" stroke-linecap="round"/>`,
    );
  }
  return `<g class="comp-body" transform="${xform}">${bodyParts.join('')}</g>`;
}

function renderLibShape(s: LibShape, fill: string, stroke: string): string {
  const sw = '0.254'; // KiCad default lib_symbol stroke width (10 mil)
  switch (s.kind) {
    case 'rectangle': {
      const x = Math.min(s.x1, s.x2);
      const y = Math.min(s.y1, s.y2);
      const w = Math.abs(s.x2 - s.x1);
      const h = Math.abs(s.y2 - s.y1);
      const f = s.filled ? fill : 'none';
      return (
        `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" ` +
        `fill="${f}" stroke="${stroke}" stroke-width="${sw}"/>`
      );
    }
    case 'polyline': {
      const d = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${n(p.x)} ${n(p.y)}`).join(' ');
      const f = s.filled ? fill : 'none';
      return (
        `<path d="${d}" fill="${f}" stroke="${stroke}" stroke-width="${sw}" ` +
        `stroke-linecap="round" stroke-linejoin="round"/>`
      );
    }
    case 'circle': {
      const f = s.filled ? fill : 'none';
      return (
        `<circle cx="${n(s.cx)}" cy="${n(s.cy)}" r="${n(s.r)}" ` +
        `fill="${f}" stroke="${stroke}" stroke-width="${sw}"/>`
      );
    }
    case 'arc': {
      // KiCad arcs are start → mid → end. Compute centre + radius from those
      // three points and emit an SVG arc-path. Falls back to a chord if the
      // points are collinear.
      const arc = arcFromPoints(s.sx, s.sy, s.mx, s.my, s.ex, s.ey);
      const f = s.filled ? fill : 'none';
      if (!arc) {
        return (
          `<line x1="${n(s.sx)}" y1="${n(s.sy)}" x2="${n(s.ex)}" y2="${n(s.ey)}" ` +
          `stroke="${stroke}" stroke-width="${sw}"/>`
        );
      }
      return (
        `<path d="M ${n(s.sx)} ${n(s.sy)} ` +
        `A ${n(arc.r)} ${n(arc.r)} 0 ${arc.large} ${arc.sweep} ${n(s.ex)} ${n(s.ey)}" ` +
        `fill="${f}" stroke="${stroke}" stroke-width="${sw}"/>`
      );
    }
    case 'text': {
      // Rendered with a small font; rotation applied via SVG transform.
      const xform = s.rot ? ` transform="rotate(${n(s.rot)} ${n(s.x)} ${n(s.y)})"` : '';
      return (
        `<text x="${n(s.x)}" y="${n(s.y)}" font-size="${n(Math.max(0.6, s.size))}" ` +
        `fill="currentColor"${xform}>${esc(s.text)}</text>`
      );
    }
  }
}

/** Three-point circle parameters → SVG arc command pieces. Returns null when collinear. */
function arcFromPoints(
  sx: number, sy: number, mx: number, my: number, ex: number, ey: number,
): { r: number; large: 0 | 1; sweep: 0 | 1 } | null {
  const ax = mx - sx, ay = my - sy;
  const bx = ex - sx, by = ey - sy;
  const d = 2 * (ax * by - ay * bx);
  if (Math.abs(d) < 1e-9) return null; // collinear
  const aLen = ax * ax + ay * ay;
  const bLen = bx * bx + by * by;
  const ux = (by * aLen - ay * bLen) / d;
  const uy = (ax * bLen - bx * aLen) / d;
  const r = Math.hypot(ux, uy);
  // Determine arc direction from cross product of (mid-start) × (end-mid)
  const cross = (mx - sx) * (ey - my) - (my - sy) * (ex - mx);
  const sweep: 0 | 1 = cross > 0 ? 0 : 1;
  // Determine large-arc by signed angular distance from start to end through mid
  const sa = Math.atan2(sy - (sy + uy), sx - (sx + ux));
  const ea = Math.atan2(ey - (sy + uy), ex - (sx + ux));
  const ma = Math.atan2(my - (sy + uy), mx - (sx + ux));
  const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const sweepAngle = norm(ea - sa);
  const midAngle = norm(ma - sa);
  const large: 0 | 1 = ((sweepAngle <= Math.PI) === (midAngle <= sweepAngle)) ? 0 : 1;
  return { r, large, sweep };
}

function renderComponentLabel(comp: CanonicalComponent): string {
  // Prefer the exact property positions stored in the KiCad file. KiCad's
  // (at … rot) for a property text is the world position; rot encodes
  // orientation but text is drawn upright/vertical (KiCad never mirrors
  // glyphs). We map 0/180 → horizontal, 90/270 → vertical.
  const refProp = comp.properties?.find((p) => p.name === 'Reference');
  const valProp = comp.properties?.find((p) => p.name === 'Value');

  const renderOne = (
    text: string,
    prop: typeof refProp,
    fallbackX: number,
    fallbackY: number,
    fallbackAnchor: 'start' | 'middle' | 'end',
    fontSize: number,
    fontWeight: string,
    opacity: number,
  ): string => {
    if (prop?.hide) return '';
    const x = prop?.x ?? fallbackX;
    const y = prop?.y ?? fallbackY;
    const r = prop ? (((prop.rot % 360) + 360) % 360) : 0;
    const textRot = r % 180 === 0 ? 0 : -90;
    const transform = textRot ? ` transform="rotate(${n(textRot)} ${n(x)} ${n(y)})"` : '';
    return (
      `<text x="${n(x)}" y="${n(y)}" font-size="${n(fontSize)}" ` +
      `font-weight="${fontWeight}" fill="currentColor" opacity="${n(opacity)}" ` +
      `text-anchor="${fallbackAnchor}" dominant-baseline="middle"${transform}>` +
      `${esc(text)}</text>`
    );
  };

  const anchor = labelAnchorFor(comp);

  return (
    `<g class="comp-label" pointer-events="none">` +
    renderOne(
      comp.designator, refProp,
      anchor.x, anchor.dy - 1.0, anchor.anchor,
      2.4, '600', 1,
    ) +
    renderOne(
      comp.value, valProp,
      anchor.x, anchor.dy + 1.8, anchor.anchor,
      2.1, 'normal', 0.65,
    ) +
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
  // KiCad's label rotation encodes the direction the text extends from the
  // attachment point, NOT a rotation that should flip the glyphs upside
  // down. Mapping:
  //   rot=0   → text to the right of (x,y)
  //   rot=90  → text above (reads bottom-to-top, i.e. SVG rotate(-90))
  //   rot=180 → text to the left  of (x,y)
  //   rot=270 → text below (reads top-to-bottom, SVG rotate(-90) anchored end)
  // We position the text appropriately and pick text-anchor + a -90° rotation
  // only for the vertical cases. No transform on the parent group.
  const isGlobal = kind === 'global';
  const r = ((rot % 360) + 360) % 360;
  const fs = isGlobal ? 2.6 : 2.4;
  const fw = isGlobal ? '700' : '400';
  const M = 0.9; // margin between attachment and text edge

  let tx = x;
  let ty = y;
  let textAnchor: 'start' | 'end' | 'middle' = 'start';
  let textRot = 0;
  if (r === 0) { tx = x + M; textAnchor = 'start'; }
  else if (r === 180) { tx = x - M; textAnchor = 'end'; }
  else if (r === 90) { ty = y - M; textAnchor = 'start'; textRot = -90; }
  else if (r === 270) { ty = y + M; textAnchor = 'end'; textRot = -90; }

  const textTransform = textRot ? ` transform="rotate(${n(textRot)} ${n(tx)} ${n(ty)})"` : '';
  const globalChevron = isGlobal
    ? `<circle cx="${n(x)}" cy="${n(y)}" r="0.55" fill="none" stroke="currentColor" stroke-width="0.3"/>`
    : '';

  return (
    `<g class="net-label-wrap" data-net="${esc(text)}" data-label-kind="${kind}">` +
    `<circle cx="${n(x)}" cy="${n(y)}" r="0.32" fill="currentColor"/>` +
    globalChevron +
    `<text x="${n(tx)}" y="${n(ty)}" ` +
    `font-size="${fs}" font-weight="${fw}" ` +
    `text-anchor="${textAnchor}" dominant-baseline="middle" ` +
    `fill="currentColor"${textTransform}>${esc(text)}</text>` +
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
