import type { BacktestSummary } from '@/domain/backtest';
import { HISTORY } from '@/domain/backtest';
import { US_HISTORY_SOURCE } from '@/domain/history/usHistory';
import { useUi } from '@/state/ui';
import { BandChart } from '@/components/charts/BandChart';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge, Table } from '@/components/ui/misc';
import { pct, twdCompact } from '@/lib/format';
import { inflationIndex } from '@/lib/valueMode';
import type { Evaluated } from './actions';

/** Historical backtest of the selected scenario (LAB-7). */
export function BacktestCard({
  name,
  evaluation,
}: {
  name: string;
  evaluation: Evaluated & { slot: number; backtest: BacktestSummary };
}) {
  const valueMode = useUi((s) => s.valueMode);
  const b = evaluation.backtest;
  const idx = (k: number) => (valueMode === 'nominal' ? inflationIndex(evaluation.input.inflation, k) : 1);
  const rows = b.ages.map((age, k) => ({
    age,
    p10: b.p10[k] * idx(k),
    p50: b.p50[k] * idx(k),
    p90: b.p90[k] * idx(k),
    band: [b.p10[k] * idx(k), b.p90[k] * idx(k)] as [number, number],
    target: evaluation.fiTargets[k] * idx(k),
  }));
  return (
    <Card className="mt-4">
      <CardHeader
        title={`Historical backtest: ${name}`}
        description={`Replays real US market years: one run per starting year, ${b.firstYear}–${b.lastYear}${b.wrapped ? ' (sequences wrap to the start of the data)' : ''}. Equities follow US stocks with dividends, bonds follow 10-year Treasuries, inflation follows US CPI; cash, property and other keep their assumed real return.`}
      />
      <CardContent>
        <div className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <div className="text-muted-foreground">Money lasts</div>
            <div className="text-xl font-semibold">{pct(b.successRate, 0)}</div>
            <div className="text-xs text-subtle">of {b.runs} starting years</div>
          </div>
          <div>
            <div className="text-muted-foreground">Median FI age</div>
            <div className="text-xl font-semibold">
              {b.medianFiAge !== undefined ? Math.round(b.medianFiAge) : '—'}
            </div>
            <div className="text-xs text-subtle">reach FI in {pct(b.fiRate, 0)} of runs</div>
          </div>
          <div className="col-span-2">
            <div className="text-muted-foreground">Hardest starting years</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {b.worst.map((w) => (
                <Badge key={w.startYear} tone={w.success ? 'neutral' : 'critical'}>
                  {w.startYear}:{' '}
                  {w.success ? `${twdCompact(w.balanceAtHorizon)} left` : `runs out at ${w.depletionAge}`}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <BandChart data={rows} slot={evaluation.slot} />
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Worst five starting years</summary>
          <Table className="mt-2">
            <thead>
              <tr>
                <th>Start</th>
                <th className="text-right">FI / retire age</th>
                <th className="text-right">Lowest spending</th>
                <th className="text-right">Left at horizon</th>
              </tr>
            </thead>
            <tbody>
              {b.worst.map((w) => (
                <tr key={w.startYear}>
                  <td>{w.startYear}</td>
                  <td className="text-right">
                    {w.fiAge ?? '—'} / {w.retireAge ?? '—'}
                  </td>
                  <td className="text-right">{pct(w.minSpendingRatio, 0)}</td>
                  <td className="text-right">
                    {w.success ? twdCompact(w.balanceAtHorizon) : `ran out at ${w.depletionAge}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </details>
        <p className="mt-2 text-xs text-subtle">
          Data {HISTORY[0].year}–{HISTORY.at(-1)!.year}: {US_HISTORY_SOURCE}. US stocks returned about 6.7% a
          year after inflation over this period, more than most forward-looking assumptions, so the backtest
          is usually kinder than Monte Carlo. History is one country's path; it does not repeat exactly, and
          Taiwan equities and TWD have their own history.
        </p>
      </CardContent>
    </Card>
  );
}
