'use client';

/**
 * SymbolBrowser — searchable KiCad symbol library panel.
 *
 * Layout: category sidebar (left) + results grid (right), search input at top.
 * Keyboard: arrow keys navigate results, Enter selects, Escape closes.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  CATALOG_CATEGORIES,
  searchCatalog,
} from '@/lib/kicad/symbolCatalog';
import type { CatalogEntry } from '@/lib/kicad/symbolCatalog';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SymbolBrowserProps {
  onPlace: (entry: CatalogEntry) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SymbolBrowser({ onPlace, onClose }: SymbolBrowserProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [focused, setFocused] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const results = searchCatalog(query, category);

  // Reset focused index when results change
  useEffect(() => {
    setFocused(0);
  }, [query, category]);

  // Auto-focus search input on mount
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Scroll focused item into view
  useEffect(() => {
    itemRefs.current[focused]?.scrollIntoView({ block: 'nearest' });
  }, [focused]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocused((f) => Math.min(f + 1, results.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocused((f) => Math.max(f - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const entry = results[focused];
        if (entry) {
          onPlace(entry);
          onClose();
        }
      }
    },
    [results, focused, onPlace, onClose],
  );

  const handleSelect = useCallback(
    (entry: CatalogEntry) => {
      onPlace(entry);
      onClose();
    },
    [onPlace, onClose],
  );

  // Reset itemRefs array length when results change
  itemRefs.current = itemRefs.current.slice(0, results.length);

  return (
    // Outer overlay intercepts keyboard events
    <div
      className="flex h-full flex-col bg-card text-card-foreground"
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-mono text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Symbol Browser
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Close (Esc)"
          aria-label="Close symbol browser"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
            <line x1="1" y1="1" x2="11" y2="11" />
            <line x1="11" y1="1" x2="1" y2="11" />
          </svg>
        </button>
      </div>

      {/* Search input */}
      <div className="border-b border-border px-3 py-2">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <circle cx="7" cy="7" r="5" />
            <line x1="11" y1="11" x2="15" y2="15" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbols…"
            className="w-full rounded border border-border bg-background py-1.5 pl-7 pr-3 font-mono text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            aria-label="Search symbols"
          />
        </div>
      </div>

      {/* Body: categories + results */}
      <div className="flex min-h-0 flex-1">
        {/* Category sidebar */}
        <div className="w-28 shrink-0 overflow-y-auto border-r border-border py-1">
          {CATALOG_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={[
                'w-full px-2 py-1 text-left font-mono text-[10px] transition-colors',
                cat === category
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              ].join(' ')}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Results list */}
        <div
          ref={resultsRef}
          className="flex-1 overflow-y-auto p-2"
          role="listbox"
          aria-label="Symbol results"
        >
          {results.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <span className="font-mono text-xs">No symbols found</span>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {results.map((entry, idx) => (
                <ResultItem
                  key={`${entry.libId}-${idx}`}
                  entry={entry}
                  focused={idx === focused}
                  onSelect={handleSelect}
                  onMouseEnter={() => setFocused(idx)}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer hint */}
      <div className="border-t border-border px-3 py-1.5">
        <span className="font-mono text-[10px] text-muted-foreground">
          {results.length} result{results.length !== 1 ? 's' : ''} · ↑↓ navigate · Enter select · Esc close
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result item
// ---------------------------------------------------------------------------

interface ResultItemProps {
  entry: CatalogEntry;
  focused: boolean;
  onSelect: (entry: CatalogEntry) => void;
  onMouseEnter: () => void;
}

const ResultItem = React.forwardRef<HTMLButtonElement, ResultItemProps>(
  ({ entry, focused, onSelect, onMouseEnter }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        role="option"
        aria-selected={focused}
        onClick={() => onSelect(entry)}
        onMouseEnter={onMouseEnter}
        className={[
          'flex w-full items-start gap-2 rounded px-2 py-1.5 text-left transition-colors',
          focused
            ? 'bg-primary/15 text-foreground outline outline-1 outline-primary/40'
            : 'text-foreground hover:bg-muted',
        ].join(' ')}
      >
        {/* Left: name + description */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] font-semibold leading-tight text-foreground">
              {entry.name}
            </span>
            <span className="shrink-0 rounded-sm bg-muted px-1 py-px font-mono text-[9px] text-muted-foreground">
              {entry.category}
            </span>
          </div>
          <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
            {entry.description}
          </div>
          <div className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground/60">
            {entry.libId}
          </div>
        </div>

        {/* Right: pin count badge */}
        <div className="shrink-0 pt-0.5">
          <span className="rounded border border-border px-1 py-px font-mono text-[9px] text-muted-foreground">
            {entry.pinCount}p
          </span>
        </div>
      </button>
    );
  },
);
ResultItem.displayName = 'ResultItem';
