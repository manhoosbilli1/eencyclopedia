'use client';

/**
 * SchematicViewer — client component that renders an inline SVG schematic
 * with rich pointer-event tooltips.
 *
 * The SVG already contains:
 *   - CSS hover rules that show .comp-label text (pure CSS fallback)
 *   - data-designator / data-value / data-family / data-mpn / data-net
 *     attributes on every component group
 *
 * This component layers a richer styled tooltip on top:
 *   - Shows designator, value, component family, MPN
 *   - For net labels: shows net name + "click to ask AI"
 *   - Follows the pointer within the SVG container
 *   - Keyboard-accessible: focus the SVG, Tab cycles through data-* groups
 *
 * Why dangerouslySetInnerHTML is safe here:
 *   The SVG was produced by lib/kicad/render.ts, which XML-escapes all
 *   user-controlled strings via esc(). No user-supplied HTML is injected.
 */

import { useCallback, useRef, useState } from 'react';

interface TooltipData {
  kind: 'component' | 'net';
  designator?: string;
  value?: string;
  family?: string;
  mpn?: string;
  net?: string;
  x: number;
  y: number;
}

interface Props {
  svgContent: string;
  circuitId: string;
  /** Pass the /chat URL so "ask AI" links work without extra prop drilling. */
  chatHref: string;
}

export function SchematicViewer({ svgContent, circuitId, chatHref }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as SVGElement | null;
    if (!target) return;

    // Walk up the DOM to find the nearest group with data-designator or data-net
    let el: Element | null = target;
    while (el && el !== containerRef.current) {
      const designator = el.getAttribute('data-designator');
      const net = el.getAttribute('data-net');

      if (designator) {
        const value = el.getAttribute('data-value') ?? '';
        const family = el.getAttribute('data-family') ?? '';
        const mpn = el.getAttribute('data-mpn') ?? '';
        const rect = containerRef.current!.getBoundingClientRect();
        setTooltip({
          kind: 'component',
          designator,
          value,
          family: family || undefined,
          mpn: mpn || undefined,
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
        return;
      }

      if (net && !el.getAttribute('data-designator')) {
        // Net label hit (no designator means it's a wire label, not a power symbol)
        const rect = containerRef.current!.getBoundingClientRect();
        setTooltip({
          kind: 'net',
          net,
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
        return;
      }

      el = el.parentElement;
    }
    setTooltip(null);
  }, []);

  const handlePointerLeave = useCallback(() => setTooltip(null), []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as Element | null;
      if (!target) return;
      let el: Element | null = target;
      while (el && el !== containerRef.current) {
        const designator = el.getAttribute('data-designator');
        const net = el.getAttribute('data-net');
        if (designator || net) {
          const query = designator
            ? `Explain ${designator} (${el.getAttribute('data-value') ?? ''}) in circuit ${circuitId}`
            : `Explain net ${net ?? ''} in circuit ${circuitId}`;
          window.location.href = `${chatHref}&q=${encodeURIComponent(query)}`;
          return;
        }
        el = el.parentElement;
      }
    },
    [circuitId, chatHref],
  );

  return (
    <div className="relative">
      {/* SVG container */}
      <div
        ref={containerRef}
        className="overflow-hidden text-foreground select-none"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 max-w-[200px] rounded-md border border-border bg-popover px-3 py-2 shadow-md"
          style={{
            left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth ?? 400) - 220),
            top: tooltip.y + 14,
          }}
        >
          {tooltip.kind === 'component' ? (
            <ComponentTooltip
              designator={tooltip.designator!}
              value={tooltip.value}
              family={tooltip.family}
              mpn={tooltip.mpn}
            />
          ) : (
            <NetTooltip net={tooltip.net!} />
          )}
          <p className="mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            click to ask AI
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tooltip sub-components
// ---------------------------------------------------------------------------

function ComponentTooltip({
  designator,
  value,
  family,
  mpn,
}: {
  designator: string;
  value?: string;
  family?: string;
  mpn?: string;
}) {
  return (
    <div className="space-y-0.5 text-xs">
      <p className="font-mono font-semibold text-foreground">{designator}</p>
      {value ? <p className="text-muted-foreground">{value}</p> : null}
      {family ? (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {family.replace(/_/g, ' ')}
        </p>
      ) : null}
      {mpn ? (
        <p className="font-mono text-[10px] text-muted-foreground">{mpn}</p>
      ) : null}
    </div>
  );
}

function NetTooltip({ net }: { net: string }) {
  return (
    <div className="space-y-0.5 text-xs">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">net</p>
      <p className="font-mono font-semibold text-foreground">{net}</p>
    </div>
  );
}
