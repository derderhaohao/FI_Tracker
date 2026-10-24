import { HISTORY } from '@/domain/backtest';
import { US_HISTORY_SOURCE } from '@/domain/history/usHistory';
import { useUi } from '@/state/ui';
import { BandChart } from '@/components/charts/BandChart';
import { PLAIN_BAND_LABELS, TECHNICAL_BAND_LABELS } from '@/components/charts/bandLabels';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge, Table } from '@/components/ui/misc';
import { pct, twdCompact } from '@/lib/format';
import { inflationIndex } from '@/lib/valueMode';
import { stopAge, type LabRow } from './model';

/** Past-markets check of the selected scenario (LAB-7, PRD R4). */
export function BacktestCard({ row, slot, advanced }: { row: LabRow; slot: number; advanced: boolean }) {
  const valueMode = useUi((s) => s.valueMode);
  const name = row.name;
  const b = row.backtest;
  const planAge = stopAge(row.result);
  const idx = (k: number) => (valueMode === 'nominal' ? inflationIndex(row.input.inflation, k) : 1);
  const rows = b.ages.map((age, k) => ({
    age,
    p10: b.p10[k] * idx(k),
    p50: b.p50[k] * idx(k),
    p90: b.p90[k] * idx(k),
    band: [b.p10[k] * idx(k), b.p90[k] * idx(k)] as [number, number],
    target: row.fiTargets[k] * idx(k),
  }));
  return (
    <Card className="mt-4">
      <CardHeader
        title={`Past-markets check: ${name}`}
        actions={
          <span className="text-xs text-subtle">A second opinion; the status uses simulated futures</span>
        }
        description={`Replays real US market years: the plan starts once in each year from ${b.firstYear} to ${b.lastYear}${b.wrapped ? ' (sequences wrap to the start of the data)' : ''}. Shares follow US stocks with dividends, bonds follow 10-year Treasuries, inflation follows US prices; cash, property and other keep their assumed return.`}
      />
      <CardContent>
        <div className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <div className="text-muted-foreground">Money lasts</div>
            <div className="text-xl font-semibold">{pct(b.successRate, 0)}</div>
            <div className="text-xs text-subtle">of {b.runs} starting years</div>
          </div>
          <div>
            <div className="text-muted-foreground">
              {advanced ? 'Median FI age' : 'Typical stop-work age'}
            </div>
            <div className="text-xl font-semibold">
              {b.medianFiAge !== undefined ? Math.round(b.medianFiAge) : '—'}
            </div>
            <div className="text-xs text-subtle">
              reach FI in {pct(b.fiRate, 0)} of runs
              {planAge !== undefined &&
                b.medianFiAge !== undefined &&
                Math.round(b.medianFiAge) !== planAge &&
                ` · your plan uses ${planAge}: ${Math.round(b.medianFiAge) < planAge ? 'past US returns were higher than your assumptions' : 'past returns were lower than your assumptions'}`}
            </div>
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
        <BandChart
          data={rows}
          slot={slot}
          labels={
            advanced
              ? TECHNICAL_BAND_LABELS
              : { ...PLAIN_BAND_LABELS, median: 'Typical start year', band: '8 in 10 start years' }
          }
          capAge={70}
        />
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Hardest five start years</summary>
          <Table className="mt-2">
            <thead>
              <tr>
                <th>Start</th>
                <th className="text-right">Reach target / stop age</th>
                <th className="text-right">Lowest spending</th>
                <th className="text-right">Left at the end</th>
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
          year after inflation over this period, more than most forward-looking assumptions, so past markets
          usually look kinder than simulated futures. History is one country's path; it does not repeat
          exactly, and Taiwan equities and TWD have their own history.
        </p>
      </CardContent>
    </Card>
  );
}
