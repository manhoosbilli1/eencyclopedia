'use client';

/**
 * LcscPeek — inline dropdown card that searches jlcsearch.tscircuit.com for
 * LCSC component matches and lets the user pick one to populate the MPN field.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types matching the jlcsearch API response
// ---------------------------------------------------------------------------

interface LcscPrice {
  price: string;
  [key: string]: unknown;
}

interface LcscComponent {
  lcsc_part_number: string;
  mfr_part_number: string;
  description: string;
  stock: number;
  price: LcscPrice[] | null;
  datasheet_url?: string;
}

interface LcscApiResponse {
  components: LcscComponent[];
  error?: string;
}

export interface LcscPeekProps {
  /** Pre-filled search term (mpn or value). Empty string means manual entry. */
  query: string;
  /** Called when the user picks a result: passes the LCSC part number and description. */
  onSelect: (mpn: string, description: string) => void;
  /** Called when the card should be closed. */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LCSC_API = 'https://jlcsearch.tscircuit.com/api/search';

function lowestPrice(prices: LcscPrice[] | null): string {
  if (!prices || prices.length === 0) return '—';
  const nums = prices.map((p) => parseFloat(p.price)).filter((n) => !isNaN(n));
  if (nums.length === 0) return '—';
  return `¥${Math.min(...nums).toFixed(4)}`;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// ---------------------------------------------------------------------------
// LcscPeek
// ---------------------------------------------------------------------------

export default function LcscPeek({ query: initialQuery, onSelect, onClose }: LcscPeekProps) {
  const [manualQuery, setManualQuery] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [results, setResults] = useState<LcscComponent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-search on mount if there is an initial query
  useEffect(() => {
    if (initialQuery.trim()) {
      runSearch(initialQuery.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setActiveQuery(q.trim());
    setLoading(true);
    setError(null);
    setSearched(false);
    try {
      const url = `${LCSC_API}?q=${encodeURIComponent(q.trim())}&limit=5&full=true`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: LcscApiResponse = await res.json() as LcscApiResponse;
      if (data.error) throw new Error(data.error);
      setResults(data.components ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualQuery.trim()) runSearch(manualQuery.trim());
  };

  return (
    <div
      ref={containerRef}
      className="absolute z-50 mt-1 w-[480px] max-w-[90vw] rounded-lg border border-border bg-card shadow-xl"
      role="dialog"
      aria-label="LCSC component search"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold text-foreground">LCSC Lookup</span>
        <button
          type="button"
          aria-label="Close LCSC lookup"
          onClick={onClose}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 border-b border-border px-3 py-2">
        <input
          type="text"
          value={manualQuery}
          onChange={(e) => setManualQuery(e.target.value)}
          placeholder="Search MPN, value, or keyword…"
          className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-border"
        />
        <button
          type="submit"
          disabled={loading || !manualQuery.trim()}
          className="shrink-0 rounded border border-border bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          Search
        </button>
      </form>

      {/* Body */}
      <div className="max-h-72 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
            {/* Spinner via CSS border trick — no external deps */}
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-border border-t-foreground" />
            Searching LCSC for &ldquo;{activeQuery}&rdquo;&hellip;
          </div>
        )}

        {!loading && error && (
          <div className="px-3 py-4 text-xs text-destructive">
            Error: {error}
          </div>
        )}

        {!loading && searched && results.length === 0 && !error && (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            No results for &ldquo;{activeQuery}&rdquo;. Try a different search term above.
          </div>
        )}

        {!loading && results.length > 0 && (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="sticky top-0 bg-card">
                <th className="border-b border-border px-3 py-1.5 text-left font-semibold text-muted-foreground">LCSC#</th>
                <th className="border-b border-border px-2 py-1.5 text-left font-semibold text-muted-foreground">MPN</th>
                <th className="border-b border-border px-2 py-1.5 text-left font-semibold text-muted-foreground">Description</th>
                <th className="border-b border-border px-2 py-1.5 text-right font-semibold text-muted-foreground">Stock</th>
                <th className="border-b border-border px-2 py-1.5 text-right font-semibold text-muted-foreground">Price</th>
                <th className="border-b border-border px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {results.map((r, idx) => (
                <tr
                  key={r.lcsc_part_number}
                  className={idx % 2 === 0 ? 'bg-background' : 'bg-card'}
                >
                  <td className="px-3 py-1.5 font-mono text-foreground">
                    <span className="inline-flex items-center gap-1">
                      {r.lcsc_part_number}
                      {r.datasheet_url && (
                        <a
                          href={r.datasheet_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open datasheet"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Datasheet for ${r.lcsc_part_number}`}
                        >
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path
                              d="M5 2H2a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V7M8 1h3m0 0v3m0-3L5.5 6.5"
                              stroke="currentColor"
                              strokeWidth="1.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </a>
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-foreground">
                    {truncate(r.mfr_part_number, 18)}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {truncate(r.description, 40)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-foreground">
                    {r.stock.toLocaleString()}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-foreground">
                    {lowestPrice(r.price)}
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => onSelect(r.lcsc_part_number, r.description)}
                      className="whitespace-nowrap rounded border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      Use
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Initial empty state (before any search) */}
        {!loading && !searched && !error && (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            {initialQuery.trim()
              ? 'Loading…'
              : 'Enter a search term above to look up LCSC parts.'}
          </div>
        )}
      </div>
    </div>
  );
}
