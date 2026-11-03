import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Plus, Trash2 } from 'lucide-react';
import { today, yearOf } from '@/domain/dates';
import { fromMinor } from '@/domain/money';
import { savingsRate } from '@/domain/cashflow';
import { useAppData } from '@/app/data';
import { requestPersistence } from '@/db/defaults';
import { ASSET_CLASS_LABELS, type Allocation, type AssetClass } from '@/domain/entities';
import { MoneyInput, NumberInput, PercentInput } from '@/components/MoneyInput';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { dateAfterYears, pct, twd, twdCompact } from '@/lib/format';
import {
  applySetup,
  buildSetupRecords,
  CASH_WARNING,
  chosenMix,
  currentAge,
  currentMix,
  effectiveMix,
  livePreview,
  loadSetupDraft,
  MIX_PRESETS,
  draftAccount,
  saveSetupDraft,
  SETUP_KINDS,
  STEPS,
  validateStep,
  type DraftAccount,
  type MixChoice,
  type SetupDraft,
  type SetupKind,
} from './setupModel';
import { t } from '@/i18n';

type StepProps = { d: SetupDraft; set: (p: Partial<SetupDraft>) => void };

function Explain({ children }: { children: ReactNode }) {
  return <p className="max-w-2xl text-sm text-muted-foreground">{children}</p>;
}

function StepAbout({ d, set }: StepProps) {
  const age = currentAge(d.birthYear, today());
  return (
    <div className="flex flex-col gap-4">
      <Explain>{t('Your age sets the timeline and how many years your money must last.')}</Explain>
      <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label={t('Birth year')}
          hint={age !== undefined ? t('You turn {age} this year', { age }) : t('For example 1990')}
        >
          {(id) => (
            <NumberInput
              id={id}
              value={d.birthYear}
              min={1900}
              max={2100}
              placeholder={t('YYYY')}
              onCommit={(v) => set({ birthYear: v })}
            />
          )}
        </Field>
        <Field
          label={t('Target FI age (optional)')}
          hint={t("An age you'd like to stop depending on a paycheck")}
        >
          {(id) => (
            <NumberInput
              id={id}
              value={d.targetFiAge}
              min={0}
              max={120}
              placeholder={t('none')}
              onCommit={(v) => set({ targetFiAge: v })}
            />
          )}
        </Field>
      </div>
    </div>
  );
}

/** One tap on a tile adds a row with a ready nickname and a balance (UX doc, O2). */
function StepAccounts({ d, set }: StepProps) {
  const update = (key: string, patch: Partial<DraftAccount>) =>
    set({ accounts: d.accounts.map((a) => (a.key === key ? { ...a, ...patch } : a)) });
  const hasUsd = d.accounts.some((a) => a.currency === 'USD');
  const [rateText, setRateText] = useState(d.usdRate ? String(d.usdRate) : '');
  return (
    <div className="flex flex-col gap-4">
      <Explain>
        {t(
          'Tap what you have, then type today’s balance. Rough numbers are fine; the Monthly update keeps them current. Use nicknames only, never account numbers.',
        )}
      </Explain>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={t('Add an account')}>
        {(Object.keys(SETUP_KINDS) as SetupKind[]).map((k) => (
          <Button
            key={k}
            variant="outline"
            className="h-auto justify-start py-2"
            onClick={() => set({ accounts: [...d.accounts, draftAccount(k, d.accounts)] })}
            title={SETUP_KINDS[k].hint}
          >
            <Plus aria-hidden /> {SETUP_KINDS[k].label}
          </Button>
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {d.accounts.map((a) => (
          <li
            key={a.key}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto]"
          >
            <Field label={t('Nickname')} hint={SETUP_KINDS[a.kind].hint} className="col-span-2 sm:col-span-1">
              {(id) => (
                <Input
                  id={id}
                  value={a.nickname}
                  onChange={(e) => update(a.key, { nickname: e.target.value })}
                />
              )}
            </Field>
            <Field
              label={
                a.kind === 'loan'
                  ? t('Amount owed')
                  : a.currency === 'USD'
                    ? t('Balance today (USD)')
                    : t('Balance today')
              }
            >
              {(id) => (
                <MoneyInput
                  id={id}
                  value={a.balanceMinor}
                  currency={a.currency}
                  twdRate={a.currency === 'USD' ? d.usdRate : undefined}
                  onCommit={(v) => update(a.key, { balanceMinor: v })}
                />
              )}
            </Field>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('Remove {nickname}', { nickname: a.nickname })}
              onClick={() => set({ accounts: d.accounts.filter((x) => x.key !== a.key) })}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      {hasUsd && (
        <Field
          label={t('TWD per USD today')}
          hint={t("Check your bank's rate; used to convert USD balances")}
          className="max-w-56"
        >
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={rateText}
              placeholder="32.5"
              onChange={(e) => setRateText(e.target.value)}
              onBlur={() => {
                const n = Number(rateText.replace(/,/g, ''));
                set({ usdRate: Number.isFinite(n) && n > 0 ? n : undefined });
              }}
            />
          )}
        </Field>
      )}
    </div>
  );
}

function StepMoney({ d, set }: StepProps) {
  const income = d.monthlyIncomeMinor !== undefined ? fromMinor(d.monthlyIncomeMinor) : undefined;
  const spending = d.monthlySpendingMinor !== undefined ? fromMinor(d.monthlySpendingMinor) : undefined;
  const rate = income !== undefined && spending !== undefined ? savingsRate(income, spending) : Number.NaN;
  return (
    <div className="flex flex-col gap-5">
      <Explain>
        {t(
          'A typical month, as two totals. Spending means everything that leaves your accounts: rent or loan payments, insurance, food, fun. You can split it into categories later.',
        )}
      </Explain>
      <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('Monthly take-home pay')} hint={t('After tax, 勞健保 and any voluntary 勞退')}>
          {(id) => (
            <MoneyInput
              id={id}
              value={d.monthlyIncomeMinor}
              currency="TWD"
              onCommit={(v) => set({ monthlyIncomeMinor: v })}
            />
          )}
        </Field>
        <Field label={t('Monthly spending')} hint={t('Everything you spend in a typical month')}>
          {(id) => (
            <MoneyInput
              id={id}
              value={d.monthlySpendingMinor}
              currency="TWD"
              onCommit={(v) =>
                set({
                  monthlySpendingMinor: v,
                  // FI spending follows spending × 12 until the user types their own.
                  ...(d.fiSpendingEdited ? {} : { fiSpendingMinor: v === undefined ? undefined : v * 12 }),
                })
              }
            />
          )}
        </Field>
      </div>
      {Number.isFinite(rate) && (
        <p className="text-sm">
          {t('You save')} <strong>{twd((income ?? 0) - (spending ?? 0))}</strong>{' '}
          {t('a month, a savings rate of')} <strong>{pct(rate)}</strong>.
          {rate < 0 && t(' Spending is above pay, so savings are being drawn down.')}
        </p>
      )}
      <Field
        label={t('Yearly spending once you stop working')}
        hint={t(
          'Starts at today’s spending × 12; change it for things that will differ, like a paid-off loan.',
        )}
        className="max-w-xl"
      >
        {(id) => (
          <MoneyInput
            id={id}
            value={d.fiSpendingMinor}
            currency="TWD"
            className="sm:max-w-[calc(50%-0.5rem)]"
            onCommit={(v) => set({ fiSpendingMinor: v, fiSpendingEdited: true })}
          />
        )}
      </Field>
      <fieldset className="max-w-xl">
        <legend className="text-sm font-medium">{t('Do you have a Taiwan employer?')}</legend>
        <p className="mb-2 text-xs text-muted-foreground">
          {t(
            'If yes, 勞退 and 勞保 are estimated from your pay. You can add the real figures later to sharpen the date.',
          )}
        </p>
        <div className="flex gap-2">
          {[
            { value: true, label: t('Yes') },
            { value: false, label: t('No') },
          ].map((o) => (
            <label
              key={String(o.value)}
              className={cn(
                'flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm',
                d.taiwanEmployer === o.value ? 'border-primary bg-surface-2' : 'hover:bg-surface-2',
              )}
            >
              <input
                type="radio"
                name="taiwan-employer"
                checked={d.taiwanEmployer === o.value}
                onChange={() => set({ taiwanEmployer: o.value })}
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
      <details className="max-w-xl rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">{t('Advanced')}</summary>
        <Field
          label={t('Safe withdrawal rate')}
          hint={t('Share of investments you spend each year. 4% is common; 3.5% is safer for 40+ years.')}
          className="mt-3 max-w-56"
        >
          {(id) => (
            <PercentInput
              id={id}
              value={d.swr}
              min={0.025}
              max={0.05}
              step={0.05}
              onCommit={(v) => v !== undefined && set({ swr: v })}
            />
          )}
        </Field>
      </details>
    </div>
  );
}

function mixText(a: Allocation): string {
  return (Object.entries(a) as [AssetClass, number][])
    .filter(([, v]) => v > 0)
    .sort((x, y) => y[1] - x[1])
    .map(([k, v]) => `${ASSET_CLASS_LABELS[k]} ${Math.round(v * 100)}%`)
    .join(' · ');
}

function StepMix({ d, set }: StepProps) {
  const current = currentMix(d);
  const options: { value: MixChoice; label: string; text: string }[] = [
    ...(current
      ? [{ value: 'current' as const, label: t('Keep my current mix'), text: mixText(current) }]
      : []),
    ...(Object.entries(MIX_PRESETS) as [Exclude<MixChoice, 'current'>, (typeof MIX_PRESETS)['growth']][]).map(
      ([value, p]) => ({ value, label: p.label, text: p.text }),
    ),
  ];
  const chosen = chosenMix(d);
  const mix = effectiveMix(d);
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="sr-only">{t('How should new savings be invested?')}</legend>
      <Explain>
        {t(
          'The projection invests what you save each month in this mix. Cash grows slowly, so a mix that is mostly cash pushes your FI date later. The closest match to what you hold now is picked for you; you can change it any time in Settings.',
        )}
      </Explain>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex cursor-pointer gap-2 rounded-md border p-3 text-sm',
              mix === o.value ? 'border-primary bg-surface-2' : 'hover:bg-surface-2',
            )}
          >
            <input
              type="radio"
              name="mix"
              className="mt-1"
              checked={mix === o.value}
              onChange={() => set({ mix: o.value })}
            />
            <span>
              <span className="font-medium">{o.label}</span>
              <span className="block text-xs text-muted-foreground">{o.text}</span>
            </span>
          </label>
        ))}
      </div>
      {chosen && (chosen.cash ?? 0) > CASH_WARNING && (
        <Notice tone="warning">
          {t(
            '{round}% of new savings would stay in cash, which barely beats inflation. Unless you need it soon, a mix with more shares and bonds usually reaches FI sooner.',
            { round: Math.round((chosen.cash ?? 0) * 100) },
          )}
        </Notice>
      )}
    </fieldset>
  );
}

/** The live "Estimated FI age" (UX doc, O2): right column on desktop, sticky footer on a phone. */
function LiveAge({ d }: { d: SetupDraft }) {
  const { settings, categories, activeAssumptions } = useAppData();
  const live = useMemo(
    () =>
      livePreview(d, {
        settings,
        categories,
        assumptionSet: activeAssumptions,
        today: today(),
        now: new Date().toISOString(),
      }),
    [d, settings, categories, activeAssumptions],
  );
  const p = live?.preview;
  return (
    <section
      aria-label={t('Estimated FI age')}
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-surface px-4 py-3 shadow-lg lg:sticky lg:top-6 lg:rounded-lg lg:border lg:p-5 lg:shadow-none"
    >
      <div className="text-sm text-muted-foreground">{t('Estimated FI age')}</div>
      {p?.fiAge !== undefined && p.yearsToFi !== undefined ? (
        <>
          <div className="text-2xl font-semibold tabular lg:text-4xl">{p.fiAge}</div>
          <div className="text-sm text-muted-foreground">
            {t('{date} · in {years} years', {
              date: dateAfterYears(p.asOfDate, p.yearsToFi),
              years: p.yearsToFi.toFixed(1),
            })}
          </div>
        </>
      ) : p ? (
        <div className="text-sm font-medium">
          {t('Not reached by {horizonAge} at this pace', { horizonAge: settings.horizonAge })}
        </div>
      ) : (
        <div className="text-sm">{t('Appears once you add pay and spending.')}</div>
      )}
      {live && (
        <div className="mt-1 hidden text-xs text-muted-foreground lg:block">
          {t('Investments now: {v}', { v: twdCompact(live.investableNow) })}
        </div>
      )}
    </section>
  );
}

export function SetupPage() {
  const { accounts, settings, categories, activeAssumptions } = useAppData();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<SetupDraft>(() => loadSetupDraft(settings.defaultSwr));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const year = yearOf(today());

  if (accounts.length > 0 && !saving) {
    return (
      <Notice>
        {t('Setup is for a fresh start, and this browser already has data.')}{' '}
        <Link to="/" className="text-primary hover:underline">
          {t('Go to my dashboard')}
        </Link>
      </Notice>
    );
  }

  const set = (p: Partial<SetupDraft>) =>
    setDraft((d) => {
      const next = { ...d, ...p };
      saveSetupDraft(next);
      return next;
    });

  const showErrors = (problems: string[]) => {
    setErrors(problems);
    // The error sits beside the step's fields, never below the fold.
    requestAnimationFrame(() => errorRef.current?.scrollIntoView?.({ block: 'center' }));
  };

  const go = (to: number) => {
    if (to > step) {
      const problems = validateStep(step, draft, year);
      if (problems.length) return showErrors(problems);
    }
    setErrors([]);
    setStep(to);
    window.scrollTo({ top: 0 });
  };

  const finish = async () => {
    for (let s = 0; s < STEPS.length; s++) {
      const problems = validateStep(s, draft, year);
      if (problems.length) {
        setStep(s);
        return showErrors(problems);
      }
    }
    setSaving(true);
    try {
      await applySetup(
        buildSetupRecords(draft, {
          settings,
          categories,
          assumptionSet: activeAssumptions,
          today: today(),
          now: new Date().toISOString(),
        }),
      );
      saveSetupDraft(undefined);
      // Ask the browser not to clear this site's storage under pressure (product review, issue 11).
      const kept = await requestPersistence();
      navigate(`/setup/done?storage=${kept ? 'kept' : 'not-kept'}`);
    } catch (e) {
      setSaving(false);
      showErrors([t('Could not save: {v}', { v: e instanceof Error ? e.message : String(e) })]);
    }
  };

  const last = step === STEPS.length - 1;

  return (
    <div className="mx-auto max-w-5xl pb-24 lg:pb-0">
      <h1 className="mb-1 text-2xl font-semibold">{t('Set up your plan')}</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        {t('Four short steps. Nothing is saved until you finish, and everything can be changed later.')}
      </p>
      <ol className="mb-5 flex flex-wrap gap-2" aria-label={t('Setup steps')}>
        {STEPS.map((name, i) => (
          <li key={name}>
            <button
              className={cn(
                'flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-xs',
                i === step
                  ? 'border-primary bg-surface font-medium text-foreground'
                  : i < step
                    ? 'text-foreground'
                    : 'text-subtle',
              )}
              disabled={i > step}
              aria-current={i === step ? 'step' : undefined}
              onClick={() => i < step && go(i)}
            >
              <span
                className={cn(
                  'grid size-4 place-items-center rounded-full text-xs',
                  i < step ? 'bg-primary text-primary-foreground' : 'bg-surface-2',
                )}
              >
                {i < step ? <Check className="size-3" aria-hidden /> : i + 1}
              </span>
              {name}
            </button>
          </li>
        ))}
      </ol>
      <div
        className={cn('grid grid-cols-1 items-start gap-4', step > 0 && 'lg:grid-cols-[minmax(0,1fr)_260px]')}
      >
        <Card>
          <CardContent className="flex flex-col gap-5 p-6">
            <div>
              <div className="text-xs text-subtle">
                {t('Step {v} of {length}', { v: step + 1, length: STEPS.length })}
              </div>
              <h2 className="text-xl font-semibold">{STEPS[step]}</h2>
            </div>
            {step === 0 && <StepAbout d={draft} set={set} />}
            {step === 1 && <StepAccounts d={draft} set={set} />}
            {step === 2 && <StepMoney d={draft} set={set} />}
            {step === 3 && <StepMix d={draft} set={set} />}
            {errors.length > 0 && (
              <div ref={errorRef}>
                <Notice tone="warning">
                  <ul className="list-disc pl-4">
                    {errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </Notice>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              {step > 0 && (
                <Button variant="ghost" onClick={() => go(step - 1)}>
                  {t('Back')}
                </Button>
              )}
              <div className="flex-1" />
              {last ? (
                <Button onClick={() => void finish()} disabled={saving}>
                  {saving ? t('Saving…') : t('Finish and see my result')}
                </Button>
              ) : (
                <Button onClick={() => go(step + 1)}>{t('Next')}</Button>
              )}
            </div>
          </CardContent>
        </Card>
        {step > 0 && <LiveAge d={draft} />}
      </div>
    </div>
  );
}
