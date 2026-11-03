import { Link, useSearchParams } from 'react-router-dom';
import { PartyPopper } from 'lucide-react';
import { fiProgress } from '@/domain/networth';
import { useAppData } from '@/app/data';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { dateAfterYears, pct } from '@/lib/format';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';

/**
 * The end of setup (UX doc, O3): the FI age first, a progress bar, one sentence of meaning,
 * at most three next steps, then the dashboard. Not a dashboard of warnings.
 */
export function SetupResult() {
  const { accounts, baseline, ctx, fiNumberNow, settings } = useAppData();
  const [params] = useSearchParams();
  if (accounts.length === 0) {
    return (
      <p className="text-sm">
        <Link to="/setup" className="text-primary hover:underline">
          {t('Set up your plan')}
        </Link>
      </p>
    );
  }
  const progress = Math.min(1, Math.max(0, fiProgress(ctx.netWorth.investable, fiNumberNow)));
  const reached = baseline.fiAge !== undefined && baseline.yearsToFi !== undefined;
  const storage = params.get('storage');
  const steps = [
    {
      to: '/update',
      title: t('Do your first monthly update next month'),
      text: t('About 3 minutes: balances, the USD rate, pay and spending.'),
    },
    {
      to: '/settings/backup',
      title: t('Save a backup'),
      text:
        storage === 'not-kept'
          ? t('Your browser did not promise to keep this data, so a backup matters even more.')
          : t('Your data lives only in this browser.'),
    },
    {
      to: '/plan/lab',
      title: t('Try a what-if'),
      text: t('Save more, stop later, work part-time: see the date move.'),
    },
  ];
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-4">
      <div className="flex items-center gap-2 text-primary">
        <PartyPopper className="size-6" aria-hidden />
        <span className="text-sm font-medium">{t('Your plan is ready')}</span>
      </div>
      <div>
        {reached ? (
          <>
            <p className="text-muted-foreground">{t('At this pace you could stop work at')}</p>
            <h1 className="text-5xl font-semibold tracking-tight tabular">
              {t('Age {age}', { age: baseline.fiAge })}
            </h1>
            <p className="mt-1 text-xl">{dateAfterYears(ctx.asOfDate, baseline.yearsToFi!)}</p>
          </>
        ) : (
          <h1 className="text-3xl font-semibold">
            {t('Not reached by {horizonAge} at this pace', { horizonAge: settings.horizonAge })}
          </h1>
        )}
      </div>
      <div>
        <div
          role="progressbar"
          aria-label={t('Progress to financial independence')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          className="h-3 overflow-hidden rounded-full bg-surface-2"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="mt-2 text-sm">
          {reached
            ? t(
                'You are {pct} of the way: your investments today cover that share of what you need to stop depending on a paycheck.',
                { pct: pct(progress) },
              )
            : t(
                'You are {pct} of the way. Saving more or spending less once you stop moves the date into reach; try it in the Strategy Lab.',
                { pct: pct(progress) },
              )}
        </p>
      </div>
      <Card>
        <CardContent className="p-4">
          <h2 className="mb-2 font-semibold">{t('Next steps')}</h2>
          <ul className="flex flex-col gap-2">
            {steps.map((s) => (
              <li key={s.to}>
                <Link to={s.to} className="block rounded-md border p-3 hover:bg-surface-2">
                  <span className="block text-sm font-medium text-primary">{s.title}</span>
                  <span className="block text-xs text-muted-foreground">{s.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <div>
        <Link to="/" className={cn(buttonVariants(), 'h-11 px-5 text-base')}>
          {t('Go to my dashboard')}
        </Link>
      </div>
    </div>
  );
}
