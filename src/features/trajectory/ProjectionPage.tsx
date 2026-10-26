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
import { Badge, Notice, PageHeader, Segmented, Stat, Table } from '@/components/ui/misc';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { PlaybackView } from './playback/PlaybackView';
import { ValueModeToggle } from '@/components/ValueModeToggle';
import { toMode } from '@/lib/valueMode';
import { dateAfterYears, monthLabel, twd, twdCompact } from '@/lib/format';
import { addMonths } from '@/domain/dates';
import { t } from '@/i18n';

const TIER_LABELS: Record<string, string> = { lean: t('Lean'), full: t('Full'), fat: t('Fat') };

export function ProjectionPage() {
  const data = useAppData();
  const { ctx, settings } = data;
  const [setId, setSetId] = useState(data.activeAssumptions.id);
  const [showTable, setShowTable] = useState(false);
  const [mode, setMode] = useState<'static' | 'play'>(() =>
    window.location.hash.includes('play=1') ? 'play' : 'static',
  );
  const valueMode = useUi((s) => s.valueMode);
  const assumptions = assumptionSetFor(data, setId);

  const { result, sens } = useMemo(() => {
    const input = buildProjectionInput(data, assumptions, BASELINE_SPEC, ctx);
    return { result: runProjection(input), sens: sensitivity(data, assumptions, BASELINE_SPEC, ctx) };
  }, [data, assumptions, ctx]);
  const rows = toMode(result.rows, valueMode);
  const hasLoans = result.rows.some((r) => r.loanPayments > 0);
  const fiRow = result.fiAge !== undefined ? result.rows[result.fiAge - ctx.startAge] : undefined;

  return (
    <>
      <PageHeader
        title={t('Projection')}
        description={
          mode === 'play'
            ? t('Play a story: pick one, add events if you like, and watch your plan month by month.')
            : t(
                'Summary: when you arrive if nothing changes, year by year from the latest snapshot to the horizon age.',
              )
        }
        actions={
          <>
            <Segmented
              label={t('Projection mode')}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'static', label: t('Summary') },
                { value: 'play', label: t('Play a story') },
              ]}
            />
            <ValueModeToggle />
            {/* Play uses the active assumption set, so the picker only applies to the summary. */}
            {mode === 'static' && (
              <>
                <Select
                  aria-label={t('Assumption set')}
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
            )}
          </>
        }
      />
      {mode === 'static' && (
        <PlanHealthCard
          compact
          note={
            setId !== data.activeAssumptions.id
              ? t('The status uses your active assumption set ({name}); the chart below uses {name2}.', {
                  name: data.activeAssumptions.name,
                  name2: assumptions.name,
                })
              : t(
                  'The chart is the typical path: one future where markets return their typical amount every year. The status counts how often the money lasts across 1,000 simulated futures, so it can be lower even when this line never reaches zero.',
                )
          }
        />
      )}
      {mode === 'play' ? (
        <PlaybackView />
      ) : (
        <>
          {ctx.warnings.map((w) => (
            <Notice key={w} tone="warning" className="mb-2">
              {w}
            </Notice>
          ))}

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label={t('Most likely FI date')}
              value={
                result.yearsToFi !== undefined
                  ? dateAfterYears(ctx.asOfDate, result.yearsToFi)
                  : t('Not reached')
              }
              sub={
                result.fiAge !== undefined
                  ? t('Age {fiAge}', { fiAge: result.fiAge })
                  : t('By age {horizonAge}', { horizonAge: settings.horizonAge })
              }
            />
            <Stat
              label={t('Usable investments at FI')}
              value={fiRow ? twdCompact(fiRow.liquid) : '—'}
              sub={
                fiRow
                  ? t(
                      'Money needed at {fiAge}: {fiTarget}. Plus {locked} locked pension, which unlocks later.',
                      {
                        fiAge: result.fiAge,
                        fiTarget: twdCompact(fiRow.fiTarget),
                        locked: twdCompact(fiRow.locked),
                      },
                    )
                  : t('Money needed today: {twdCompact}', {
                      twdCompact: twdCompact(result.rows[0]?.fiTarget ?? 0),
                    })
              }
            />
            <Stat
              label={t('Left at age {horizonAge}', { horizonAge: settings.horizonAge })}
              value={twdCompact(
                valueMode === 'nominal'
                  ? result.balanceAtHorizon * (result.rows.at(-1)?.inflationIndex ?? 1)
                  : result.balanceAtHorizon,
              )}
              sub={
                result.success
                  ? t('Left on the typical path; see the status above for the risk')
                  : t('Runs out at age {depletionAge} on the typical path', {
                      depletionAge: result.depletionAge,
                    })
              }
            />
            <Stat
              label={t('Overseas income (AMT)')}
              // A status, not a number: a chip at body size (UI-12).
              value={
                result.amtAges.length ? (
                  <Badge tone="warning" icon={<AlertTriangle aria-hidden />} className="text-sm">
                    {t('From age {age}', { age: result.amtAges[0] })}
                  </Badge>
                ) : (
                  <Badge tone="good" icon={<CheckCircle2 aria-hidden />} className="text-sm">
                    {t('Below threshold')}
                  </Badge>
                )
              }
              sub={t('Flags years when overseas dividends may count toward the basic income tax')}
            />
          </div>

          <Card className="mb-4">
            <CardHeader
              title={t('Investable net worth against the FI target')}
              description={
                <>
                  {t('The')} <Term k="typicalPath" />
                  {t('. Investable includes locked pension.')} <Term k="moneyNeeded" />{' '}
                  {t('is what usable investments must cover to stop work that year: the FI number plus a')}{' '}
                  <Term k="bridgeFund">{t('bridge fund')}</Term> {t('until pensions start.')}
                </>
              }
            />
            <CardContent>
              <LineChart
                ariaLabel={t('Projected investable net worth and FI target by age')}
                data={rows}
                xKey="age"
                tooltipTitle={(r) =>
                  r.retired
                    ? t('Age {age} · {year} · retired', { age: r.age, year: r.year })
                    : t('Age {age} · {year}', { age: r.age, year: r.year })
                }
                referenceX={
                  result.fiAge !== undefined
                    ? { x: result.fiAge, label: t('FI at {fiAge}', { fiAge: result.fiAge }) }
                    : undefined
                }
                series={[
                  { key: 'investable', label: t('Investable'), slot: 0, area: true },
                  { key: 'fiTarget', label: t('Money needed'), slot: 1, dashed: true },
                  { key: 'totalNetWorth', label: t('Total net worth'), slot: 2 },
                ]}
                height={320}
              />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader
                title={t('Sensitivity')}
                description={t('FI date shift under one change at a time.')}
              />
              <CardContent>
                <Table>
                  <thead>
                    <tr>
                      <th>{t('Change')}</th>
                      <th className="text-right">{t('FI age')}</th>
                      <th className="text-right">{t('Shift')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="font-medium">
                      <td>{t('Base')}</td>
                      <td className="text-right">{sens.base.fiAge ?? '—'}</td>
                      <td />
                    </tr>
                    {sens.rows.map((r) => (
                      <tr key={r.label}>
                        <td>{r.label}</td>
                        <td className="text-right">{r.fiAge ?? t('never')}</td>
                        <td className="text-right">
                          {r.shift === undefined
                            ? '—'
                            : t('{v} yr', { v: `${r.shift > 0 ? '+' : ''}${r.shift.toFixed(1)}` })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader title={t('Inputs used')} description={t('Every output traces back to these.')} />
              <CardContent>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {(
                    [
                      [
                        t('Start'),
                        t('{asOfDate} · age {startAge}', { asOfDate: ctx.asOfDate, startAge: ctx.startAge }),
                      ],
                      [
                        t('Net income now'),
                        t('{annualIncome}/yr (trailing 12 months)', {
                          annualIncome: twd(data.baselineInput.annualIncome),
                        }),
                      ],
                      [
                        ctx.loans.length
                          ? t('Spending while working, loans aside')
                          : t('Spending while working'),
                        t('{amount}/yr', { amount: twd(data.baselineInput.currentSpending) }),
                      ],
                      ...ctx.loans.map(
                        (l) =>
                          [
                            t('Loan · {name}', {
                              name: data.accounts.find((a) => a.id === l.accountId)?.nickname ?? '',
                            }),
                            t('{amount}/mo until {month}', {
                              amount: twd(l.monthly),
                              month: monthLabel(addMonths(l.endMonth, -1)),
                            }),
                          ] as const,
                      ),
                      [
                        t('FI spending'),
                        t('{fiSpending}/yr ({fiTier} tier)', {
                          fiSpending: twd(data.baselineInput.fiSpending),
                          fiTier: TIER_LABELS[settings.destination.fiTier],
                        }),
                      ],
                      [t('Safe withdrawal rate'), `${(data.baselineInput.swr * 100).toFixed(2)}%`],
                      [
                        t('Inflation · salary growth'),
                        `${(assumptions.inflation * 100).toFixed(1)}% · ${(assumptions.salaryGrowth * 100).toFixed(1)}%`,
                      ],
                      [
                        t('FX drift (TWD per USD)'),
                        t('{toFixed}% a year', { toFixed: (assumptions.fxDrift * 100).toFixed(1) }),
                      ],
                      [
                        t('勞退 per year'),
                        t('{twd} until FI, unlocks at {accessAge}', {
                          twd: twd(
                            data.baselineInput.pension.employer + data.baselineInput.pension.voluntary,
                          ),
                          accessAge: data.baselineInput.pension.accessAge,
                        }),
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
              title={t('Year by year')}
              description={
                valueMode === 'real'
                  ? t("Today's money (inflation removed)")
                  : t('Future money (with inflation)')
              }
              actions={
                <Button size="sm" variant="outline" onClick={() => setShowTable(!showTable)}>
                  {showTable ? t('Hide table') : t('Show table')}
                </Button>
              }
            />
            {showTable && (
              <CardContent>
                <Table className="min-w-max">
                  <thead>
                    <tr>
                      <th>{t('Age')}</th>
                      <th>{t('Year')}</th>
                      <th className="text-right">{t('Liquid')}</th>
                      <th className="text-right">{t('Locked')}</th>
                      <th className="text-right">{t('FI target')}</th>
                      <th className="text-right">{t('Income')}</th>
                      <th className="text-right">{t('Spending')}</th>
                      <th className="text-right">{t('Saved')}</th>
                      <th className="text-right">{t('Withdrawn')}</th>
                      {hasLoans && <th className="text-right">{t('Loans')}</th>}
                      <th className="text-right">{t('Streams')}</th>
                      <th className="text-right">{t('Total NW')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.age}
                        className={r.age === result.fiAge ? 'bg-surface-2 font-medium' : undefined}
                      >
                        <td>{r.age}</td>
                        <td>{r.year}</td>
                        <td className="text-right">{twdCompact(r.liquid)}</td>
                        <td className="text-right">{twdCompact(r.locked)}</td>
                        <td className="text-right">{twdCompact(r.fiTarget)}</td>
                        <td className="text-right">{twdCompact(r.income)}</td>
                        <td className="text-right">{twdCompact(r.spending)}</td>
                        <td className="text-right">{twdCompact(r.savings)}</td>
                        <td className="text-right">{twdCompact(r.withdrawal)}</td>
                        {hasLoans && (
                          <td className="text-right">{r.loanPayments ? twdCompact(r.loanPayments) : '—'}</td>
                        )}
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
      )}
    </>
  );
}
