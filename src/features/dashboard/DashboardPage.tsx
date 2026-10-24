import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ASSET_CLASS_LABELS, type AssetClass } from '@/domain/entities';
import { computeAlerts } from '@/domain/alerts';
import { monthlyTotals } from '@/domain/cashflow';
import { daysBetween, today } from '@/domain/dates';
import { fiProgress, netWorthSeries } from '@/domain/networth';
import { periodChanges } from '@/domain/reconcile';
import { useAppData } from '@/app/data';
import { Welcome } from '@/features/setup/Welcome';
import { NextSteps } from '@/features/setup/NextSteps';
import { AssumptionBadge } from '@/components/AssumptionBadge';
import { PlanHealthCard } from '@/components/PlanHealthCard';
import { LineChart } from '@/components/charts/LineChart';
import { ShareBars } from '@/components/charts/ShareBars';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState, Notice, PageHeader, Stat } from '@/components/ui/misc';
import { monthLabel, pct, twd, twdCompact } from '@/lib/format';

export function DashboardPage() {
  const data = useAppData();
  const { settings, accounts, snapshots, ctx, baseline, fiNumberNow } = data;
  const totals = useMemo(
    () => monthlyTotals(data.cashFlows, data.categories, data.fxRates),
    [data.cashFlows, data.categories, data.fxRates],
  );
  const series = useMemo(
    () => netWorthSeries(accounts, snapshots, data.fxRates, settings.birthYear),
    [accounts, snapshots, data.fxRates, settings.birthYear],
  );

  if (accounts.length === 0) return <Welcome />;
  if (snapshots.length === 0) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <EmptyState title="Enter your first snapshot" to="/snapshots" action="Go to Snapshots">
          One balance per account, in its own currency, plus the USD/TWD rate for the date.
        </EmptyState>
      </>
    );
  }

  const nw = ctx.netWorth;
  const progress = fiProgress(nw.investable, fiNumberNow);
  const lastMonth = totals.at(-1);
  const backupAge = settings.lastBackupAt
    ? daysBetween(settings.lastBackupAt.slice(0, 10), today())
    : undefined;
  const alerts = computeAlerts(
    settings.alerts,
    settings.targetAllocation,
    nw,
    totals,
    ctx.t12.annualExpense / 12,
  );
  const lastChange = periodChanges(series.slice(-2), totals, data.fxRates, data.activeAssumptions.assets).at(
    -1,
  );
  if (lastChange?.check?.flagged) {
    alerts.push({
      id: 'reconcile',
      level: 'warning',
      message: `Net worth changed by ${twdCompact(lastChange.change)} from ${lastChange.from} to ${lastChange.to}, which recorded savings (${twdCompact(lastChange.contributions)}) and plausible market moves do not explain. Check Snapshots for a missing entry or a typo.`,
    });
  }
  const targetSum = Object.values(settings.targetAllocation).reduce((a, b) => a + (b ?? 0), 0);
  const byClass = (Object.keys(nw.byAssetClass) as AssetClass[])
    .filter((c) => nw.balances.some((b) => b.account.assetClass === c && b.bucket === 'liquid'))
    .map((c) => {
      const value = nw.balances
        .filter((b) => b.account.assetClass === c && b.bucket === 'liquid')
        .reduce((s, b) => s + b.twd, 0);
      return {
        label: ASSET_CLASS_LABELS[c],
        value,
        target: targetSum > 0 ? (settings.targetAllocation[c] ?? 0) / targetSum : undefined,
      };
    })
    .sort((a, b) => b.value - a.value);
  const byCurrency = Object.entries(nw.byCurrency)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`As of the snapshot on ${ctx.asOfDate}. All amounts in TWD.`}
        actions={<AssumptionBadge set={data.activeAssumptions} />}
      />
      <NextSteps />
      {ctx.warnings.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {ctx.warnings.map((w) => (
            <Notice key={w} tone="warning">
              {w}
            </Notice>
          ))}
        </div>
      )}

      <PlanHealthCard
        note={
          baseline.fiAge === undefined
            ? 'Add cash flow and an FI budget, or try a scenario in the Strategy Lab.'
            : 'The age is the typical path, where markets return their typical amount every year; the status counts how often the money lasts across 1,000 simulated futures.'
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Total net worth"
          value={twdCompact(nw.total)}
          sub={`Assets ${twdCompact(nw.total + nw.liabilities)} · debt ${twdCompact(nw.liabilities)}`}
        />
        <Stat
          label="Investable net worth"
          value={twdCompact(nw.investable)}
          sub={nw.locked > 0 ? `Plus ${twdCompact(nw.locked)} locked until access age` : 'Usable now'}
        />
        <Stat
          label="FI progress"
          value={pct(progress, 1)}
          sub={
            <>
              of FI number {twdCompact(fiNumberNow)} ·{' '}
              <Link className="text-primary hover:underline" to="/goal">
                Goal
              </Link>
            </>
          }
        />
        <Stat
          label="Savings rate"
          value={
            lastMonth && Number.isFinite(lastMonth.regularSavingsRate)
              ? pct(lastMonth.regularSavingsRate)
              : '—'
          }
          sub={
            lastMonth
              ? `${monthLabel(lastMonth.month)} excl. lump sums · trailing 12 months ${Number.isFinite(ctx.t12.savingsRate) ? pct(ctx.t12.savingsRate) : '—'}`
              : 'No cash flow yet'
          }
        />
      </div>

      {alerts.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {alerts.map((a) => (
            <Notice key={a.id} tone="warning">
              {a.message}
            </Notice>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Net worth over time"
            description="Total and investable (incl. locked pension), TWD at each snapshot's FX rate"
          />
          <CardContent>
            <LineChart
              ariaLabel="Net worth over time"
              data={series.map((s) => ({
                date: s.date,
                total: s.total,
                investable: s.investable + s.locked,
              }))}
              xKey="date"
              xFormat={(v) => monthLabel(String(v).slice(0, 7))}
              series={[
                { key: 'total', label: 'Total net worth', slot: 0 },
                { key: 'investable', label: 'Investable + locked', slot: 2 },
              ]}
            />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader
              title="Allocation"
              description="Liquid investable assets by class; ticks mark the target"
            />
            <CardContent>
              <ShareBars rows={byClass} ariaLabel="Allocation by asset class" />
              <p className="mt-3 text-xs text-subtle">
                Total {twd(nw.investable)}
                {nw.locked > 0 && ` · ${twdCompact(nw.locked)} locked until access age not shown`}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="By currency" description="All assets, converted to TWD" />
            <CardContent>
              <ShareBars rows={byCurrency} ariaLabel="Assets by currency" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Backup" />
            <CardContent className="pt-2 text-sm text-muted-foreground">
              {backupAge === undefined
                ? 'Never backed up.'
                : `Last backup ${backupAge === 0 ? 'today' : `${backupAge} days ago`}.`}{' '}
              <Link to="/settings#backup" className="text-primary hover:underline">
                Backup & restore
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
