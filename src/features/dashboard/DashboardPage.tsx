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
import { FiMoveCard } from './FiMoveCard';
import { AssumptionBadge } from '@/components/AssumptionBadge';
import { PlanHealthCard } from '@/components/PlanHealthCard';
import { LineChart } from '@/components/charts/LineChart';
import { ShareBars } from '@/components/charts/ShareBars';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { EmptyState, Notice, PageHeader, Stat } from '@/components/ui/misc';
import { formatDate, monthLabel, pct, twd, twdCompact } from '@/lib/format';
import { t } from '@/i18n';

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
        <PageHeader title={t('Dashboard')} />
        <EmptyState title={t('Enter your first snapshot')} to="/snapshots" action={t('Go to Snapshots')}>
          {t('One balance per account, in its own currency, plus the USD/TWD rate for the date.')}
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
      message: t(
        'Net worth changed by {change} from {from} to {to}, which recorded savings ({contributions}) and plausible market moves do not explain. Check Snapshots for a missing entry or a typo.',
        {
          change: twdCompact(lastChange.change),
          from: lastChange.from,
          to: lastChange.to,
          contributions: twdCompact(lastChange.contributions),
        },
      ),
    });
  }
  const driftAlerts = alerts.filter((a) => a.id.startsWith('drift-'));
  const otherAlerts = alerts.filter((a) => !a.id.startsWith('drift-'));
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
        title={t('Dashboard')}
        description={t('As of the snapshot on {asOfDate}. All amounts in TWD.', {
          asOfDate: formatDate(ctx.asOfDate),
        })}
        actions={
          <>
            <Link to="/update" className={buttonVariants({ size: 'sm' })}>
              <RefreshCw aria-hidden /> {t('Monthly update')}
            </Link>
            <AssumptionBadge set={data.activeAssumptions} />
          </>
        }
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
            ? t('Add cash flow and an FI budget, or try a scenario in the Strategy Lab.')
            : t(
                'The age is the typical path, where markets return their typical amount every year; the status counts how often the money lasts across 1,000 simulated futures.',
              )
        }
      />

      {/* Section order (UI-10): plan, KPIs, alerts, net worth and allocation, FI-date move, backup. */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t('Total net worth')}
          value={twdCompact(nw.total)}
          sub={t('Assets {twdCompact} · debt {liabilities}', {
            twdCompact: twdCompact(nw.total + nw.liabilities),
            liabilities: twdCompact(nw.liabilities),
          })}
        />
        <Stat
          label={t('Investable net worth')}
          value={twdCompact(nw.investable)}
          sub={
            nw.locked > 0
              ? t('Plus {locked} locked until access age', { locked: twdCompact(nw.locked) })
              : t('Usable now')
          }
        />
        <Stat
          label={t('FI progress')}
          value={pct(progress, 1)}
          sub={
            <>
              {t('of FI number {fiNumberNow} ·', { fiNumberNow: twdCompact(fiNumberNow) })}{' '}
              <Link className="text-primary hover:underline" to="/goal">
                {t('Goal')}
              </Link>
            </>
          }
        />
        <Stat
          label={t('Savings rate')}
          value={
            lastMonth && Number.isFinite(lastMonth.regularSavingsRate)
              ? pct(lastMonth.regularSavingsRate)
              : '—'
          }
          sub={
            lastMonth
              ? t('{month} excl. lump sums · trailing 12 months {v}', {
                  month: monthLabel(lastMonth.month),
                  v: Number.isFinite(ctx.t12.savingsRate) ? pct(ctx.t12.savingsRate) : '—',
                })
              : t('No cash flow yet')
          }
        />
      </div>

      {otherAlerts.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {otherAlerts.map((a) => (
            <Notice key={a.id} tone="warning">
              {a.message}
            </Notice>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader
            title={t('Net worth over time')}
            description={t("Total and investable (incl. locked pension), TWD at each snapshot's FX rate")}
          />
          <CardContent>
            <LineChart
              ariaLabel={t('Net worth over time')}
              data={series.map((s) => ({
                date: s.date,
                total: s.total,
                investable: s.investable + s.locked,
              }))}
              xKey="date"
              xFormat={(v) => monthLabel(String(v).slice(0, 7))}
              series={[
                { key: 'total', label: t('Total net worth'), slot: 0 },
                { key: 'investable', label: t('Investable + locked'), slot: 2 },
              ]}
              height={300}
            />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          {driftAlerts.map((a) => (
            <Notice
              key={a.id}
              tone="warning"
              action={
                <Link
                  to="/settings/general#allocation"
                  className="text-sm font-medium whitespace-nowrap text-primary hover:underline"
                >
                  {t('Review allocation')}
                </Link>
              }
            >
              {a.message}
            </Notice>
          ))}
          <Card>
            <CardHeader
              title={t('Allocation')}
              description={t('Liquid investable assets by class; ticks mark the target')}
            />
            <CardContent>
              <ShareBars rows={byClass} ariaLabel={t('Allocation by asset class')} />
              <p className="mt-3 text-xs text-muted-foreground">
                {t('Total {investable}{v}', {
                  investable: twd(nw.investable),
                  v:
                    nw.locked > 0 &&
                    t(' · {locked} locked until access age not shown', { locked: twdCompact(nw.locked) }),
                })}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader title={t('By currency')} description={t('All assets, converted to TWD')} />
            <CardContent>
              <ShareBars rows={byCurrency} ariaLabel={t('Assets by currency')} />
            </CardContent>
          </Card>
        </div>
      </div>

      <FiMoveCard />

      <Card className="mt-4">
        <CardHeader title={t('Backup')} />
        <CardContent className="pt-2 text-sm text-muted-foreground">
          {backupAge === undefined
            ? t('Never backed up.')
            : backupAge === 0
              ? t('Last backup today.')
              : t('Last backup {backupAge} days ago.', { backupAge })}{' '}
          <Link to="/settings/backup" className="text-primary hover:underline">
            {t('Backup & restore')}
          </Link>
        </CardContent>
      </Card>
    </>
  );
}
