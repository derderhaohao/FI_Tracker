import { Link } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';
import type { AssumptionSet } from '@/domain/entities';
import { pct } from '@/lib/format';

/** Every projection shows the assumption set in use and links to it. */
export function AssumptionBadge({ set }: { set: AssumptionSet }) {
  return (
    <Link
      to="/settings#assumptions"
      className="inline-flex items-center gap-1.5 rounded-md border bg-surface px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
      title="Edit assumptions"
    >
      <SlidersHorizontal className="size-3.5" aria-hidden />
      Assumptions: <span className="font-medium text-foreground">{set.name}</span>
      <span className="text-subtle">· inflation {pct(set.inflation)}</span>
    </Link>
  );
}
