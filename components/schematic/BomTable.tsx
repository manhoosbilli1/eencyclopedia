'use client';

/**
 * BOM (Bill of Materials) table for the interactive schematic editor.
 * Supports grouping by value+libId, inline cell editing, column sorting,
 * and CSV export.
 */

import { useState, useCallback } from 'react';
import type { EditorComponent } from '@/components/schematic/editorTypes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BomTableProps {
  components: EditorComponent[];
  onClose: () => void;
  onUpdateComponent?: (
    id: string,
    field: 'value' | 'designator' | 'mpn' | 'footprint',
    value: string,
  ) => void;
}

type SortCol = 'refs' | 'value' | 'mpn' | 'footprint' | 'qty';
type SortDir = 'asc' | 'desc';

interface BomRow {
  /** Canonical group key: `${value}|${libId}` */
  groupKey: string;
  /** Joined list of all designators in the group */
  refs: string;
  /** Component IDs in the group — used for inline updates */
  ids: string[];
  value: string;
  libId: string;
  mpn: string;
  footprint: string;
  qty: number;
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function buildBomRows(components: EditorComponent[]): BomRow[] {
  const groups = new Map<string, BomRow>();

  for (const comp of components) {
    const key = `${comp.value}|${comp.libId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.ids.push(comp.id);
      existing.refs = existing.refs ? `${existing.refs}, ${comp.designator}` : comp.designator;
      existing.qty += 1;
      // If mpn / footprint differs across group members, show the first non-empty one
      if (!existing.mpn && comp.mpn) existing.mpn = comp.mpn;
      if (!existing.footprint && comp.footprint) existing.footprint = comp.footprint ?? '';
    } else {
      groups.set(key, {
        groupKey: key,
        refs: comp.designator,
        ids: [comp.id],
        value: comp.value,
        libId: comp.libId,
        mpn: comp.mpn ?? '',
        footprint: comp.footprint ?? '',
        qty: 1,
      });
    }
  }

  return Array.from(groups.values());
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

function sortRows(rows: BomRow[], col: SortCol, dir: SortDir): BomRow[] {
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (col === 'qty') {
      cmp = a.qty - b.qty;
    } else {
      cmp = a[col].localeCompare(b[col], undefined, { sensitivity: 'base', numeric: true });
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function buildCsvBlob(rows: BomRow[]): Blob {
  const header = ['Refs', 'Value', 'MPN', 'Footprint', 'Qty'];
  const escCsv = (v: string) => (v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [r.refs, r.value, r.mpn, r.footprint, String(r.qty)].map(escCsv).join(','),
    ),
  ];
  return new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Editable cell
// ---------------------------------------------------------------------------

interface EditableCellProps {
  value: string;
  onSave: (next: string) => void;
  className?: string;
}

function EditableCell({ value, onSave, className = '' }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = useCallback(() => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }, [draft, value, onSave]);

  if (editing) {
    return (
      <input
        autoFocus
        className={`w-full rounded border border-border bg-background px-1 py-0.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-border ${className}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      title="Click to edit"
      className={`cursor-text select-text rounded px-1 hover:bg-muted/50 ${className}`}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          setDraft(value);
          setEditing(true);
        }
      }}
    >
      {value || <span className="text-muted-foreground/50 italic">—</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Header cell (sortable)
// ---------------------------------------------------------------------------

interface ThProps {
  label: string;
  col: SortCol;
  current: SortCol;
  dir: SortDir;
  onClick: (col: SortCol) => void;
  className?: string;
}

function Th({ label, col, current, dir, onClick, className = '' }: ThProps) {
  const active = current === col;
  return (
    <th
      scope="col"
      className={`select-none whitespace-nowrap border-b border-border bg-card px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground ${className}`}
    >
      <button
        type="button"
        className="flex items-center gap-1"
        onClick={() => onClick(col)}
      >
        {label}
        <span className="ml-0.5 text-[10px]">
          {active ? (dir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// BomTable
// ---------------------------------------------------------------------------

export default function BomTable({ components, onClose, onUpdateComponent }: BomTableProps) {
  const [sortCol, setSortCol] = useState<SortCol>('refs');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const rawRows = buildBomRows(components);
  const rows = sortRows(rawRows, sortCol, sortDir);

  const uniqueParts = rawRows.length;
  const totalComponents = components.length;

  const handleSort = (col: SortCol) => {
    if (col === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const handleCsvExport = () => {
    const blob = buildCsvBlob(rows);
    downloadBlob(blob, 'bom.csv');
  };

  /**
   * When an editable cell is saved, propagate the change to all component IDs
   * that share the same group (they have the same value+libId).
   * For 'value' we update all; for 'mpn'/'footprint' we update all in group too.
   */
  const makeGroupUpdater =
    (row: BomRow, field: 'value' | 'mpn' | 'footprint') => (next: string) => {
      if (!onUpdateComponent) return;
      for (const id of row.ids) {
        onUpdateComponent(id, field, next);
      }
    };

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card shadow-lg">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Bill of Materials</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCsvExport}
            className="rounded border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            Export CSV
          </button>
          <button
            type="button"
            aria-label="Close BOM"
            onClick={onClose}
            className="rounded border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            Close
          </button>
        </div>
      </div>

      {/* Scrollable table */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr>
              <Th label="Ref(s)" col="refs" current={sortCol} dir={sortDir} onClick={handleSort} className="pl-4" />
              <Th label="Value" col="value" current={sortCol} dir={sortDir} onClick={handleSort} />
              <Th label="MPN" col="mpn" current={sortCol} dir={sortDir} onClick={handleSort} />
              <Th label="Footprint" col="footprint" current={sortCol} dir={sortDir} onClick={handleSort} />
              <Th label="Qty" col="qty" current={sortCol} dir={sortDir} onClick={handleSort} className="text-right" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={row.groupKey}
                className={idx % 2 === 0 ? 'bg-background' : 'bg-card'}
              >
                {/* Refs — not directly editable here; designators are edited per component */}
                <td className="border-b border-border/50 py-2 pl-4 pr-3 font-mono text-xs text-muted-foreground">
                  {row.refs}
                </td>
                {/* Value */}
                <td className="border-b border-border/50 px-2 py-2 text-foreground">
                  <EditableCell
                    value={row.value}
                    onSave={makeGroupUpdater(row, 'value')}
                  />
                </td>
                {/* MPN */}
                <td className="border-b border-border/50 px-2 py-2 text-foreground">
                  <EditableCell
                    value={row.mpn}
                    onSave={makeGroupUpdater(row, 'mpn')}
                  />
                </td>
                {/* Footprint */}
                <td className="border-b border-border/50 px-2 py-2 text-foreground">
                  <EditableCell
                    value={row.footprint}
                    onSave={makeGroupUpdater(row, 'footprint')}
                  />
                </td>
                {/* Qty */}
                <td className="border-b border-border/50 py-2 pl-2 pr-4 text-right tabular-nums text-foreground">
                  {row.qty}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  No components yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Count footer */}
      <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
        {uniqueParts} unique part{uniqueParts !== 1 ? 's' : ''}, {totalComponents} total component{totalComponents !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
