import { useMemo, useState } from 'react';
import { buildProjectionInput, BASELINE_SPEC } from '@/domain/baseline';
import { runProjection } from '@/domain/projection';
import { sensitivity } from '@/domain/sensitivity';
import { useAppData, assumptionSetFor } from '@/app/data';
import { useUi } from '@/state/ui';
import { AssumptionBadge } from '@/components/AssumptionBadge';
import { PlanHealthCard } from '@/components/PlanHealthCard';
import { Term } from '@/components/ui/term';
import { LineChart } from '@/components/charts/LineChart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Notice, PageHeader, Stat, Table } from '@/components/ui/misc';
import { ValueModeToggle } from '@/components/ValueModeToggle';
import { toMode } from '@/lib/valueMode';
import { dateAfterYears, twd, twdCompact } from '@/lib/format';

export function ProjectionPage() {
  const data = useAppData();
  const { ctx, settings } = data;
  const [setId, setSetId] = useState(data.activeAssumptions.id);
  const [showTable, setShowTable] = useState(false);
  const valueMode = useUi((s) => s.valueMode);
  const assumptions = assumptionSetFor(data, setId);

  const { result, sens } = useMemo(() => {
    const input = buildProjectionInput(data, assumptions, BASELINE_SPEC, ctx);
    return { result: runProjection(input), sens: sensitivity(data, assumptions, BASELINE_SPEC, ctx) };
  }, [data, assumptions, ctx]);
  const rows = toMode(result.rows, valueMode);
  const fiRow = result.fiAge !== undefined ? result.rows[result.fiAge - ctx.startAge] : undefined;

  return (
    <>
      <PageHeader
        title="Projection"
        description="When you arrive if nothing changes: year by year from the latest snapshot to the horizon age, retiring as soon as FI is reached."
        actions={
          <>
            <ValueModeToggle />
            <Select
              aria-label="Assumption set"
              value={setId}
              onChange={(e) => setSetId(e.target.value)}
              className="h-8 w-40"
            >
              {data.assumptionSets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <AssumptionBadge set={assumptions} />
          </>
        }
      />
      <PlanHealthCard
        compact
        note={
          setId !== data.activeAssumptions.id
            ? `The status uses your active assumption set (${data.activeAssumptions.name}); the chart below uses ${assumptions.name}.`
            : 'The chart is the typical path: one future where markets return their typical amount every year. The status counts how often the money lasts across 1,000 simulated futures, so it can be lower even when this line never reaches zero.'
        }
      />
      {ctx.warnings.map((w) => (
        <Notice key={w} tone="warning" className="mb-2">
          {w}
        </Notice>
      ))}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Most likely FI date"
          value={
            result.yearsToFi !== undefined ? dateAfterYears(ctx.asOfDate, result.yearsToFi) : 'Not reached'
          }
          sub={result.fiAge !== undefined ? `Age ${result.fiAge}` : `By age ${settings.horizonAge}`}
        />
        <Stat
          label="Usable investments at FI"
          value={fiRow ? twdCompact(fiRow.liquid) : '—'}
          sub={
            fiRow
              ? `Money needed at ${result.fiAge}: ${twdCompact(fiRow.fiTarget)}. Plus ${twdCompact(fiRow.locked)} locked pension, which unlocks later.`
              : `Money needed today: ${twdCompact(result.rows[0]?.fiTarget ?? 0)}`
          }
        />
        <Stat
          label={`Left at age ${settings.horizonAge}`}
          value={twdCompact(
            valueMode === 'nominal'
              ? result.balanceAtHorizon * (result.rows.at(-1)?.inflationIndex ?? 1)
              : result.balanceAtHorizon,
          )}
          sub={
            result.success
              ? 'Left on the typical path; see the status above for the risk'
              : `Runs out at age ${result.depletionAge} on the typical path`
          }
        />
        <Stat
          label="Overseas income (AMT)"
          value={result.amtAges.length ? `From age ${result.amtAges[0]}` : 'Below threshold'}
          sub="Flags years when overseas dividends may count toward the basic income tax"
        />
      </div>

      <Card className="mb-4">
        <CardHeader
          title="Investable net worth against the FI target"
          description={
            <>
              The <Term k="typicalPath" />. Investable includes locked pension. <Term k="moneyNeeded" /> is
              what usable investments must cover to stop work that year: the FI number plus a{' '}
              <Term k="bridgeFund">bridge fund</Term> until pensions start.
            </>
          }
        />
        <CardContent>
          <LineChart
            ariaLabel="Projected investable net worth and FI target by age"
            data={rows}
            xKey="age"
            tooltipTitle={(r) => `Age ${r.age} · ${r.year}${r.retired ? ' · retired' : ''}`}
            referenceX={
              result.fiAge !== undefined ? { x: result.fiAge, label: `FI at ${result.fiAge}` } : undefined
            }
            series={[
              { key: 'investable', label: 'Investable', slot: 0, area: true },
              { key: 'fiTarget', label: 'Money needed', slot: 1, dashed: true },
              { key: 'totalNetWorth', label: 'Total net worth', slot: 2 },
            ]}
            height={320}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Sensitivity" description="FI date shift under one change at a time." />
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <th>Change</th>
                  <th className="text-right">FI age</th>
                  <th className="text-right">Shift</th>
                </tr>
              </thead>
              <tbody>
                <tr className="font-medium">
                  <td>Base</td>
                  <td className="text-right">{sens.base.fiAge ?? '—'}</td>
                  <td />
                </tr>
                {sens.rows.map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td className="text-right">{r.fiAge ?? 'never'}</td>
                    <td className="text-right">
                      {r.shift === undefined ? '—' : `${r.shift > 0 ? '+' : ''}${r.shift.toFixed(1)} yr`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Inputs used" description="Every output traces back to these." />
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {(
                [
                  ['Start', `${ctx.asOfDate} · age ${ctx.startAge}`],
                  ['Net income now', `${twd(data.baselineInput.annualIncome)}/yr (trailing 12 months)`],
                  ['Spending while working', `${twd(data.baselineInput.currentSpending)}/yr`],
                  [
                    'FI spending',
                    `${twd(data.baselineInput.fiSpending)}/yr (${settings.destination.fiTier} tier)`,
                  ],
                  ['Safe withdrawal rate', `${(data.baselineInput.swr * 100).toFixed(2)}%`],
                  [
                    'Inflation · salary growth',
                    `${(assumptions.inflation * 100).toFixed(1)}% · ${(assumptions.salaryGrowth * 100).toFixed(1)}%`,
                  ],
                  ['FX drift (TWD per USD)', `${(assumptions.fxDrift * 100).toFixed(1)}% a year`],
                  [
                    '勞退 per year',
                    `${twd(data.baselineInput.pension.employer + data.baselineInput.pension.voluntary)} until FI, unlocks at ${data.baselineInput.pension.accessAge}`,
                  ],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b py-1">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right tabular">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Year by year"
          description={
            valueMode === 'real' ? "Today's money (inflation removed)" : 'Future money (with inflation)'
          }
          actions={
            <Button size="sm" variant="outline" onClick={() => setShowTable(!showTable)}>
              {showTable ? 'Hide table' : 'Show table'}
            </Button>
          }
        />
        {showTable && (
          <CardContent>
            <Table className="min-w-max">
              <thead>
                <tr>
                  <th>Age</th>
                  <th>Year</th>
                  <th className="text-right">Liquid</th>
                  <th className="text-right">Locked</th>
                  <th className="text-right">FI target</th>
                  <th className="text-right">Income</th>
                  <th className="text-right">Spending</th>
                  <th className="text-right">Saved</th>
                  <th className="text-right">Withdrawn</th>
                  <th className="text-right">Streams</th>
                  <th className="text-right">Total NW</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.age} className={r.age === result.fiAge ? 'bg-surface-2 font-medium' : undefined}>
                    <td>{r.age}</td>
                    <td>{r.year}</td>
                    <td className="text-right">{twdCompact(r.liquid)}</td>
                    <td className="text-right">{twdCompact(r.locked)}</td>
                    <td className="text-right">{twdCompact(r.fiTarget)}</td>
                    <td className="text-right">{twdCompact(r.income)}</td>
                    <td className="text-right">{twdCompact(r.spending)}</td>
                    <td className="text-right">{twdCompact(r.savings)}</td>
                    <td className="text-right">{twdCompact(r.withdrawal)}</td>
                    <td className="text-right">{twdCompact(r.streamIncome)}</td>
                    <td className="text-right">{twdCompact(r.totalNetWorth)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        )}
      </Card>
    </>
  );
}
