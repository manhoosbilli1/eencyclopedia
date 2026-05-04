/**
 * BOM panel — shows LCSC pricing for each component in the schematic.
 * Server component: fetches LCSC data at render time (cached 1h).
 */

import { bomLcscLookup } from '@/lib/lcsc/search';

interface BomRow {
  designator: string;
  value: string;
  mpn?: string | null;
}

interface Props {
  rows: BomRow[];
}

export async function BomPanel({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <section className="mt-8 rounded-lg border border-border bg-card p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">BOM / Pricing</h2>
        <p className="mt-3 text-sm text-muted-foreground">No components indexed for this circuit.</p>
      </section>
    );
  }

  const lcscMap = await bomLcscLookup(rows);

  let totalCost: number | null = 0;
  let anyPrices = false;

  for (const [, part] of lcscMap) {
    if (part?.price1 != null) {
      anyPrices = true;
      totalCost = (totalCost ?? 0) + part.price1;
    }
  }
  if (!anyPrices) totalCost = null;

  return (
    <section className="mt-8 rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          BOM / LCSC Pricing
        </h2>
        {totalCost != null && (
          <span className="font-mono text-[11px] text-muted-foreground">
            est. total ${totalCost.toFixed(3)} USD @ qty 1
          </span>
        )}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border font-mono uppercase tracking-wider text-muted-foreground">
              <th className="pb-2 pr-4 text-left font-normal">Ref</th>
              <th className="pb-2 pr-4 text-left font-normal">Value</th>
              <th className="pb-2 pr-4 text-left font-normal">LCSC Part</th>
              <th className="pb-2 pr-4 text-left font-normal">Description</th>
              <th className="pb-2 pr-4 text-right font-normal">Stock</th>
              <th className="pb-2 text-right font-normal">Price (qty 1)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const part = lcscMap.get(row.designator);
              return (
                <tr
                  key={i}
                  className="border-b border-border/50 last:border-0 hover:bg-muted/30"
                >
                  <td className="py-1.5 pr-4 font-mono text-foreground">{row.designator}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{row.value || '—'}</td>
                  <td className="py-1.5 pr-4">
                    {part ? (
                      <a
                        href={part.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-primary hover:underline"
                      >
                        {part.lcsc}
                      </a>
                    ) : (
                      <span className="text-muted-foreground opacity-50">—</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-4 text-muted-foreground">
                    <span className="line-clamp-1 max-w-[180px]">{part?.description ?? '—'}</span>
                  </td>
                  <td className="py-1.5 pr-4 text-right font-mono text-muted-foreground">
                    {part ? (
                      <span className={part.stock > 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'}>
                        {part.stock.toLocaleString()}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    {part?.price1 != null ? (
                      <span>${part.price1.toFixed(4)}</span>
                    ) : (
                      <span className="text-muted-foreground opacity-50">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 font-mono text-[10px] text-muted-foreground opacity-60">
        Prices from LCSC via jlcsearch.tscircuit.com · cached 1h · verify before ordering
      </p>
    </section>
  );
}
