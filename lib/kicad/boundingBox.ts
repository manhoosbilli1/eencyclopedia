/**
 * Bounding-box ingest helper.
 *
 * Convention: a user can draw a sheet rectangle in KiCad and place a text
 * annotation reading "eencyclopedia" near its top-left corner. On upload, we
 * detect that rectangle and only ingest components/wires/junctions/labels
 * whose anchor sits INSIDE the rectangle. Everything outside is dropped.
 *
 * Lets users keep their full project schematic locally while only sharing
 * a curated sub-circuit. If no labelled rectangle exists, we ingest the
 * whole sheet as before — purely opt-in feature.
 */

import type { KiCadSchematic, SheetRectangle, SheetText } from './parse';

const TAG = 'eencyclopedia';
/** A text anchor counts as "near top-left" if it's within this many mm of the corner. */
const NEAR_CORNER_MM = 25;

export interface BoundingBoxIngestResult {
  matched: boolean;
  /** The rectangle we cropped to (or null when no match). */
  rect: SheetRectangle | null;
  /** Cropped schematic (or the original if no match). */
  schematic: KiCadSchematic;
  /** Counts before/after for the user's consumption. */
  before: { symbols: number; wires: number; junctions: number; labels: number };
  after: { symbols: number; wires: number; junctions: number; labels: number };
}

export function applyBoundingBoxIngest(sch: KiCadSchematic): BoundingBoxIngestResult {
  const before = {
    symbols: sch.symbols.length,
    wires: sch.wires.length,
    junctions: sch.junctions.length,
    labels: sch.labels.length,
  };

  const rect = findTaggedRectangle(sch.sheetRectangles, sch.sheetTexts);
  if (!rect) {
    return { matched: false, rect: null, schematic: sch, before, after: before };
  }

  const inside = (x: number, y: number) =>
    x >= rect.x1 && x <= rect.x2 && y >= rect.y1 && y <= rect.y2;

  const symbols = sch.symbols.filter((s) => inside(s.x, s.y));
  const wires = sch.wires.filter(
    (w) => inside(w.x1, w.y1) && inside(w.x2, w.y2),
  );
  const junctions = sch.junctions.filter((j) => inside(j.x, j.y));
  const labels = sch.labels.filter((l) => inside(l.x, l.y));

  const cropped: KiCadSchematic = {
    ...sch,
    symbols,
    wires,
    junctions,
    labels,
    warnings: [
      ...sch.warnings,
      `Bounding-box ingest matched: kept ${symbols.length}/${sch.symbols.length} components.`,
    ],
  };

  return {
    matched: true,
    rect,
    schematic: cropped,
    before,
    after: {
      symbols: symbols.length,
      wires: wires.length,
      junctions: junctions.length,
      labels: labels.length,
    },
  };
}

function findTaggedRectangle(
  rectangles: SheetRectangle[],
  texts: SheetText[],
): SheetRectangle | null {
  if (rectangles.length === 0) return null;

  // Find a text whose normalised content equals the tag.
  const tagged = texts.filter(
    (t) => t.text.trim().toLowerCase() === TAG,
  );
  if (tagged.length === 0) return null;

  // Pair: rectangle whose top-left corner is closest to a tag text.
  let best: { rect: SheetRectangle; d: number } | null = null;
  for (const rect of rectangles) {
    for (const t of tagged) {
      const dx = t.x - rect.x1;
      const dy = t.y - rect.y1;
      // Tag must be near the top-left (allow slight overshoot to either side).
      if (Math.abs(dx) > NEAR_CORNER_MM || Math.abs(dy) > NEAR_CORNER_MM) continue;
      const d = Math.hypot(dx, dy);
      if (!best || d < best.d) best = { rect, d };
    }
  }
  return best?.rect ?? null;
}
