/**
 * SVG fragment generators for KiCad lib_symbol body geometry.
 *
 * Both the server-side circuit renderer (lib/kicad/render.ts) and the
 * client-side interactive editor (components/schematic/SchematicEditor.tsx)
 * need to draw the same set of `(rectangle | polyline | circle | arc | text)`
 * primitives that come out of a parsed `(lib_symbols …)` block. This module
 * is the single source of truth for that.
 *
 * Output is a raw SVG string fragment (no wrapping <g>, no transform). The
 * caller is responsible for positioning the fragment via a parent <g
 * transform> in the world frame the shapes were authored in (i.e. lib_symbol
 * local frame, +Y down, mm units).
 */

import type { LibShape } from './parse';

export interface LibShapeStyle {
  /** Fill colour for shapes with `(fill (type background))` or `(fill (type outline))`. */
  fillBackground: string;
  /** Stroke colour for body outlines. */
  stroke: string;
  /** Stroke width in mm. KiCad default is 0.254mm (10 mil). */
  strokeWidth?: number;
}

/** Render one LibShape to an SVG fragment string. */
export function renderLibShape(s: LibShape, style: LibShapeStyle): string {
  const sw = (style.strokeWidth ?? 0.254).toString();
  const stroke = style.stroke;
  const fill = style.fillBackground;
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
      const d = s.points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${n(p.x)} ${n(p.y)}`)
        .join(' ');
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
      const arc = arcFromPoints(s.sx, s.sy, s.mx, s.my, s.ex, s.ey);
      const f = s.filled ? fill : 'none';
      if (!arc) {
        return (
          `<line x1="${n(s.sx)}" y1="${n(s.sy)}" ` +
          `x2="${n(s.ex)}" y2="${n(s.ey)}" ` +
          `stroke="${stroke}" stroke-width="${sw}"/>`
        );
      }
      return (
        `<path d="M ${n(s.sx)} ${n(s.sy)} ` +
        `A ${n(arc.r)} ${n(arc.r)} 0 ${arc.large} ${arc.sweep} ` +
        `${n(s.ex)} ${n(s.ey)}" fill="${f}" stroke="${stroke}" ` +
        `stroke-width="${sw}"/>`
      );
    }
    case 'text': {
      const xform = s.rot ? ` transform="rotate(${n(s.rot)} ${n(s.x)} ${n(s.y)})"` : '';
      return (
        `<text x="${n(s.x)}" y="${n(s.y)}" font-size="${n(Math.max(0.6, s.size))}" ` +
        `fill="${stroke}"${xform}>${esc(s.text)}</text>`
      );
    }
  }
}

/** Render a full set of shapes back-to-back. */
export function renderLibShapes(shapes: LibShape[], style: LibShapeStyle): string {
  return shapes.map((s) => renderLibShape(s, style)).join('');
}

/** Three-point circle → SVG arc command pieces. Returns null when collinear. */
export function arcFromPoints(
  sx: number, sy: number,
  mx: number, my: number,
  ex: number, ey: number,
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
  const cross = (mx - sx) * (ey - my) - (my - sy) * (ex - mx);
  const sweep: 0 | 1 = cross > 0 ? 0 : 1;
  const sa = Math.atan2(sy - (sy + uy), sx - (sx + ux));
  const ea = Math.atan2(ey - (sy + uy), ex - (sx + ux));
  const ma = Math.atan2(my - (sy + uy), mx - (sx + ux));
  const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const sweepAngle = norm(ea - sa);
  const midAngle = norm(ma - sa);
  const large: 0 | 1 =
    ((sweepAngle <= Math.PI) === (midAngle <= sweepAngle)) ? 0 : 1;
  return { r, large, sweep };
}

/** Bounding box (lib_symbol local frame) of a shape array. Empty → null. */
export function shapesBBox(shapes: LibShape[]): {
  minX: number; minY: number; maxX: number; maxY: number;
} | null {
  if (shapes.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of shapes) {
    switch (s.kind) {
      case 'rectangle':
        minX = Math.min(minX, s.x1, s.x2);
        minY = Math.min(minY, s.y1, s.y2);
        maxX = Math.max(maxX, s.x1, s.x2);
        maxY = Math.max(maxY, s.y1, s.y2);
        break;
      case 'polyline':
        for (const p of s.points) {
          minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
        }
        break;
      case 'circle':
        minX = Math.min(minX, s.cx - s.r); minY = Math.min(minY, s.cy - s.r);
        maxX = Math.max(maxX, s.cx + s.r); maxY = Math.max(maxY, s.cy + s.r);
        break;
      case 'arc':
        for (const [x, y] of [[s.sx, s.sy], [s.mx, s.my], [s.ex, s.ey]] as const) {
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
        break;
      case 'text':
        minX = Math.min(minX, s.x); minY = Math.min(minY, s.y - s.size);
        maxX = Math.max(maxX, s.x + s.text.length * s.size * 0.6);
        maxY = Math.max(maxY, s.y);
        break;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function n(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(3).replace(/\.?0+$/, '');
}

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
