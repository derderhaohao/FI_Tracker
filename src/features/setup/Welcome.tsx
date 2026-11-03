import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArchiveRestore, Compass, ListChecks } from 'lucide-react';
import { loadDemo } from '@/io/demo';
import { today, yearOf } from '@/domain/dates';
import { useAppData } from '@/app/data';
import { setMode } from '@/lib/mode';
import { MoneyInput, NumberInput } from '@/components/MoneyInput';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/input';
import { dateAfterYears } from '@/lib/format';
import { t } from '@/i18n';
import {
  buildSetupRecords,
  draftFromEstimate,
  estimateComplete,
  previewSetup,
  saveSetupDraft,
  type QuickEstimate,
} from './setupModel';

/** The 60-second estimate (UX doc, O1): four answers, a rough FI age at once. */
function QuickEstimateCard({ onAccurate }: { onAccurate: (e: QuickEstimate) => void }) {
  const { settings, categories, activeAssumptions } = useAppData();
  const [e, setE] = useState<QuickEstimate>({});
  const set = (p: Partial<QuickEstimate>) => setE((x) => ({ ...x, ...p }));
  const year = yearOf(today());
  const result = useMemo(() => {
    if (!estimateComplete(e) || e.age! < 16 || e.age! > 90) return undefined;
    const draft = draftFromEstimate(e, settings.defaultSwr, year);
    if (!draft.fiSpendingMinor) return undefined;
    return previewSetup(
      buildSetupRecords(draft, {
        settings,
        categories,
        assumptionSet: activeAssumptions,
        today: today(),
        now: new Date().toISOString(),
      }),
    );
  }, [e, settings, categories, activeAssumptions, year]);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">{t('A 60-second estimate')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('Four rough numbers give a first answer. Nothing is saved until you start your plan.')}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('Your age')}>
            {(id) => (
              <NumberInput id={id} value={e.age} min={16} max={90} onCommit={(v) => set({ age: v })} />
            )}
          </Field>
          <Field label={t('Money invested now (TWD)')} hint={t('Savings and investments you could use')}>
            {(id) => (
              <MoneyInput
                id={id}
                value={e.investedMinor}
                currency="TWD"
                onCommit={(v) => set({ investedMinor: v })}
              />
            )}
          </Field>
          <Field label={t('Monthly take-home pay (TWD)')}>
            {(id) => (
              <MoneyInput
                id={id}
                value={e.monthlyIncomeMinor}
                currency="TWD"
                onCommit={(v) => set({ monthlyIncomeMinor: v })}
              />
            )}
          </Field>
          <Field label={t('Monthly spending (TWD)')}>
            {(id) => (
              <MoneyInput
                id={id}
                value={e.monthlySpendingMinor}
                currency="TWD"
                onCommit={(v) => set({ monthlySpendingMinor: v })}
              />
            )}
          </Field>
        </div>
        <div aria-live="polite" className="rounded-md bg-surface-2 p-4">
          {result === undefined ? (
            <p className="text-sm text-muted-foreground">{t('Fill in all four to see a rough FI age.')}</p>
          ) : result.fiAge !== undefined && result.yearsToFi !== undefined ? (
            <>
              <p className="text-sm text-muted-foreground">{t('Roughly, you could stop work at')}</p>
              <p className="text-3xl font-semibold tabular">
                {t('Age {age} · {date}', {
                  age: result.fiAge,
                  date: dateAfterYears(result.asOfDate, result.yearsToFi),
                })}
              </p>
            </>
          ) : (
            <p className="text-sm">
              {t('At this pace the money does not reach the goal by {horizonAge}.', {
                horizonAge: settings.horizonAge,
              })}
            </p>
          )}
        </div>
        <div>
          <Button variant="outline" onClick={() => onAccurate(e)}>
            {t('Make it accurate')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The one welcome screen for a browser with no data (UX doc, O1): when can you stop working?
 * Start a plan, explore a sample household or restore a backup; Beginner mode is a quiet link.
 */
export function Welcome() {
  const navigate = useNavigate();
  const { settings } = useAppData();
  const [loading, setLoading] = useState(false);
  const start = (e: QuickEstimate = {}) => {
    saveSetupDraft(draftFromEstimate(e, settings.defaultSwr, yearOf(today())));
    navigate('/setup');
  };
  const choice =
    'flex w-full items-start gap-3 rounded-lg border bg-surface p-4 text-left hover:bg-surface-2 disabled:opacity-50';
  return (
    <div className="mx-auto max-w-4xl py-2">
      <h1 className="text-3xl font-semibold tracking-tight">{t('When can you stop working?')}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        {t(
          'FI Tracker turns your balances and monthly pay and spending into the age when your investments could pay for your life. Everything stays in this browser.',
        )}
      </p>

      <div className="mt-6 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <QuickEstimateCard onAccurate={start} />
        <div className="flex flex-col gap-3">
          <button type="button" className={choice} onClick={() => start()}>
            <ListChecks className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="block font-semibold">{t('Start my plan')}</span>
              <span className="block text-sm text-muted-foreground">
                {t('Four short steps, about 5 minutes.')}
              </span>
            </span>
          </button>
          <button
            type="button"
            className={choice}
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              await loadDemo();
            }}
          >
            <Compass className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="block font-semibold">
                {loading ? t('Loading…') : t('Explore a sample household')}
              </span>
              <span className="block text-sm text-muted-foreground">
                {t('21 months of made-up data. Delete it any time in Settings.')}
              </span>
            </span>
          </button>
          <button type="button" className={choice} onClick={() => navigate('/settings/backup')}>
            <ArchiveRestore className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="block font-semibold">{t('Restore a backup')}</span>
              <span className="block text-sm text-muted-foreground">
                {t('Moving from another device or browser.')}
              </span>
            </span>
          </button>
        </div>
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        {t('Teaching a child about money?')}{' '}
        <button
          type="button"
          className="text-primary underline-offset-2 hover:underline"
          onClick={() => {
            window.location.hash = '#/kids';
            setMode('beginner');
          }}
        >
          {t('Try Beginner mode.')}
        </button>
      </p>
    </div>
  );
}
