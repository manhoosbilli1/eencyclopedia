/**
 * symExtract.ts — extract SymbolTemplate objects from a parsed KiCad .kicad_sym
 * (or the lib_symbols block of a .kicad_sch) S-expression tree.
 *
 * NOTE: This file is NOT part of the main parse→normalise→render pipeline.
 * It is used ONLY by `scripts/buildSymbolCache.ts` to build the offline
 * `symbol-cache.json`. For runtime rendering use `lib/kicad/symbols.ts`.
 *
 * The input `ast` is the raw array-based AST produced by `lib/kicad/symParser.ts`
 * (the naive array-form parser), NOT the typed `SExp` from `lib/kicad/sexp.ts`.
 * Both parsers coexist; symParser.ts is simpler and used only here.
 */

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
  id: string; // e.g. "Device:R"
  name: string;
  pins: Pin[];
  graphics: Primitive[];
  bounds: { min: Point; max: Point };
  properties: Record<string, string>;
};

// Opaque type alias: the raw Sexp array form from symParser.ts
type SexpNode = string | SexpNode[];

function toNum(x: string | SexpNode | undefined): number {
  if (typeof x === 'string') return parseFloat(x);
  return 0;
}

function point(x: string | SexpNode | undefined, y: string | SexpNode | undefined): Point {
  return { x: toNum(x), y: toNum(y) };
}

export function extractSymbols(ast: SexpNode): SymbolTemplate[] {
  const symbols: SymbolTemplate[] = [];
  const symbolMap = new Map<string, SexpNode[]>();

  function walk(node: SexpNode) {
    if (!Array.isArray(node)) return;

    if (node[0] === 'symbol' && typeof node[1] === 'string') {
      symbolMap.set(node[1], node as SexpNode[]);
    }

    for (const child of node) walk(child);
  }

  walk(ast);

  let idCounter = 0;
  for (const [name, symbolNode] of symbolMap) {
    const resolved = resolveInheritance(symbolNode, symbolMap);
    const template = extractSingleSymbol(resolved, name, () => String(++idCounter));
    if (template) symbols.push(template);
  }

  return symbols;
}

function resolveInheritance(
  symbolNode: SexpNode[],
  symbolMap: Map<string, SexpNode[]>,
): SexpNode[] {
  const extendsFrom = symbolNode.find(
    (child): child is SexpNode[] => Array.isArray(child) && child[0] === 'extends',
  );
  if (!extendsFrom) return symbolNode;

  const parentName = extendsFrom[1];
  if (typeof parentName !== 'string') return symbolNode;
  const parent = symbolMap.get(parentName);
  if (!parent) return symbolNode;

  const parentResolved = resolveInheritance(parent, symbolMap);

  // Merge: parent base, then child overrides (excluding the 'extends' clause).
  const merged: SexpNode[] = [...parentResolved];
  for (const child of symbolNode) {
    if (Array.isArray(child) && child[0] === 'extends') continue;
    merged.push(child);
  }
  return merged;
}

function extractSingleSymbol(
  symbolNode: SexpNode[],
  name: string,
  nextId: () => string,
): SymbolTemplate | null {
  const pins: Pin[] = [];
  const graphics: Primitive[] = [];
  const properties: Record<string, string> = {};

  for (const child of symbolNode) {
    if (!Array.isArray(child)) continue;
    const tag = child[0];
    if (typeof tag !== 'string') continue;

    if (tag === 'pin') {
      // KiCad pin form:
      //   (pin <electrical-type> <graphic-style>
      //     (at x y rot) (length l)
      //     (name "~" …) (number "1" …))
      // child[1] = electrical-type string, child[2] = graphic-style string
      const electricalType = typeof child[1] === 'string' ? child[1] : '';
      let pname = '';
      let pnum = '';
      let pos: Point = { x: 0, y: 0 };
      let orient = 0;
      let len = 0;

      for (const c of child) {
        if (!Array.isArray(c)) continue;
        const ctag = c[0];
        if (ctag === 'at') {
          pos = point(c[1], c[2]);
          orient = toNum(c[3] as string | undefined);
        }
        if (ctag === 'length') len = toNum(c[1] as string | undefined);
        // KiCad 7+: (name "~" (effects …))  — first arg is the string
        if (ctag === 'name') pname = typeof c[1] === 'string' ? c[1] : '';
        if (ctag === 'number') pnum = typeof c[1] === 'string' ? c[1] : '';
      }

      pins.push({
        id: nextId(),
        name: pname,
        number: pnum,
        position: pos,
        orientation: orient,
        length: len,
        electricalType,
      });
    }

    if (tag === 'polyline') {
      const pts = (child as SexpNode[]).find(
        (c): c is SexpNode[] => Array.isArray(c) && c[0] === 'pts',
      );
      if (pts) {
        for (let i = 1; i < pts.length - 1; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          if (Array.isArray(a) && a[0] === 'xy' && Array.isArray(b) && b[0] === 'xy') {
            graphics.push({
              type: 'line',
              a: point(a[1], a[2]),
              b: point(b[1], b[2]),
            });
          }
        }
      }
    }

    if (tag === 'rectangle') {
      const startNode = (child as SexpNode[]).find(
        (c): c is SexpNode[] => Array.isArray(c) && c[0] === 'start',
      );
      const endNode = (child as SexpNode[]).find(
        (c): c is SexpNode[] => Array.isArray(c) && c[0] === 'end',
      );
      if (startNode && endNode) {
        graphics.push({
          type: 'rect',
          a: point(startNode[1], startNode[2]),
          b: point(endNode[1], endNode[2]),
        });
      }
    }

    if (tag === 'circle') {
      const centerNode = (child as SexpNode[]).find(
        (c): c is SexpNode[] => Array.isArray(c) && c[0] === 'center',
      );
      const radiusNode = (child as SexpNode[]).find(
        (c): c is SexpNode[] => Array.isArray(c) && c[0] === 'radius',
      );
      if (centerNode && radiusNode) {
        graphics.push({
          type: 'circle',
          c: point(centerNode[1], centerNode[2]),
          r: toNum(radiusNode[1] as string | undefined),
        });
      }
    }

    if (tag === 'arc') {
      const startNode = (child as SexpNode[]).find(
        (c): c is SexpNode[] => Array.isArray(c) && c[0] === 'start',
      );
      const endNode = (child as SexpNode[]).find(
        (c): c is SexpNode[] => Array.isArray(c) && c[0] === 'end',
      );
      if (startNode && endNode) {
        graphics.push({
          type: 'arc',
          a: point(startNode[1], startNode[2]),
          b: point(endNode[1], endNode[2]),
          angle: 180, // placeholder
        });
      }
    }

    if (tag === 'text' && typeof child[1] === 'string') {
      const atNode = (child as SexpNode[]).find(
        (c): c is SexpNode[] => Array.isArray(c) && c[0] === 'at',
      );
      const effectsNode = (child as SexpNode[]).find(
        (c): c is SexpNode[] => Array.isArray(c) && c[0] === 'effects',
      );
      let pos: Point = { x: 0, y: 0 };
      let size = 1;
      if (atNode) {
        pos = point(atNode[1], atNode[2]);
      }
      if (effectsNode) {
        const fontNode = effectsNode.find(
          (e): e is SexpNode[] => Array.isArray(e) && e[0] === 'font',
        );
        if (fontNode) {
          const sizeNode = (fontNode as SexpNode[]).find(
            (f): f is SexpNode[] => Array.isArray(f) && f[0] === 'size',
          );
          if (sizeNode) size = toNum(sizeNode[1] as string | undefined);
        }
      }
      graphics.push({
        type: 'text',
        text: child[1],
        position: pos,
        size,
        orientation: 0,
      });
    }

    if (tag === 'property' && typeof child[1] === 'string' && typeof child[2] === 'string') {
      properties[child[1]] = child[2];
    }
  }

  const bounds = computeBounds(pins, graphics);

  return {
    id: name,
    name,
    pins,
    graphics,
    bounds,
    properties,
  };
}

function computeBounds(
  pins: Pin[],
  graphics: Primitive[],
): { min: Point; max: Point } {
  const pts: Point[] = [];

  for (const p of pins) pts.push(p.position);
  for (const g of graphics) {
    if (g.type === 'line') {
      pts.push(g.a, g.b);
    } else if (g.type === 'rect') {
      pts.push(g.a, g.b);
    } else if (g.type === 'circle') {
      pts.push(
        { x: g.c.x - g.r, y: g.c.y - g.r },
        { x: g.c.x + g.r, y: g.c.y + g.r },
      );
    } else if (g.type === 'arc') {
      pts.push(g.a, g.b);
    } else if (g.type === 'text') {
      pts.push(g.position);
    }
  }

  if (pts.length === 0) return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);

  return {
    min: { x: Math.min(...xs), y: Math.min(...ys) },
    max: { x: Math.max(...xs), y: Math.max(...ys) },
  };
}
