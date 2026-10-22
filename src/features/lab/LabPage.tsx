import { useEffect, useMemo } from 'react';
import { Copy, Lock, Play, Plus, Trash2 } from 'lucide-react';
import type { Scenario } from '@/domain/entities';
import { MAX_RUNS } from '@/domain/montecarlo/runner';
import { db } from '@/db/db';
import { newId, save } from '@/db/repo';
import { assumptionSetFor, useAppData } from '@/app/data';
import { MAX_COMPARE, useUi } from '@/state/ui';
import { AssumptionBadge } from '@/components/AssumptionBadge';
import { ValueModeToggle } from '@/components/ValueModeToggle';
import { BandChart } from '@/components/charts/BandChart';
import { LineChart } from '@/components/charts/LineChart';
import { useChartTheme } from '@/components/charts/theme';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Badge, EmptyState, Notice, PageHeader, Table } from '@/components/ui/misc';
import { dateAfterYears, pct, twdCompact } from '@/lib/format';
import { inflationIndex } from '@/lib/valueMode';
import { ScenarioEditor } from './ScenarioEditor';
import { evaluate, lockPlanOfRecord, newScenarioDraft } from './actions';
import { signature, useMonteCarlo } from './useMonteCarlo';

export function LabPage() {
  const data = useAppData();
  const { scenarios, ctx } = data;
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
  } = useUi();
  const mc = useMonteCarlo();
  const sorted = useMemo(
    () => [...scenarios].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [scenarios],
  );
  const selected = sorted.find((s) => s.id === selectedScenarioId) ?? sorted[0];

  useEffect(() => {
    const valid = Object.keys(compare).filter((id) => scenarios.some((s) => s.id === id));
    if (valid.length === 0 && sorted.length > 0) setCompare(sorted.slice(0, 3).map((s) => s.id));
  }, [compare, scenarios, sorted, setCompare]);

  const compared = useMemo(
    () =>
      sorted
        .filter((s) => s.id in compare)
        .map((s) => ({ ...evaluate(data, s), slot: compare[s.id] }))
        .sort((a, b) => a.slot - b.slot),
    [sorted, compare, data],
  );

  if (sorted.length === 0) {
    return (
      <>
        <PageHeader title="Strategy Lab" description="Test alternatives against the same real data." />
        <EmptyState title="No scenarios yet">
          A scenario is the baseline plus named overrides: savings rate, income changes, spending, allocation,
          FI age, one-off events and part-time income.
          <div className="mt-4">
            <Button
              onClick={async () => {
                const s = await save(db.scenarios, newScenarioDraft(data, 'Baseline'));
                selectScenario(s.id);
              }}
            >
              <Plus aria-hidden /> Create a baseline scenario
            </Button>
          </div>
        </EmptyState>
      </>
    );
  }

  const create = async (from?: Scenario) => {
    let draft = newScenarioDraft(data, `Scenario ${sorted.length + 1}`);
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

  const runAll = () =>
    void mc.run(
      compared.map((c) => ({ id: c.scenario.id, input: c.input })),
      mcRuns,
      mcSeed,
    );

  const maxLen = Math.max(...compared.map((c) => c.result.rows.length), 0);
  const chartRows = Array.from({ length: maxLen }, (_, k) => {
    const row: Record<string, number> = { age: ctx.startAge + k };
    for (const c of compared) {
      const r = c.result.rows[k];
      if (r) row[c.scenario.id] = valueMode === 'nominal' ? r.investable * r.inflationIndex : r.investable;
    }
    return row;
  });

  const selectedEval = compared.find((c) => c.scenario.id === selected.id) ?? {
    ...evaluate(data, selected),
    slot: 0,
  };
  const selectedMc = mc.results[selected.id];
  const selectedMcFresh =
    selectedMc && selectedMc.signature === signature(selectedEval.input, mcRuns, mcSeed);
  const idx = (k: number) => (valueMode === 'nominal' ? inflationIndex(selectedEval.input.inflation, k) : 1);
  const bandRows = selectedMc
    ? selectedMc.summary.ages.map((age, k) => ({
        age,
        p10: selectedMc.summary.p10[k] * idx(k),
        p50: selectedMc.summary.p50[k] * idx(k),
        p90: selectedMc.summary.p90[k] * idx(k),
        band: [selectedMc.summary.p10[k] * idx(k), selectedMc.summary.p90[k] * idx(k)] as [number, number],
        target: selectedEval.fiTargets[k] * idx(k),
      }))
    : [];

  return (
    <>
      <PageHeader
        title="Strategy Lab"
        description="A scenario is the baseline plus named overrides. Compare up to five side by side, then test them with Monte Carlo."
        actions={
          <>
            <ValueModeToggle />
            <AssumptionBadge set={assumptionSetFor(data, selected.assumptionSetId)} />
          </>
        }
      />

      <Card className="mb-4">
        <CardHeader
          title="Compare"
          description={`Tick up to ${MAX_COMPARE} scenarios. Monte Carlo runs share one seed, so differences come from the strategy, not from luck.`}
          actions={
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
                Seed
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
              <Button size="sm" onClick={runAll} disabled={mc.running || compared.length === 0}>
                <Play aria-hidden /> {mc.running ? 'Running…' : 'Run Monte Carlo'}
              </Button>
            </>
          }
        />
        <CardContent>
          {mc.error && (
            <Notice tone="critical" className="mb-3">
              Monte Carlo failed: {mc.error}
            </Notice>
          )}
          <Table>
            <thead>
              <tr>
                <th className="w-8" />
                <th>Scenario</th>
                <th className="text-right">FI date</th>
                <th className="text-right">FI age</th>
                <th className="text-right">Success rate</th>
                <th className="text-right">FI age P10–P90</th>
                <th className="text-right">Investable at FI</th>
                <th className="text-right">At horizon</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => {
                const c = compared.find((x) => x.scenario.id === s.id);
                const m = mc.results[s.id];
                const fresh = c && m && m.signature === signature(c.input, mcRuns, mcSeed);
                return (
                  <tr key={s.id} className={s.id === selected.id ? 'bg-surface-2' : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Compare ${s.name}`}
                        checked={s.id in compare}
                        disabled={!(s.id in compare) && Object.keys(compare).length >= MAX_COMPARE}
                        onChange={() => toggleCompare(s.id)}
                      />
                    </td>
                    <td>
                      <button
                        className="flex items-center gap-2 text-left font-medium hover:underline"
                        onClick={() => selectScenario(s.id)}
                      >
                        {c && (
                          <span
                            className="inline-block size-2.5 rounded-full"
                            style={{ background: theme.series[c.slot] }}
                            aria-hidden
                          />
                        )}
                        {s.name}
                      </button>
                      {s.isPlanOfRecord && (
                        <Badge tone="primary" className="mt-0.5">
                          <Lock className="size-3" aria-hidden /> Plan of record
                        </Badge>
                      )}
                    </td>
                    {c ? (
                      <>
                        <td className="text-right">
                          {c.result.yearsToFi !== undefined
                            ? dateAfterYears(ctx.asOfDate, c.result.yearsToFi)
                            : 'Not reached'}
                        </td>
                        <td className="text-right">{c.result.retireAge ?? c.result.fiAge ?? '—'}</td>
                        <td className="text-right">
                          {m ? (
                            <span
                              className={fresh ? undefined : 'text-subtle'}
                              title={fresh ? undefined : 'Inputs changed since this run'}
                            >
                              {pct(m.summary.successRate, 0)}
                            </span>
                          ) : (
                            <span className="text-subtle">
                              {c.result.success ? 'det. ✓' : `det. ✗ ${c.result.depletionAge}`}
                            </span>
                          )}
                        </td>
                        <td className="text-right">
                          {m?.summary.fiAgeP10 !== undefined
                            ? `${Math.round(m.summary.fiAgeP10)}–${Math.round(m.summary.fiAgeP90!)}`
                            : '—'}
                        </td>
                        <td className="text-right">
                          {c.result.netWorthAtFi !== undefined ? twdCompact(c.result.netWorthAtFi) : '—'}
                        </td>
                        <td className="text-right">{twdCompact(c.result.balanceAtHorizon)}</td>
                      </>
                    ) : (
                      <td colSpan={6} className="text-right text-subtle">
                        Tick to compare
                      </td>
                    )}
                    <td>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Duplicate ${s.name}`}
                          onClick={() => void create(s)}
                        >
                          <Copy />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Delete ${s.name}`}
                          onClick={() => void remove(s)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void create()}>
              <Plus aria-hidden /> New scenario
            </Button>
            <span className="text-xs text-subtle">
              FI age shows the age you stop working. Success = liquid assets stay above zero to age{' '}
              {data.settings.horizonAge}; “det.” is the deterministic result before Monte Carlo runs.
            </span>
          </div>
          {compared.length > 0 && (
            <div className="mt-4">
              <LineChart
                ariaLabel="Investable net worth by scenario"
                data={chartRows}
                xKey="age"
                tooltipTitle={(r) => `Age ${r.age}`}
                series={compared.map((c) => ({ key: c.scenario.id, label: c.scenario.name, slot: c.slot }))}
                height={300}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title={`Edit: ${selected.name}`}
            actions={
              !selected.isPlanOfRecord ? (
                <Button size="sm" variant="outline" onClick={() => void lockPlanOfRecord(data, selected)}>
                  <Lock aria-hidden /> Lock as plan of record
                </Button>
              ) : (
                <Badge tone="primary">Plan of record since {selected.lockedAt}</Badge>
              )
            }
          />
          <CardContent>
            <ScenarioEditor key={selected.id} s={selected} />
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader
            title="Monte Carlo"
            description={
              selectedMc
                ? `${selectedMc.summary.runs.toLocaleString()} runs · seed ${selectedMc.summary.seed} · ${Math.round(selectedMc.summary.elapsedMs)} ms${selectedMcFresh ? '' : ' · inputs changed, rerun'}`
                : 'Returns, volatility and correlation per asset class, plus random inflation and FX.'
            }
            actions={
              <Button
                size="sm"
                variant="outline"
                disabled={mc.running}
                onClick={() => void mc.run([{ id: selected.id, input: selectedEval.input }], mcRuns, mcSeed)}
              >
                <Play aria-hidden /> Run
              </Button>
            }
          />
          <CardContent>
            {selectedMc ? (
              <>
                <div className="mb-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-muted-foreground">Success rate</div>
                    <div className="text-xl font-semibold">{pct(selectedMc.summary.successRate, 0)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Median FI age</div>
                    <div className="text-xl font-semibold">
                      {selectedMc.summary.fiAgeP50 !== undefined
                        ? Math.round(selectedMc.summary.fiAgeP50)
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Reach FI</div>
                    <div className="text-xl font-semibold">{pct(selectedMc.summary.fiRate, 0)}</div>
                  </div>
                </div>
                <BandChart data={bandRows} slot={selectedEval.slot} />
                {selectedMc.summary.minSpendingRatioP50 < 0.999 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Median lowest spending: {pct(selectedMc.summary.minSpendingRatioP50, 0)} of the FI budget
                    (withdrawal rule cuts).
                  </p>
                )}
                {selectedMc.summary.fiAgeDistribution.length > 0 && (
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
              <EmptyState title="Not run yet">
                Run Monte Carlo to see the P10 / P50 / P90 bands and the success rate.
              </EmptyState>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
