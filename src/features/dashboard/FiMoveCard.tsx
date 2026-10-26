import { useMemo } from 'react';
import { fiDateMove, monthIndexLabel, MOVE_LABELS } from '@/domain/fiDateMove';
import { useAppData } from '@/app/data';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';

function months(m: number): string {
  const a = Math.abs(m);
  if (a < 0.05) return t('no change');
  const n = a >= 1.95 ? String(Math.round(a)) : a.toFixed(1);
  if (n === '1.0') return m > 0 ? t('1.0 month later') : t('1.0 month earlier');
  return m > 0 ? t('{n} months later', { n }) : t('{n} months earlier', { n });
}

/**
 * "Why did my FI date move?" (product review, Next phase): the change since the previous
 * snapshot, split into a month passing, saving, markets, FX, pay and spending, and the goal.
 */
export function FiMoveCard() {
  const data = useAppData();
  const move = useMemo(() => fiDateMove(data, data.activeAssumptions, data.goalHistory), [data]);
  if (!move || move.fromFi === undefined || move.toFi === undefined || move.totalMonths === undefined)
    return null;
  const max = Math.max(...(move.parts ?? []).map((p) => Math.abs(p.months)), 0.5);
  return (
    <Card className="mt-4" aria-label={t('Why did my FI date move')}>
      <CardHeader
        title={t('Why did my FI date move?')}
        description={t('Most likely FI date {fromFi} on {fromDate} → {toFi} on {toDate}: {totalMonths}.', {
          fromFi: monthIndexLabel(move.fromFi),
          fromDate: move.fromDate,
          toFi: monthIndexLabel(move.toFi),
          toDate: move.toDate,
          totalMonths: months(move.totalMonths),
        })}
      />
      <CardContent>
        {move.parts ? (
          <ul className="flex flex-col gap-1.5 text-sm">
            {move.parts.map((p) => (
              <li key={p.key} className="grid grid-cols-[9rem_1fr_8rem] items-center gap-2">
                <span>{MOVE_LABELS[p.key]}</span>
                <span className="relative h-2 rounded bg-surface-2" aria-hidden>
                  <span
                    className={cn('absolute top-0 h-2 rounded', p.months > 0 ? 'left-1/2' : 'right-1/2')}
                    // Time passing is expected, not an alarm (UI-10): later is amber, earlier green.
                    style={{
                      width: `${(Math.abs(p.months) / max) * 50}%`,
                      background: p.months > 0 ? 'var(--series-4)' : 'var(--good-mark)',
                    }}
                  />
                </span>
                <span
                  className={cn(
                    'text-right',
                    Math.abs(p.months) < 0.05 ? 'text-subtle' : p.months > 0 && 'text-warning',
                  )}
                >
                  {months(p.months)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('The FI date was not reached in one of the two months, so it cannot be split.')}
          </p>
        )}
        <p className="mt-3 text-xs text-subtle">
          {t(
            "Each month that passes moves the date one month later unless saving and markets make up for it. Both dates use today's assumptions; changes to them are not tracked over time.",
          )}
        </p>
      </CardContent>
    </Card>
  );
}
