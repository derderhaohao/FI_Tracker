import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Copy, HelpCircle, Lock, Play, Plus, Trash2 } from 'lucide-react';
import type { Scenario, ScenarioLevers } from '@/domain/entities';
import { MAX_RUNS } from '@/domain/montecarlo/runner';
import { db } from '@/db/db';
import { newId, save } from '@/db/repo';
import { assumptionSetFor, useAppData } from '@/app/data';
import { MAX_COMPARE, useUi } from '@/state/ui';
import { AssumptionBadge } from '@/components/AssumptionBadge';
import { ValueModeToggle } from '@/components/ValueModeToggle';
import { BandChart } from '@/components/charts/BandChart';
import { PLAIN_BAND_LABELS, TECHNICAL_BAND_LABELS } from '@/components/charts/bandLabels';
import { LineChart } from '@/components/charts/LineChart';
import { useChartTheme } from '@/components/charts/theme';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Badge, Notice, PageHeader, Segmented, Table } from '@/components/ui/misc';
import { Term } from '@/components/ui/term';
import { chanceDots, chanceText } from '@/domain/planStatus';
import type { GlossaryParams } from '@/lib/glossary';
import { pct, twdCompact } from '@/lib/format';
import { inflationIndex } from '@/lib/valueMode';
import { ScenarioEditor } from './ScenarioEditor';
import { lockPlanOfRecord, newScenarioDraft } from './actions';
import { BacktestCard } from './BacktestCard';
import { BuyVsRentPanel } from './BuyVsRent';
import { ChecksPanel } from './ChecksPanel';
import { Dots } from './Dots';
import {
  evaluateRow,
  explainDifference,
  nameCheck,
  stopAge,
  stopDate,
  TODAY_ID,
  verdict,
  type LabRow,
} from './model';
import { SaferCard } from './SaferCard';
import { StarterCard, TemplatePicker } from './StarterCard';
import type { TemplateResult } from './templates';
import { signature, useMonteCarlo } from './useMonteCarlo';
import { VerdictCard } from './VerdictCard';

type LabTab = 'scenarios' | 'buyrent';

function LabTabs({ tab, onChange }: { tab: LabTab; onChange: (t: LabTab) => void }) {
  return (
    <Segmented
      label="Lab section"
      value={tab}
      onChange={onChange}
      options={[
        { value: 'scenarios', label: 'Scenarios' },
        { value: 'buyrent', label: 'Buy vs. rent' },
      ]}
    />
  );
}

export function LabPage() {
  const [tab, setTab] = useState<LabTab>('scenarios');
  if (tab === 'buyrent') {
    return (
      <>
        <PageHeader
          title="Strategy Lab"
          description="Is buying a home better than renting and investing the difference?"
          actions={<LabTabs tab={tab} onChange={setTab} />}
        />
        <BuyVsRentPanel />
      </>
    );
  }
  return <ScenarioLab tabs={<LabTabs tab={tab} onChange={setTab} />} />;
}

function ScenarioLab({ tabs }: { tabs: ReactNode }) {
  const data = useAppData();
  const { scenarios, ctx, settings } = data;
  const theme = useChartTheme();
  const {
    selectedScenarioId,
    selectScenario,
    compare,
    toggleCompare,
    setCompare,
    mcRuns,
    setMcRuns,
    mcSeed,
    setMcSeed,
    valueMode,
    labView,
    setLabView,
    labStarter,
    setLabStarter,
  } = useUi();
  const advanced = labView === 'advanced';
  const mc = useMonteCarlo();
  const sorted = useMemo(
    () => [...scenarios].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [scenarios],
  );
  const selectedScenario = sorted.find((s) => s.id === selectedScenarioId);

  useEffect(() => {
    const valid = Object.keys(compare).filter((id) => scenarios.some((s) => s.id === id));
    if (valid.length === 0 && sorted.length > 0) setCompare(sorted.slice(0, 3).map((s) => s.id));
  }, [compare, scenarios, sorted, setCompare]);

  const today = useMemo(() => evaluateRow(data), [data]);
  const compared = useMemo(
    () =>
      sorted
        .filter((s) => s.id in compare)
        .map((s) => ({ ...evaluateRow(data, s), slot: compare[s.id] }))
        .sort((a, b) => a.slot - b.slot),
    [sorted, compare, data],
  );
  const selected: LabRow & { slot: number } = useMemo(() => {
    if (!selectedScenario) return { ...today, slot: 0 };
    return (
      compared.find((c) => c.id === selectedScenario.id) ?? {
        ...evaluateRow(data, selectedScenario),
        slot: 0,
      }
    );
  }, [selectedScenario, compared, today, data]);

  // Simulated futures run automatically for every visible row (PRD R3).
  const jobs = useMemo(() => {
    const rows = [today, ...compared];
    if (!rows.some((r) => r.id === selected.id)) rows.push(selected);
    return rows.map((r) => ({ id: r.id, input: r.input, sig: signature(r.input, mcRuns, mcSeed) }));
  }, [today, compared, selected, mcRuns, mcSeed]);
  const staleJobs = jobs.filter((j) => mc.results[j.id]?.signature !== j.sig);
  const staleKey = staleJobs.map((j) => j.id + j.sig).join(',');
  const { run } = mc;
  useEffect(() => {
    if (!staleKey) return;
    const t = setTimeout(() => void run(staleJobs, mcRuns, mcSeed), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- staleKey captures the jobs
  }, [staleKey, run, mcRuns, mcSeed]);

  const resultFor = (r: LabRow) => mc.results[r.id];
  const fresh = (r: LabRow) => resultFor(r)?.signature === signature(r.input, mcRuns, mcSeed);
  const chanceOf = (r: LabRow) => resultFor(r)?.summary.successRate;

  const params: GlossaryParams = {
    runs: mcRuns,
    horizonAge: selected.input.horizonAge,
    firstYear: selected.backtest.firstYear,
    lastYear: selected.backtest.lastYear,
    fiSpending: selected.input.fiSpending,
    swr: selected.input.swr,
  };

  const addScenario = async (name: string, overrides: ScenarioLevers, events: Scenario['events'] = []) => {
    const draft = { ...newScenarioDraft(data, name), overrides, events };
    await save(db.scenarios, draft);
    selectScenario(draft.id);
    if (Object.keys(compare).length < MAX_COMPARE) toggleCompare(draft.id);
  };
  const fromTemplate = (t: TemplateResult) => addScenario(t.name, t.overrides, t.events);

  const duplicate = async (from?: Scenario) => {
    let draft = newScenarioDraft(data, 'My plan (copy)');
    if (from) {
      const {
        createdAt: _c,
        updatedAt: _u,
        lockedAt: _l,
        lockedProjection: _p,
        ...rest
      } = structuredClone(from);
      draft = { ...rest, id: newId(), name: `${from.name} (copy)`, isPlanOfRecord: false };
    }
    await save(db.scenarios, draft);
    selectScenario(draft.id);
    if (Object.keys(compare).length < MAX_COMPARE) toggleCompare(draft.id);
  };

  const remove = async (s: Scenario) => {
    if (!confirm(`Delete scenario “${s.name}”?`)) return;
    await db.scenarios.delete(s.id);
    if (s.id in compare) toggleCompare(s.id);
    if (selectedScenarioId === s.id) selectScenario(undefined);
  };

  const hasCustom = sorted.some(
    (s) =>
      Object.keys(s.overrides).length > 0 || s.events.length > 0 || s.withdrawalRule.kind !== 'fixed_swr',
  );
  const showStarter = labStarter === 'shown' || (labStarter === 'auto' && !hasCustom);

  const chartList = [today, ...compared];
  const maxLen = Math.max(...chartList.map((c) => c.result.rows.length), 0);
  const chartRows = Array.from({ length: maxLen }, (_, k) => {
    const row: Record<string, number> = { age: ctx.startAge + k };
    for (const c of chartList) {
      const r = c.result.rows[k];
      if (r) row[c.id] = valueMode === 'nominal' ? r.investable * r.inflationIndex : r.investable;
    }
    return row;
  });

  const selectedMc = resultFor(selected);
  const idx = (k: number) => (valueMode === 'nominal' ? inflationIndex(selected.input.inflation, k) : 1);
  const bandRows = selectedMc
    ? selectedMc.summary.ages.map((age, k) => ({
        age,
        p10: selectedMc.summary.p10[k] * idx(k),
        p50: selectedMc.summary.p50[k] * idx(k),
        p90: selectedMc.summary.p90[k] * idx(k),
        band: [selectedMc.summary.p10[k] * idx(k), selectedMc.summary.p90[k] * idx(k)] as [number, number],
        target: selected.fiTargets[k] * idx(k),
        typical: selected.result.investable[k] * idx(k),
      }))
    : [];
  const markers: { age: number; label: string }[] = [];
  const selStop = stopAge(selected.result);
  if (selStop !== undefined) markers.push({ age: selStop, label: 'Stop work' });
  if (selected.input.locked.some((b) => b.pension) || selected.input.pension.employer > 0)
    markers.push({ age: selected.input.pension.accessAge, label: '勞退 unlocks' });
  if (selected.input.laborInsurance)
    markers.push({ age: selected.input.laborInsurance.claimAge, label: '勞保 starts' });

  const todayVerdict = verdict(today, ctx.asOfDate, fresh(today) ? resultFor(today)?.summary : undefined);
  /** Unticked scenarios only need a name in the table. */
  const placeholder = (s: Scenario): LabRow => ({ ...today, id: s.id, name: s.name, scenario: s });
  const rowsInTable: (LabRow & { slot?: number; stored?: Scenario })[] = [
    today,
    ...sorted.map((s) => {
      const c = compared.find((x) => x.id === s.id);
      return c ? { ...c, stored: s } : { ...placeholder(s), stored: s };
    }),
  ];

  return (
    <>
      <PageHeader
        title="Strategy Lab"
        description="Will your plan work, and what would make it safer? Try a what-if and compare it with your plan today."
        actions={
          <>
            {tabs}
            <Segmented
              label="Simple or advanced view"
              value={labView}
              onChange={setLabView}
              options={[
                { value: 'simple', label: 'Simple' },
                { value: 'advanced', label: 'Advanced' },
              ]}
            />
            <ValueModeToggle />
            {!showStarter && (
              <Button size="sm" variant="ghost" onClick={() => setLabStarter('shown')}>
                <HelpCircle aria-hidden /> How this works
              </Button>
            )}
            {advanced && (
              <AssumptionBadge
                set={assumptionSetFor(data, selected.scenario?.assumptionSetId ?? data.activeAssumptions.id)}
              />
            )}
          </>
        }
      />
      <p className="-mt-2 mb-4 text-xs text-muted-foreground">
        {valueMode === 'real'
          ? "All amounts in today's money (inflation removed)."
          : `All amounts in future money, with ${pct(selected.input.inflation, 1)} inflation a year.`}
      </p>

      {mc.error && (
        <Notice tone="critical" className="mb-3">
          Simulations failed: {mc.error}
        </Notice>
      )}

      {showStarter && (
        <StarterCard
          today={today}
          todaySentence={[todayVerdict.stop, todayVerdict.lasts].filter(Boolean).join(' ')}
          onCreate={fromTemplate}
          onDismiss={() => setLabStarter('dismissed')}
        />
      )}

      <VerdictCard
        row={selected}
        mc={selectedMc?.summary}
        stale={!fresh(selected)}
        asOfDate={ctx.asOfDate}
        params={params}
        advanced={advanced}
      />

      <Card className="mb-4">
        <CardHeader
          title="Compare what-ifs"
          description={`Tick up to ${MAX_COMPARE} scenarios. Every one replays the same simulated futures, so differences come from the plan, not from luck.`}
          actions={
            advanced ? (
              <>
                <Select
                  aria-label="Monte Carlo runs"
                  className="h-8 w-32"
                  value={mcRuns}
                  onChange={(e) => setMcRuns(Number(e.target.value))}
                >
                  {[1000, 2000, 5000, MAX_RUNS].map((n) => (
                    <option key={n} value={n}>
                      {n.toLocaleString()} runs
                    </option>
                  ))}
                </Select>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Term k="simulationId" params={params} advanced />
                  <input
                    aria-label="Comparison seed"
                    type="number"
                    className="h-8 w-20 rounded-md border border-input bg-surface px-2 text-right text-sm"
                    value={mcSeed}
                    onChange={(e) =>
                      Number.isFinite(Number(e.target.value)) && setMcSeed(Math.round(Number(e.target.value)))
                    }
                  />
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={mc.running}
                  onClick={() => void mc.run(jobs, mcRuns, mcSeed)}
                >
                  <Play aria-hidden /> {mc.running ? 'Running…' : 'Rerun'}
                </Button>
              </>
            ) : undefined
          }
        />
        <CardContent>
          <Table>
            <thead>
              <tr>
                <th className="w-8" />
                <th className="min-w-48">Scenario</th>
                <th className="text-right">
                  <Term k="stopAge" params={params} advanced={advanced} />
                </th>
                <th className="text-right">
                  <Term k="chanceLasts" params={params} advanced={advanced} />
                </th>
                <th className="text-right">
                  <Term k="pastMarkets" params={params} advanced={advanced} />
                </th>
                <th className="text-right">vs your plan</th>
                {advanced && (
                  <>
                    <th className="text-right">
                      <Term k="stopRange" params={params} advanced />
                    </th>
                    <th className="text-right">
                      <Term k="investAtStop" params={params} advanced />
                    </th>
                    <th className="text-right">
                      <Term k="leftAtHorizon" params={params} advanced />
                    </th>
                  </>
                )}
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {rowsInTable.map((r) => {
                const isToday = r.id === TODAY_ID;
                const s = r.stored;
                const shown = isToday || (s && s.id in compare);
                const m = resultFor(r);
                const chance = shown && fresh(r) ? m?.summary.successRate : undefined;
                const diff =
                  !isToday && shown ? explainDifference(today, r, chanceOf(today), chance) : undefined;
                const warning = !isToday && shown && s ? nameCheck(s.name, today, r) : undefined;
                const age = stopAge(r.result);
                return (
                  <tr key={r.id} className={r.id === selected.id ? 'bg-surface-2' : undefined}>
                    <td>
                      {s && (
                        <input
                          type="checkbox"
                          aria-label={`Compare ${s.name}`}
                          checked={s.id in compare}
                          disabled={!(s.id in compare) && Object.keys(compare).length >= MAX_COMPARE}
                          onChange={() => toggleCompare(s.id)}
                        />
                      )}
                    </td>
                    <td className="max-w-xs min-w-48">
                      <button
                        className="flex items-center gap-2 text-left font-medium hover:underline"
                        onClick={() => selectScenario(isToday ? undefined : r.id)}
                      >
                        <span
                          className="inline-block size-2.5 shrink-0 rounded-full"
                          style={{
                            background: isToday
                              ? theme.axis
                              : r.slot !== undefined && s && s.id in compare
                                ? theme.series[r.slot]
                                : 'transparent',
                          }}
                          aria-hidden
                        />
                        {r.name}
                      </button>
                      {isToday && <div className="text-xs text-subtle">Always uses your latest data</div>}
                      {s?.isPlanOfRecord && (
                        <Badge tone="primary" className="mt-0.5">
                          <Lock className="size-3" aria-hidden /> My plan
                        </Badge>
                      )}
                      {diff?.cause && (
                        <div className="mt-0.5 text-xs text-muted-foreground">{diff.cause}</div>
                      )}
                      {warning && <div className="mt-0.5 text-xs text-warning">{warning}</div>}
                    </td>
                    {shown ? (
                      <>
                        <td className="text-right">
                          {age !== undefined ? (
                            <>
                              {age}
                              <div className="text-xs text-subtle">
                                {stopDate(r.input, r.result, ctx.asOfDate)}
                              </div>
                            </>
                          ) : (
                            'Not reached'
                          )}
                        </td>
                        <td className="text-right">
                          {m ? (
                            <span className={fresh(r) ? undefined : 'text-subtle'}>
                              {pct(m.summary.successRate, 0)}
                              <div>
                                <Dots
                                  small
                                  filled={chanceDots(m.summary.successRate)}
                                  label={chanceText(m.summary.successRate)}
                                />
                              </div>
                            </span>
                          ) : (
                            <span className="text-subtle">…</span>
                          )}
                        </td>
                        <td className="text-right">{pct(r.backtest.successRate, 0)}</td>
                        <td className="text-right whitespace-nowrap">{isToday ? '—' : diff?.short}</td>
                        {advanced && (
                          <>
                            <td className="text-right">
                              {m?.summary.fiAgeP10 !== undefined
                                ? `${Math.round(m.summary.fiAgeP10)}–${Math.round(m.summary.fiAgeP90!)}`
                                : '—'}
                            </td>
                            <td className="text-right">
                              {r.result.netWorthAtFi !== undefined ? twdCompact(r.result.netWorthAtFi) : '—'}
                            </td>
                            <td className="text-right">{twdCompact(r.result.balanceAtHorizon)}</td>
                          </>
                        )}
                      </>
                    ) : (
                      <td colSpan={advanced ? 7 : 4} className="text-right text-subtle">
                        Tick to compare
                      </td>
                    )}
                    <td>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={isToday ? 'Copy your plan today to edit' : `Duplicate ${r.name}`}
                          onClick={() => void duplicate(s)}
                        >
                          <Copy />
                        </Button>
                        {s && (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Delete ${s.name}`}
                            onClick={() => void remove(s)}
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {!showStarter && (
            <div className="mt-4">
              <div className="mb-2 text-sm font-medium">Try a what-if</div>
              <TemplatePicker today={today} onCreate={fromTemplate} />
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => void duplicate()}>
                <Plus aria-hidden /> Blank copy of your plan
              </Button>
            </div>
          )}
          <div className="mt-4">
            <div className="mb-1 text-sm font-medium">
              Investments by age, <Term k="typicalPath" params={params} advanced={advanced} />
            </div>
            <LineChart
              ariaLabel="Investments by scenario"
              data={chartRows}
              xKey="age"
              tooltipTitle={(r) => `Age ${r.age}`}
              series={[
                { key: TODAY_ID, label: today.name, slot: 0, color: theme.axis, dashed: true },
                ...compared.map((c) => ({ key: c.id, label: c.name, slot: c.slot })),
              ]}
              height={280}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          {selected.scenario ? (
            <>
              <CardHeader
                title={`Edit: ${selected.scenario.name}`}
                actions={
                  !selected.scenario.isPlanOfRecord ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void lockPlanOfRecord(data, selected.scenario!)}
                    >
                      <Lock aria-hidden /> Set as my plan
                    </Button>
                  ) : (
                    <Badge tone="primary">My plan since {selected.scenario.lockedAt}</Badge>
                  )
                }
              />
              <CardContent>
                <p className="-mt-2 mb-3 text-xs text-muted-foreground">
                  “Set as my plan” saves this scenario's projection; the Dashboard then tracks your real
                  progress against it.
                </p>
                <ScenarioEditor
                  key={selected.scenario.id}
                  s={selected.scenario}
                  today={today}
                  row={selected}
                  advanced={advanced}
                  params={params}
                />
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader title="Your plan today" />
              <CardContent className="text-sm">
                <p className="text-muted-foreground">
                  This row always follows your latest balances, cash flow and FI budget, so it can't be edited
                  here. To try changes, start a what-if or make a copy.
                </p>
                <Button size="sm" className="mt-3" onClick={() => void duplicate()}>
                  <Copy aria-hidden /> Make a copy to edit
                </Button>
              </CardContent>
            </>
          )}
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader
            title={`Range of futures: ${selected.name}`}
            description={
              advanced && selectedMc
                ? `${selectedMc.summary.runs.toLocaleString()} runs · seed ${selectedMc.summary.seed} · ${Math.round(selectedMc.summary.elapsedMs)} ms${fresh(selected) ? '' : ' · updating'}`
                : 'Investments by age across the simulated futures.'
            }
          />
          <CardContent>
            {selectedMc ? (
              <>
                <BandChart
                  data={bandRows}
                  slot={selected.slot}
                  labels={advanced ? TECHNICAL_BAND_LABELS : PLAIN_BAND_LABELS}
                  capAge={70}
                  markers={markers}
                  shadeRunsOut
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  The band holds 8 in 10 futures: 1 in 10 does worse than its lower edge and 1 in 10 better
                  than its upper edge. The dashed “Money needed” line falls with age because fewer years are
                  left to pay for and pensions start; while your investments stay above it, the rest of the
                  plan is funded.
                </p>
                {selectedMc.summary.minSpendingRatioP50 < 0.999 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    In a typical future your spending is cut to{' '}
                    {pct(selectedMc.summary.minSpendingRatioP50, 0)} of your FI budget at its lowest
                    (withdrawal rule cuts).
                  </p>
                )}
                {advanced && selectedMc.summary.fiAgeDistribution.length > 0 && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-muted-foreground">FI age distribution</summary>
                    <Table className="mt-2">
                      <tbody>
                        {selectedMc.summary.fiAgeDistribution.map((d) => (
                          <tr key={d.age}>
                            <td>Age {d.age}</td>
                            <td className="text-right">{pct(d.share, 1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </details>
                )}
              </>
            ) : (
              <p className="py-10 text-center text-sm text-subtle">Simulating…</p>
            )}
          </CardContent>
        </Card>
      </div>

      <SaferCard
        row={selected}
        chance={fresh(selected) ? chanceOf(selected) : undefined}
        runs={mcRuns}
        seed={mcSeed}
        onSave={(name, overrides) => addScenario(name, overrides, selected.spec.events)}
      />
      <BacktestCard row={selected} slot={selected.slot} advanced={advanced} />
      <ChecksPanel
        row={selected}
        runs={mcRuns}
        setName={assumptionSetFor(data, selected.scenario?.assumptionSetId ?? data.activeAssumptions.id).name}
      />
      <p className="mt-4 text-xs text-subtle">
        Defaults: {settings.horizonAge} is the age your money must last to (Settings). Results are what-ifs,
        not advice.
      </p>
    </>
  );
}
