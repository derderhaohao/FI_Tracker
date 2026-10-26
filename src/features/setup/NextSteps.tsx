import { Link, useSearchParams } from 'react-router-dom';
import { PartyPopper, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';

const STEPS: { to: string; title: string; text: string }[] = [
  {
    to: '/settings/backup',
    title: t('Back up your data'),
    text: t('It lives only in this browser. Export a backup, or turn on auto-save to a file.'),
  },
  {
    to: '/cashflow',
    title: t('Refine your cash flow'),
    text: t('Split “Living costs” into categories, add bonuses, or import a bank CSV.'),
  },
  {
    to: '/goal',
    title: t('Shape your FI budget'),
    text: t('Set essential vs. lifestyle spending per category for Lean and Full FI.'),
  },
  {
    to: '/lab',
    title: t('Try a strategy'),
    text: t('Save more, retire later, part-time work: compare scenarios side by side.'),
  },
];

/** Shown once on the Dashboard right after the setup wizard finishes. */
export function NextSteps() {
  const [params, setParams] = useSearchParams();
  if (params.get('setup') !== 'done') return null;
  return (
    <section className="mb-4 rounded-lg border border-primary bg-surface p-4" aria-label={t('Next steps')}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <PartyPopper className="size-5 text-primary" aria-hidden />
          <h2 className="font-semibold">{t('Setup done: here is your first projection')}</h2>
        </div>
        <Button
          size="icon"
          variant="ghost"
          aria-label={t('Dismiss next steps')}
          onClick={() => setParams({}, { replace: true })}
        >
          <X />
        </Button>
      </div>
      {params.get('storage') && (
        <p className="mt-1 text-sm">
          {params.get('storage') === 'kept'
            ? t('Your browser agreed to keep this data when space runs low.')
            : t('Your browser did not promise to keep this data, so a backup matters even more.')}
        </p>
      )}
      <p className="mt-1 text-sm text-muted-foreground">
        {t(
          'Once a month, update balances in Snapshots and last month’s pay and spending in Cash flow. When you have time:',
        )}
      </p>
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s) => (
          <li key={s.to}>
            <Link to={s.to} className="block h-full rounded-md border p-3 hover:bg-surface-2">
              <div className="text-sm font-medium text-primary">{s.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{s.text}</div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
