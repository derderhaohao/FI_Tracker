import { Link } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';
import type { AssumptionSet } from '@/domain/entities';
import { pct } from '@/lib/format';
import { t } from '@/i18n';

/** Every projection shows the assumption set in use and links to it. */
export function AssumptionBadge({ set }: { set: AssumptionSet }) {
  return (
    <Link
      to="/settings/assumptions"
      className="inline-flex items-center gap-1.5 rounded-md border bg-surface px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
      title={t('Edit assumptions')}
    >
      <SlidersHorizontal className="size-3.5" aria-hidden />
      {t('Assumptions:')} <span className="font-medium text-foreground">{set.name}</span>
      <span className="text-subtle">{t('· inflation {inflation}', { inflation: pct(set.inflation) })}</span>
    </Link>
  );
}
