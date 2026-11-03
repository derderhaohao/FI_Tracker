import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/misc';
import { InfoTip } from '@/components/ui/term';
import { STATUS_EXPLAIN, type PlanStatus } from '@/domain/planStatus';
import { t } from '@/i18n';

const TONE: Record<PlanStatus, 'good' | 'warning' | 'critical'> = {
  on_track: 'good',
  watch: 'warning',
  at_risk: 'critical',
};

/**
 * A plan status as a word with an icon, so it never relies on colour alone (UI-22), and a
 * one-line explanation behind it (UX doc, A1).
 */
export function StatusBadge({
  status,
  children,
  explain = true,
}: {
  status: PlanStatus;
  children: string;
  explain?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <Badge
        tone={TONE[status]}
        icon={status === 'on_track' ? <CheckCircle2 aria-hidden /> : <AlertTriangle aria-hidden />}
      >
        {children}
      </Badge>
      {explain && (
        <InfoTip label={t('What “{word}” means', { word: children })}>{STATUS_EXPLAIN[status]}</InfoTip>
      )}
    </span>
  );
}
