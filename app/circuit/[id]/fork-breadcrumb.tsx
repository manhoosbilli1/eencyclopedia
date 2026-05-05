/**
 * Fork lineage breadcrumb shown on the circuit detail page.
 *
 * Renders nothing when the circuit has no fork ancestry. Otherwise shows a
 * chain like:   ↰ forked from @alice's "10k pull-up" · root: @alice's "first"
 *
 * This is a server component — it receives the resolved ancestry from the
 * parent server page rather than running its own queries. Keeps the page's
 * single round-trip pattern intact.
 */

import Link from 'next/link';

export interface ForkAncestor {
  id: string;
  title: string;
  ownerUsername: string | null;
}

interface Props {
  parent: ForkAncestor | null;
  root: ForkAncestor | null;
  forkCount: number;
}

export function ForkBreadcrumb({ parent, root, forkCount }: Props) {
  // No lineage and no descendants → render nothing
  if (!parent && forkCount === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
      {parent && (
        <span className="inline-flex items-center gap-1">
          <span aria-hidden>↰</span>
          <span>forked from</span>
          <Link
            href={`/circuit/${parent.id}`}
            className="rounded border border-border bg-muted/30 px-1.5 py-0.5 text-foreground hover:bg-muted"
            title="View parent circuit"
          >
            {parent.ownerUsername ? `@${parent.ownerUsername}'s ` : ''}
            {parent.title}
          </Link>
        </span>
      )}
      {root && (!parent || root.id !== parent.id) && (
        <span className="inline-flex items-center gap-1">
          <span>·</span>
          <span>root</span>
          <Link
            href={`/circuit/${root.id}`}
            className="rounded border border-border bg-muted/30 px-1.5 py-0.5 text-foreground hover:bg-muted"
            title="View original ancestor"
          >
            {root.ownerUsername ? `@${root.ownerUsername}'s ` : ''}
            {root.title}
          </Link>
        </span>
      )}
      {forkCount > 0 && (
        <span className="inline-flex items-center gap-1">
          {(parent !== null || root !== null) && <span>·</span>}
          <span className="rounded border border-border bg-muted/30 px-1.5 py-0.5 text-foreground">
            {forkCount} spinoff{forkCount === 1 ? '' : 's'}
          </span>
        </span>
      )}
    </div>
  );
}
