import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { allocationGap, computeAlerts, groupDriftAlerts } from '@/domain/alerts';
import { monthlyTotals } from '@/domain/cashflow';
import { today } from '@/domain/dates';
import { fiProgress, netWorthSeries } from '@/domain/networth';
import { STATUS_LABELS } from '@/domain/planStatus';
import { periodChanges } from '@/domain/reconcile';
import { useAppData } from '@/app/data';
import { usePlanHealth } from '@/app/planHealth';
import { stopAge, stopDate } from '@/features/lab/model';
import { Welcome } from '@/features/setup/Welcome';
import { defaultUpdateDate } from '@/features/update/updateModel';
import { useAutosave } from '@/lib/autosave';
import { FiMoveCard } from './FiMoveCard';
import { nextStep, type NextStep } from './nextStep';
import { StatusBadge } from '@/components/StatusBadge';
import { LineChart } from '@/components/charts/LineChart';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { Badge, EmptyState, Notice, PageHeader, Segmented, Stat } from '@/components/ui/misc';
import { formatDate, monthLabel, pct, twdCompact } from '@/lib/format';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';

/** "41% (good)": every percentage carries a word (UX doc, words and numbers). */
function savingsWord(rate: number, target: number): string {
  if (rate >= target) return t('good');
  if (rate >= 0.1) return t('fair');
  return t('low');
}

const NEXT: Record<NextStep, (month: string) => { title: string; text: string; to: string; action: string }> =
  {
    update: (month) => ({
      title: t('{month} update due', { month }),
      text: t('About 3 minutes: balances, the USD rate, pay and spending.'),
      to: '/update',
      action: t('Start the update'),
    }),
    backup: () => ({
      title: t('Save a backup'),
      text: t('Your data lives only in this browser. Keep a copy, or turn on auto-save to a file.'),
      to: '/settings/backup',
      action: t('Back up now'),
    }),
    pension: () => ({
      title: t('Add your 勞保 details to sharpen the date'),
      text: t(
        'Setup estimated 勞退 and 勞保 from your pay. Your real figures are on the 勞保局 e化服務 site.',
      ),
      to: '/settings/taiwan',
      action: t('Add details'),
    }),
    'what-if': () => ({
      title: t('Try a what-if'),
      text: t('Save more, stop later, work part-time: see the date move.'),
      to: '/plan/lab',
      action: t('Open the Strategy Lab'),
    }),
  };

export function DashboardPage() {
  const data = useAppData();
  const { settings, accounts, snapshots, ctx, baseline, baselineInput, fiNumberNow } = data;
  const { status, pending } = usePlanHealth();
  const autosave = useAutosave();
  const [chart, setChart] = useState<'total' | 'investable'>('total');
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
        <PageHeader title={t('Home')} />
        <EmptyState
          title={t('Enter your first balances')}
          to="/money/snapshots"
          action={t('Go to Snapshots')}
        >
          {t('One balance per account, in its own currency, plus the USD/TWD rate for the date.')}
        </EmptyState>
      </>
    );
  }

  const nw = ctx.netWorth;
  const progress = Math.max(0, fiProgress(nw.investable, fiNumberNow));
  const age = stopAge(baseline);
  const date = stopDate(baselineInput, baseline, ctx.asOfDate);
  const lastMonth = totals.at(-1);
  const previous = series.at(-2);
  const change = previous ? nw.total - previous.total : undefined;

  // At most one banner (UX doc, A1): data problems first, then the other warnings.
  const alerts = groupDriftAlerts(
    computeAlerts(settings.alerts, settings.targetAllocation, nw, totals, ctx.t12.annualExpense / 12),
    series.length,
    allocationGap(settings.targetAllocation, nw),
  );
  const lastChange = periodChanges(series.slice(-2), totals, data.fxRates, data.activeAssumptions.assets).at(
    -1,
  );
  const banner =
    ctx.warnings[0] ??
    (lastChange?.check?.flagged
      ? t(
          'Net worth changed by {change} from {from} to {to}, which recorded savings ({contributions}) and plausible market moves do not explain. Check Snapshots for a missing entry or a typo.',
          {
            change: twdCompact(lastChange.change),
            from: lastChange.from,
            to: lastChange.to,
            contributions: twdCompact(lastChange.contributions),
          },
        )
      : alerts.find((a) => a.id !== 'drift')?.message);
  const drift = alerts.some((a) => a.id === 'drift');

  const step = nextStep({
    today: today(),
    asOfDate: ctx.asOfDate,
    snapshotDateCount: series.length,
    backupPrompt: settings.backupPrompt,
    lastBackupAt: settings.lastBackupAt,
    firstDataDate: accounts.map((a) => a.createdAt.slice(0, 10)).sort()[0],
    autosaving: autosave.status === 'active' || autosave.status === 'saving',
    pensionEstimated: settings.pensionEstimated,
  });
  const next = NEXT[step](monthLabel(defaultUpdateDate(today()).slice(0, 7)));

  const rate = lastMonth?.regularSavingsRate;
  return (
    <>
      <PageHeader
        title={t('Home')}
        description={t('As of {asOfDate}. All amounts in TWD.', { asOfDate: formatDate(ctx.asOfDate) })}
        actions={
          <Link to="/update" className={buttonVariants({ size: 'sm' })}>
            <RefreshCw aria-hidden /> {t('Monthly update')}
          </Link>
        }
      />
      {banner && (
        <Notice tone="warning" className="mb-4">
          {banner}
        </Notice>
      )}

      {/* The hero holds one sentence, one bar and one word of certainty (UX doc, D1). */}
      <section aria-label={t('Your progress')} className="mb-4 rounded-lg border bg-surface p-5">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t('You’re {pct} of the way to financial independence', { pct: pct(Math.min(progress, 1), 0) })}
        </h2>
        <div
          role="progressbar"
          aria-label={t('Progress to financial independence')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.min(progress, 1) * 100)}
          className="mt-3 h-3 overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.min(progress, 1) * 100}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-base sm:text-lg">
            {age !== undefined && date
              ? t('At this pace you could stop work at {age} ({date}).', { age, date })
              : t('At this pace you would not reach it by {horizonAge}.', {
                  horizonAge: baselineInput.horizonAge,
                })}
          </p>
          {status ? (
            <StatusBadge status={status}>{STATUS_LABELS[status]}</StatusBadge>
          ) : (
            <Badge>{pending ? t('Checking…') : '—'}</Badge>
          )}
          <Link to="/plan/projection" className="text-sm text-primary hover:underline">
            {t('How sure is this?')}
          </Link>
        </div>
      </section>

      <div className="mb-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            label={t('Net worth')}
            value={twdCompact(nw.total)}
            sub={
              change === undefined
                ? t('First month')
                : t('{sign}{change} since last month', {
                    sign: change >= 0 ? '+' : '−',
                    change: twdCompact(Math.abs(change)),
                  })
            }
          />
          <Stat
            label={t('Saving per month')}
            value={lastMonth ? twdCompact(lastMonth.income - lastMonth.expense) : '—'}
            sub={lastMonth ? monthLabel(lastMonth.month) : t('No cash flow yet')}
          />
          <Stat
            label={t('Savings rate')}
            value={rate !== undefined && Number.isFinite(rate) ? pct(rate) : '—'}
            sub={
              rate !== undefined && Number.isFinite(rate)
                ? t('{word} · bonuses left out', {
                    word: savingsWord(rate, settings.alerts.targetSavingsRate),
                  })
                : t('No cash flow yet')
            }
          />
        </div>
        <section aria-label={t('Next step')} className="rounded-lg border border-primary/40 bg-surface p-4">
          <div className="text-xs font-medium tracking-wide text-primary uppercase">{t('Next step')}</div>
          <h2 className="mt-1 font-semibold">{next.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{next.text}</p>
          <Link to={next.to} className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'mt-3')}>
            {next.action} <ArrowRight aria-hidden />
          </Link>
        </section>
      </div>

      {drift && (
        <p className="mb-4 text-sm">
          {t('Your mix is {points} points off target.', {
            points: Math.round(allocationGap(settings.targetAllocation, nw) * 100),
          })}{' '}
          <Link to="/money/mix" className="text-primary hover:underline">
            {t('Review')}
          </Link>
        </p>
      )}

      <Card>
        <CardHeader
          title={t('Net worth over time')}
          description={t("TWD at each snapshot's FX rate")}
          actions={
            <Segmented
              label={t('Show')}
              value={chart}
              onChange={setChart}
              options={[
                { value: 'total', label: t('Total') },
                { value: 'investable', label: t('Investments') },
              ]}
            />
          }
        />
        <CardContent>
          {series.length < 2 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t('Your line starts here. Do next month’s update to see it grow.')}
            </p>
          ) : (
            <LineChart
              ariaLabel={t('Net worth over time')}
              data={series.map((s) => ({
                date: s.date,
                value: chart === 'total' ? s.total : s.investable + s.locked,
              }))}
              xKey="date"
              xFormat={(v) => monthLabel(String(v).slice(0, 7))}
              series={[
                {
                  key: 'value',
                  label: chart === 'total' ? t('Total net worth') : t('Investments incl. locked pension'),
                  slot: chart === 'total' ? 0 : 2,
                },
              ]}
              height={280}
            />
          )}
        </CardContent>
      </Card>

      <FiMoveCard />
    </>
  );
}
