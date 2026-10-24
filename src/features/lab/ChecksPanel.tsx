import { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { ASSET_CLASS_LABELS } from '@/domain/entities';
import { HISTORY } from '@/domain/backtest';
import { US_HISTORY_SOURCE } from '@/domain/history/usHistory';
import { medianReturn } from '@/domain/montecarlo/rng';
import type { ReferenceCheck } from '@/domain/referenceChecks';
import { Card, CardContent } from '@/components/ui/card';
import { Table } from '@/components/ui/misc';
import { pct } from '@/lib/format';
import { assumedRealReturn, historicalRealReturn, type LabRow } from './model';
import { monteCarloWorker } from './useMonteCarlo';

/** Assumptions behind every number, and built-in reference tests (PRD R10). */
export function ChecksPanel({ row, runs, setName }: { row: LabRow; runs: number; setName: string }) {
  const { input } = row;
  const [checks, setChecks] = useState<{ input: object; results: ReferenceCheck[] }>();
  const [error, setError] = useState<string>();
  const load = () => {
    if (checks?.input === input) return;
    setError(undefined);
    monteCarloWorker()
      .checks(input)
      .then((results) => setChecks({ input, results }))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };
  return (
    <Card className="mt-4">
      <CardContent className="p-0">
        <details onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && load()}>
          <summary className="cursor-pointer px-5 py-4 font-semibold">Assumptions and checks</summary>
          <div className="px-5 pb-5">
            <p className="mb-3 text-sm text-muted-foreground">
              Every number above comes from these assumptions (set “{setName}”, editable in Settings). The
              typical path uses each investment's typical yearly return, which is lower than its average
              because ups and downs compound: a year of −20% needs +25% to recover.
            </p>
            <Table>
              <thead>
                <tr>
                  <th>Investment</th>
                  <th className="text-right">Share of new savings</th>
                  <th className="text-right">Average return</th>
                  <th className="text-right">Typical return</th>
                  <th className="text-right">Ups and downs (volatility)</th>
                  <th className="text-right">Fees</th>
                </tr>
              </thead>
              <tbody>
                {input.assets.map((a, i) => {
                  const mean = a.expectedReturn + input.returnShift;
                  return (
                    <tr key={a.assetClass}>
                      <td>{ASSET_CLASS_LABELS[a.assetClass]}</td>
                      <td className="text-right">{pct(input.allocation[i], 0)}</td>
                      <td className="text-right">{pct(mean, 1)}</td>
                      <td className="text-right">{pct(medianReturn(mean, a.volatility), 1)}</td>
                      <td className="text-right">{pct(a.volatility, 1)}</td>
                      <td className="text-right">{pct(a.fee, 2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Your mix, typical year after inflation</dt>
                <dd>{pct(assumedRealReturn(input), 1)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Same mix in past markets after inflation</dt>
                <dd>{pct(historicalRealReturn(input), 1)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Inflation</dt>
                <dd>
                  {pct(input.inflation, 1)} a year (±{pct(input.inflationVolatility, 1)})
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Simulated futures</dt>
                <dd>{runs.toLocaleString()}, lognormal returns, correlated between investments</dd>
              </div>
              <div className="flex justify-between gap-2 sm:col-span-2">
                <dt className="text-muted-foreground">Past markets</dt>
                <dd className="text-right">
                  US stocks, 10-year Treasuries and CPI, {HISTORY[0].year}–{HISTORY.at(-1)!.year} (
                  {US_HISTORY_SOURCE})
                </dd>
              </div>
            </dl>

            <h3 className="mt-5 mb-2 text-sm font-semibold">Reference tests</h3>
            {error && <p className="text-sm text-critical">Checks failed to run: {error}</p>}
            {!checks && !error && <p className="text-sm text-subtle">Running…</p>}
            {checks && (
              <ul className="flex flex-col gap-2">
                {checks.results.map((c) => (
                  <li key={c.name} className="flex items-start gap-2 text-sm">
                    {c.pass ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" aria-hidden />
                    ) : (
                      <XCircle className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden />
                    )}
                    <div>
                      <div className="font-medium">
                        {c.pass ? 'Pass' : 'Fail'}: {c.name}
                      </div>
                      <div className="text-muted-foreground">{c.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
