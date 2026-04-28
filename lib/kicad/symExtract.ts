// /lib/kicad/symExtract.ts
import { v4 as uuid } from 'uuid';

export type Point = { x: number; y: number };

export type Primitive =
  | { type: 'line'; a: Point; b: Point }
  | { type: 'rect'; a: Point; b: Point }
  | { type: 'circle'; c: Point; r: number }
  | { type: 'arc'; a: Point; b: Point; angle: number }
  | { type: 'text'; text: string; position: Point; size: number; orientation: number };

export type Pin = {
  id: string;
  name: string;
  number: string;
  position: Point;
  orientation: number;
  length: number;
  electricalType: string;
};

export type SymbolTemplate = {
  id: string;              // e.g. "Device:R"
  name: string;
  pins: Pin[];
  graphics: Primitive[];
  bounds: { min: Point; max: Point };
  properties: { [key: string]: string }; // for text fields
};

function num(x: any) {
  return parseFloat(x);
}

function point(x: any, y: any): Point {
  return { x: num(x), y: num(y) };
}

export function extractSymbols(ast: any): SymbolTemplate[] {
  const symbols: SymbolTemplate[] = [];
  const symbolMap = new Map<string, any>();

  function walk(node: any) {
    if (!Array.isArray(node)) return;

    if (node[0] === 'symbol') {
      const name = node[1];
      const symbolNode = node;
      symbolMap.set(name, symbolNode);
    }

    node.forEach(walk);
  }

  walk(ast);

  // Now process symbols, resolving inheritance
  for (const [name, symbolNode] of symbolMap) {
    const resolved = resolveInheritance(symbolNode, symbolMap);
    const template = extractSingleSymbol(resolved, name);
    if (template) symbols.push(template);
  }

  return symbols;
}

function resolveInheritance(symbolNode: any, symbolMap: Map<string, any>): any {
  const extendsFrom = symbolNode.find((child: any) => Array.isArray(child) && child[0] === 'extends');
  if (!extendsFrom) return symbolNode;

  const parentName = extendsFrom[1];
  const parent = symbolMap.get(parentName);
  if (!parent) return symbolNode; // or throw error

  const parentResolved = resolveInheritance(parent, symbolMap);

  // Merge: parent properties first, then child overrides
  const merged = [...parentResolved];
  for (const child of symbolNode) {
    if (Array.isArray(child) && child[0] === 'extends') continue;
    // For simplicity, just append child elements, assuming no conflicts
    merged.push(child);
  }

  return merged;
}

function extractSingleSymbol(symbolNode: any, name: string): SymbolTemplate | null {
  const pins: Pin[] = [];
  const graphics: Primitive[] = [];
  const properties: { [key: string]: string } = {};

  for (const child of symbolNode) {
    if (!Array.isArray(child)) continue;

    if (child[0] === 'pin') {
      let pname = '', pnum = '', pos: Point = { x: 0, y: 0 }, orient = 0, len = 0, etype = '';

      for (const c of child) {
        if (!Array.isArray(c)) continue;

        if (c[0] === 'at') {
          pos = point(c[1], c[2]);
          orient = num(c[3] || 0);
        }
        if (c[0] === 'length') len = num(c[1]);
        if (c[0] === 'name') pname = c[1];
        if (c[0] === 'number') pnum = c[1];
        if (c[0] === 'type') etype = c[1];
      }

      pins.push({
        id: uuid(),
        name: pname,
        number: pnum,
        position: pos,
        orientation: orient,
        length: len,
        electricalType: etype
      });
    }

    if (child[0] === 'polyline') {
      const pts = child.find((c: any) => Array.isArray(c) && c[0] === 'pts');
      if (pts) {
        for (let i = 1; i < pts.length - 1; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          if (a[0] === 'xy' && b[0] === 'xy') {
            graphics.push({
              type: 'line',
              a: point(a[1], a[2]),
              b: point(b[1], b[2])
            });
          }
        }
      }
    }

    if (child[0] === 'rectangle') {
      const start = child.find((c: any) => Array.isArray(c) && c[0] === 'start');
      const end = child.find((c: any) => Array.isArray(c) && c[0] === 'end');
      if (start && end) {
        graphics.push({
          type: 'rect',
          a: point(start[1], start[2]),
          b: point(end[1], end[2])
        });
      }
    }

    if (child[0] === 'circle') {
      const center = child.find((c: any) => Array.isArray(c) && c[0] === 'center');
      const radius = child.find((c: any) => Array.isArray(c) && c[0] === 'radius');
      if (center && radius) {
        graphics.push({
          type: 'circle',
          c: point(center[1], center[2]),
          r: num(radius[1])
        });
      }
    }

    if (child[0] === 'arc') {
      const start = child.find((c: any) => Array.isArray(c) && c[0] === 'start');
      const mid = child.find((c: any) => Array.isArray(c) && c[0] === 'mid');
      const end = child.find((c: any) => Array.isArray(c) && c[0] === 'end');
      if (start && mid && end) {
        // For simplicity, approximate arc as line from start to end, angle from mid
        const angle = 180; // placeholder, need to calculate
        graphics.push({
          type: 'arc',
          a: point(start[1], start[2]),
          b: point(end[1], end[2]),
          angle: angle
        });
      }
    }

    if (child[0] === 'text') {
      const text = child[1];
      const at = child.find((c: any) => Array.isArray(c) && c[0] === 'at');
      const effects = child.find((c: any) => Array.isArray(c) && c[0] === 'effects');
      let pos: Point = { x: 0, y: 0 }, size = 1, orient = 0;
      if (at) {
        pos = point(at[1], at[2]);
        orient = num(at[3] || 0);
      }
      if (effects) {
        const font = effects.find((e: any) => Array.isArray(e) && e[0] === 'font');
        if (font) {
          const sizeArr = font.find((f: any) => Array.isArray(f) && f[0] === 'size');
          if (sizeArr) size = num(sizeArr[1]);
        }
      }
      graphics.push({
        type: 'text',
        text: text,
        position: pos,
        size: size,
        orientation: orient
      });
    }

    if (child[0] === 'property') {
      const key = child[1];
      const value = child[2];
      properties[key] = value;
    }
  }

  const bounds = computeBounds(pins, graphics);

  return {
    id: name,
    name,
    pins,
    graphics,
    bounds,
    properties
  };
}

function computeBounds(pins: Pin[], graphics: Primitive[]) {
  const pts: Point[] = [];

  pins.forEach(p => pts.push(p.position));
  graphics.forEach(g => {
    if (g.type === 'line') {
      pts.push(g.a, g.b);
    } else if (g.type === 'rect') {
      pts.push(g.a, g.b);
    } else if (g.type === 'circle') {
      pts.push({ x: g.c.x - g.r, y: g.c.y - g.r }, { x: g.c.x + g.r, y: g.c.y + g.r });
    } else if (g.type === 'arc') {
      pts.push(g.a, g.b);
    } else if (g.type === 'text') {
      pts.push(g.position);
    }
  });

  if (pts.length === 0) return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };

  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);

  return {
    min: { x: Math.min(...xs), y: Math.min(...ys) },
    max: { x: Math.max(...xs), y: Math.max(...ys) }
  };
}