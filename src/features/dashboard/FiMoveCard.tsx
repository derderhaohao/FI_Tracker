import { useMemo } from 'react';
import { fiDateMove, monthIndexLabel, MOVE_LABELS } from '@/domain/fiDateMove';
import { useAppData } from '@/app/data';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/cn';

function months(m: number): string {
  const a = Math.abs(m);
  if (a < 0.05) return 'no change';
  const text =
    a >= 1.95 ? `${Math.round(a)} months` : `${a.toFixed(1)} month${a.toFixed(1) === '1.0' ? '' : 's'}`;
  return `${text} ${m > 0 ? 'later' : 'earlier'}`;
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
    <Card className="mb-4" aria-label="Why did my FI date move">
      <CardHeader
        title="Why did my FI date move?"
        description={`Most likely FI date ${monthIndexLabel(move.fromFi)} on ${move.fromDate} → ${monthIndexLabel(move.toFi)} on ${move.toDate}: ${months(move.totalMonths)}.`}
      />
      <CardContent>
        {move.parts ? (
          <ul className="flex flex-col gap-1.5 text-sm">
            {move.parts.map((p) => (
              <li key={p.key} className="grid grid-cols-[9rem_1fr_8rem] items-center gap-2">
                <span>{MOVE_LABELS[p.key]}</span>
                <span className="relative h-2 rounded bg-surface-2" aria-hidden>
                  <span
                    className={cn(
                      'absolute top-0 h-2 rounded',
                      p.months > 0 ? 'left-1/2 bg-critical' : 'right-1/2 bg-good',
                    )}
                    style={{ width: `${(Math.abs(p.months) / max) * 50}%` }}
                  />
                </span>
                <span className={cn('text-right', Math.abs(p.months) < 0.05 && 'text-subtle')}>
                  {months(p.months)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            The FI date was not reached in one of the two months, so it cannot be split.
          </p>
        )}
        <p className="mt-3 text-xs text-subtle">
          Each month that passes moves the date one month later unless saving and markets make up for it. Both
          dates use today's assumptions; changes to them are not tracked over time.
        </p>
      </CardContent>
    </Card>
  );
}
