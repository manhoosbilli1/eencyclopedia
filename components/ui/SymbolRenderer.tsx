'use client';

/**
 * SymbolRenderer — inline SVG preview for a single KiCad lib_id glyph.
 *
 * Uses the same glyph registry as the main render pipeline (lib/kicad/symbols.ts),
 * NOT the lib_symbols-from-file approach (that path is WIP/not integrated).
 *
 * Renders a standalone <svg> that fits the glyph in its viewBox, sized via
 * width/height props. Safe to use in any client component or page.
 */

import { drawSymbol } from '@/lib/kicad/symbols';

interface SymbolRendererProps {
  /** KiCad lib_id, e.g. "Device:R", "Device:LED", "power:GND". */
  libId: string;
  /** Component value (e.g. "10k"). Used by power-rail glyphs for the label. */
  value?: string;
  /** SVG width in pixels. Default 80. */
  width?: number;
  /** SVG height in pixels. Default 80. */
  height?: number;
  /** CSS color applied via `color` property (uses `currentColor`). Default "black". */
  color?: string;
  /** Additional class names for the outer <svg>. */
  className?: string;
}

export default function SymbolRenderer({
  libId,
  value = '',
  width = 80,
  height = 80,
  color = 'black',
  className,
}: SymbolRendererProps) {
  const draw = drawSymbol(libId, value);

  // Build a tight viewBox around the glyph using its bbox half-extents.
  const pad = 2;
  const vbX = -(draw.halfWidth + pad);
  const vbY = -(draw.halfHeight + pad);
  const vbW = (draw.halfWidth + pad) * 2;
  const vbH = (draw.halfHeight + pad) * 2;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      width={width}
      height={height}
      style={{ color }}
      className={className}
      aria-label={`${libId} symbol`}
      role="img"
    >
      <title>{libId}</title>
      {/* eslint-disable-next-line react/no-danger */}
      <g dangerouslySetInnerHTML={{ __html: draw.svg }} />
    </svg>
  );
}
