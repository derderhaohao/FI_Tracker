import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/misc';
import type { PlanStatus } from '@/domain/planStatus';

const TONE: Record<PlanStatus, 'good' | 'warning' | 'critical'> = {
  on_track: 'good',
  watch: 'warning',
  at_risk: 'critical',
};

/** A plan status as a word with an icon, so it never relies on colour alone (UI-22). */
export function StatusBadge({ status, children }: { status: PlanStatus; children: string }) {
  return (
    <Badge
      tone={TONE[status]}
      icon={status === 'on_track' ? <CheckCircle2 aria-hidden /> : <AlertTriangle aria-hidden />}
    >
      {children}
    </Badge>
  );
}
