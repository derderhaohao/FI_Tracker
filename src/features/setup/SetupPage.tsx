import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Plus, Trash2 } from 'lucide-react';
import { postEmploymentCosts } from '@/domain/fiNumber';
import { today, yearOf } from '@/domain/dates';
import { formatMoney, fromMinor } from '@/domain/money';
import { savingsRate } from '@/domain/cashflow';
import { useAppData } from '@/app/data';
import { requestPersistence } from '@/db/defaults';
import { ASSET_CLASS_LABELS, type Allocation, type AssetClass } from '@/domain/entities';
import { MoneyInput, NumberInput, PercentInput } from '@/components/MoneyInput';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { Notice, PageHeader, Stat } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { dateAfterYears, pct, twd, twdCompact } from '@/lib/format';
import {
  applySetup,
  buildSetupRecords,
  CASH_WARNING,
  chosenMix,
  currentAge,
  currentMix,
  MIX_PRESETS,
  draftAccount,
  emptyDraft,
  previewSetup,
  SETUP_KINDS,
  STEPS,
  validateStep,
  type DraftAccount,
  type MixChoice,
  type SetupDraft,
  type SetupKind,
} from './setupModel';

type StepProps = { d: SetupDraft; set: (p: Partial<SetupDraft>) => void };

const STORAGE_KEY = 'fi-tracker-setup-draft';

function loadDraft(swr: number): SetupDraft {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as SetupDraft;
  } catch {
    // Unavailable storage just means a fresh draft.
  }
  return emptyDraft(swr);
}

function saveDraft(d: SetupDraft | undefined) {
  try {
    if (d) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not critical.
  }
}

function Explain({ children }: { children: ReactNode }) {
  return <p className="max-w-2xl text-sm text-muted-foreground">{children}</p>;
}

function StepAbout({ d, set }: { d: SetupDraft; set: (p: Partial<SetupDraft>) => void }) {
  const age = currentAge(d.birthYear, today());
  return (
    <div className="flex flex-col gap-4">
      <Explain>
        Your age sets the timeline: when 勞退 unlocks (60), when 勞保 starts (65), and how many years your
        money must last.
      </Explain>
      <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Birth year" hint={age !== undefined ? `You turn ${age} this year` : 'For example 1990'}>
          {(id) => (
            <NumberInput
              id={id}
              value={d.birthYear}
              min={1900}
              max={2100}
              placeholder="YYYY"
              onCommit={(v) => set({ birthYear: v })}
            />
          )}
        </Field>
        <Field label="Target FI age (optional)" hint="An age you'd like to stop depending on a paycheck">
          {(id) => (
            <NumberInput
              id={id}
              value={d.targetFiAge}
              min={0}
              max={120}
              placeholder="none"
              onCommit={(v) => set({ targetFiAge: v })}
            />
          )}
        </Field>
      </div>
    </div>
  );
}

function StepAccounts({ d, set }: { d: SetupDraft; set: (p: Partial<SetupDraft>) => void }) {
  const update = (key: string, patch: Partial<DraftAccount>) =>
    set({ accounts: d.accounts.map((a) => (a.key === key ? { ...a, ...patch } : a)) });
  const hasUsd = d.accounts.some((a) => a.currency === 'USD');
  const [rateText, setRateText] = useState(d.usdRate ? String(d.usdRate) : '');
  return (
    <div className="flex flex-col gap-4">
      <Explain>
        List what you own and owe, with today’s balance. Rough numbers are fine; you will update them monthly
        in Snapshots. Use nicknames only, never account numbers.
      </Explain>
      <div className="flex flex-wrap gap-2" aria-label="Add an account">
        {(Object.keys(SETUP_KINDS) as SetupKind[]).map((k) => (
          <Button
            key={k}
            size="sm"
            variant="outline"
            onClick={() => set({ accounts: [...d.accounts, draftAccount(k, d.accounts)] })}
            title={SETUP_KINDS[k].hint}
          >
            <Plus aria-hidden /> {SETUP_KINDS[k].label}
          </Button>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {d.accounts.map((a) => (
          <div
            key={a.key}
            className="grid grid-cols-2 items-end gap-2 rounded-md border p-3 sm:grid-cols-[11.5rem_1fr_6rem_12rem_auto]"
          >
            <Field label="Kind" className="col-span-2 sm:col-span-1">
              {(id) => (
                <Select
                  id={id}
                  value={a.kind}
                  onChange={(e) =>
                    update(a.key, {
                      kind: e.target.value as SetupKind,
                      currency: SETUP_KINDS[e.target.value as SetupKind].currency,
                    })
                  }
                >
                  {(Object.keys(SETUP_KINDS) as SetupKind[]).map((k) => (
                    <option key={k} value={k}>
                      {SETUP_KINDS[k].label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Nickname" className="col-span-2 sm:col-span-1">
              {(id) => (
                <Input
                  id={id}
                  value={a.nickname}
                  onChange={(e) => update(a.key, { nickname: e.target.value })}
                />
              )}
            </Field>
            <Field label="Currency">
              {(id) => (
                <Select
                  id={id}
                  value={a.currency}
                  onChange={(e) => update(a.key, { currency: e.target.value as 'TWD' | 'USD' })}
                >
                  <option>TWD</option>
                  <option>USD</option>
                </Select>
              )}
            </Field>
            <Field label={a.kind === 'loan' ? 'Amount owed' : 'Balance today'}>
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
              aria-label={`Remove ${a.nickname}`}
              onClick={() => set({ accounts: d.accounts.filter((x) => x.key !== a.key) })}
            >
              <Trash2 />
            </Button>
            <p className="col-span-2 text-xs text-subtle sm:col-span-5">{SETUP_KINDS[a.kind].hint}</p>
          </div>
        ))}
      </div>
      {hasUsd && (
        <Field
          label="TWD per USD today"
          hint="Check your bank's rate; used to convert USD balances"
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

function StepMoney({ d, set }: { d: SetupDraft; set: (p: Partial<SetupDraft>) => void }) {
  const income = d.monthlyIncomeMinor !== undefined ? fromMinor(d.monthlyIncomeMinor) : undefined;
  const spending = d.monthlySpendingMinor !== undefined ? fromMinor(d.monthlySpendingMinor) : undefined;
  const rate = income !== undefined && spending !== undefined ? savingsRate(income, spending) : Number.NaN;
  return (
    <div className="flex flex-col gap-4">
      <Explain>
        A typical month, as two totals. Spending means everything that leaves your accounts: rent or loan
        payments, insurance, food, fun. You can split it into categories and add bonuses later on the Cash
        flow page.
      </Explain>
      <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Monthly take-home pay" hint="After tax, 勞健保 and any voluntary 勞退">
          {(id) => (
            <MoneyInput
              id={id}
              value={d.monthlyIncomeMinor}
              currency="TWD"
              onCommit={(v) => set({ monthlyIncomeMinor: v })}
            />
          )}
        </Field>
        <Field label="Monthly spending" hint="Everything you spend in a typical month">
          {(id) => (
            <MoneyInput
              id={id}
              value={d.monthlySpendingMinor}
              currency="TWD"
              onCommit={(v) => set({ monthlySpendingMinor: v })}
            />
          )}
        </Field>
      </div>
      {Number.isFinite(rate) && (
        <p className="text-sm">
          You save <strong>{twd((income ?? 0) - (spending ?? 0))}</strong> a month, a savings rate of{' '}
          <strong>{pct(rate)}</strong>.
          {rate < 0 && ' Spending is above pay, so savings are being drawn down.'}
        </p>
      )}
    </div>
  );
}

function StepGoal({ d, set }: { d: SetupDraft; set: (p: Partial<SetupDraft>) => void }) {
  const { settings } = useAppData();
  const post = postEmploymentCosts(settings.destination);
  const annual = d.fiSpendingMinor !== undefined ? fromMinor(d.fiSpendingMinor) : undefined;
  return (
    <div className="flex flex-col gap-4">
      <Explain>
        How much would you spend per year once you no longer need a paycheck? Today’s spending is a good
        start; adjust for things that change (a paid-off loan, more travel). The FI number is how big your
        investments must be to fund that.
      </Explain>
      <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Yearly spending once FI" hint="In today’s TWD">
          {(id) => (
            <MoneyInput
              id={id}
              value={d.fiSpendingMinor}
              currency="TWD"
              onCommit={(v) => set({ fiSpendingMinor: v })}
            />
          )}
        </Field>
        <Field
          label="Safe withdrawal rate"
          hint="Share of investments you spend each year. 4% is common; 3.5% is safer for 40+ years."
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
      </div>
      {annual !== undefined && annual > 0 && (
        <p className="text-sm">
          FI number: ({twd(annual)} + {twd(post)} self-paid NHI after leaving work) ÷ {pct(d.swr, 2)} ={' '}
          <strong>{twd((annual + post) / d.swr)}</strong>. Guaranteed income such as 勞保 lowers what you
          need; the projection accounts for it.
        </p>
      )}
    </div>
  );
}

function StepTaiwan({ d, set }: { d: SetupDraft; set: (p: Partial<SetupDraft>) => void }) {
  const t = d.taiwan;
  const setT = (p: Partial<SetupDraft['taiwan']>) => set({ taiwan: { ...t, ...p } });
  return (
    <div className="flex flex-col gap-4">
      <Explain>
        Optional, but it can move your FI date by years. 勞退 adds employer contributions to a locked account;
        the 勞保 annuity pays from 65 and reduces what your portfolio must cover. Your figures are on the
        勞保局 e化服務 site or app. Skip if unsure and fill it in later in Settings.
      </Explain>
      <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="勞退 monthly contribution wage"
          hint="月提繳工資; usually close to your monthly salary, max NT$150,000"
        >
          {(id) => (
            <MoneyInput
              id={id}
              value={t.pensionWageMinor}
              currency="TWD"
              onCommit={(v) => setT({ pensionWageMinor: v, skipped: false })}
            />
          )}
        </Field>
        <Field label="勞保 insured years so far" hint="保險年資">
          {(id) => (
            <Input
              id={id}
              type="number"
              step={0.5}
              min={0}
              defaultValue={t.insuredYears}
              onBlur={(e) =>
                setT({
                  insuredYears: e.target.value === '' ? undefined : Number(e.target.value),
                  skipped: false,
                })
              }
            />
          )}
        </Field>
        <Field label="勞保 average monthly insured salary" hint="平均月投保薪資; capped at NT$45,800">
          {(id) => (
            <MoneyInput
              id={id}
              value={t.avgInsuredSalaryMinor}
              currency="TWD"
              onCommit={(v) => setT({ avgInsuredSalaryMinor: v, skipped: false })}
            />
          )}
        </Field>
        <Field label="勞保 claim age" hint="65 for those born 1962 or later; up to 5 years earlier or later">
          {(id) => (
            <NumberInput
              id={id}
              value={t.claimAge}
              min={60}
              max={70}
              placeholder="65"
              onCommit={(v) => setT({ claimAge: v, skipped: false })}
            />
          )}
        </Field>
      </div>
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

function MixChoiceField({ d, set }: StepProps) {
  const current = currentMix(d);
  const options: { value: MixChoice; label: string; text: string }[] = [
    ...(current ? [{ value: 'current' as const, label: 'Keep my current mix', text: mixText(current) }] : []),
    ...(Object.entries(MIX_PRESETS) as [Exclude<MixChoice, 'current'>, (typeof MIX_PRESETS)['growth']][]).map(
      ([value, p]) => ({ value, label: p.label, text: p.text }),
    ),
  ];
  const chosen = chosenMix(d);
  return (
    <fieldset className="rounded-lg border p-4">
      <legend className="px-1 text-sm font-semibold">How should new savings be invested?</legend>
      <p className="mb-3 text-sm text-muted-foreground">
        The projection invests what you save each month in this mix. It matters: cash grows slowly, so a mix
        that is mostly cash pushes your FI date later. You can change it any time in Settings.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex cursor-pointer gap-2 rounded-md border p-3 text-sm',
              d.mix === o.value ? 'border-primary bg-surface-2' : 'hover:bg-surface-2',
            )}
          >
            <input
              type="radio"
              name="mix"
              className="mt-1"
              checked={d.mix === o.value}
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
        <Notice tone="warning" className="mt-3">
          {Math.round((chosen.cash ?? 0) * 100)}% of new savings would stay in cash, which barely beats
          inflation. Unless you need it soon, a mix with more shares and bonds usually reaches FI sooner.
        </Notice>
      )}
    </fieldset>
  );
}

function StepReview({ d, set }: StepProps) {
  const { settings, categories, activeAssumptions } = useAppData();
  const preview = useMemo(() => {
    const records = buildSetupRecords(d, {
      settings,
      categories,
      assumptionSet: activeAssumptions,
      today: today(),
      now: new Date().toISOString(),
    });
    return previewSetup(records);
  }, [d, settings, categories, activeAssumptions]);
  const owned = d.accounts.filter((a) => a.kind !== 'loan');
  return (
    <div className="flex flex-col gap-5">
      <MixChoiceField d={d} set={set} />
      <section className="rounded-lg border bg-surface-2 p-5">
        <div className="text-sm text-muted-foreground">Most likely FI date</div>
        {preview.fiAge !== undefined && preview.yearsToFi !== undefined ? (
          <>
            <div className="mt-1 text-4xl font-semibold tracking-tight">
              {dateAfterYears(preview.asOfDate, preview.yearsToFi)}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Age {preview.fiAge}, in {preview.yearsToFi.toFixed(1)} years if nothing changes ·{' '}
              {preview.success
                ? `money lasts to ${settings.horizonAge}`
                : `money runs out at ${preview.depletionAge}`}
            </div>
            {d.targetFiAge !== undefined && preview.fiAge > d.targetFiAge && (
              <p className="mt-2 text-sm">
                That is {preview.fiAge - d.targetFiAge} year{preview.fiAge - d.targetFiAge === 1 ? '' : 's'}{' '}
                after your target age of {d.targetFiAge}. The Goal page shows the monthly savings that would
                close the gap, and the Strategy Lab lets you test ways to get there.
              </p>
            )}
          </>
        ) : (
          <div className="mt-1 text-2xl font-semibold">
            Not reached by age {settings.horizonAge} at today’s savings
          </div>
        )}
        <p className="mt-2 text-xs text-subtle">
          Uses the default return and inflation assumptions; you can change them in Settings and test
          alternatives in the Strategy Lab.
        </p>
      </section>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Investable now"
          value={twdCompact(preview.investableNow)}
          sub={`${owned.length} account${owned.length === 1 ? '' : 's'} you own`}
        />
        <Stat
          label="Saving per month"
          value={twdCompact(fromMinor((d.monthlyIncomeMinor ?? 0) - (d.monthlySpendingMinor ?? 0)))}
          sub={`Pay ${twd(fromMinor(d.monthlyIncomeMinor ?? 0))} · spend ${twd(fromMinor(d.monthlySpendingMinor ?? 0))}`}
        />
        <Stat
          label="FI number"
          value={twdCompact(preview.fiNumber)}
          sub={`${twd(fromMinor(d.fiSpendingMinor ?? 0))}/yr at ${pct(d.swr, 2)}`}
        />
      </div>
      <div className="text-sm">
        <h3 className="mb-1 font-semibold">What will be saved</h3>
        <ul className="list-disc pl-5 text-muted-foreground">
          <li>
            Birth year {d.birthYear}
            {d.targetFiAge ? `, target FI age ${d.targetFiAge}` : ''}.
          </li>
          <li>
            {d.accounts.length} account{d.accounts.length === 1 ? '' : 's'} with today’s balances:{' '}
            {d.accounts
              .map(
                (a) =>
                  `${a.nickname} ${formatMoney(fromMinor(a.balanceMinor ?? 0), a.currency, { compact: true })}`,
              )
              .join(', ')}
            {d.usdRate ? ` (USD at ${d.usdRate})` : ''}.
          </li>
          <li>
            Last month’s pay (Salary) and spending (a “Living costs” category, which also holds your FI
            budget).
          </li>
          <li>{d.taiwan.skipped ? 'Taiwan pension details skipped.' : 'Your 勞退 and 勞保 details.'}</li>
          <li>
            {chosenMix(d)
              ? `New savings invested as: ${mixText(chosenMix(d)!)}.`
              : 'Choose how new savings are invested, above.'}
          </li>
          <li>Your browser is asked to keep this data safe from automatic clean-up when space runs low.</li>
        </ul>
      </div>
    </div>
  );
}

export function SetupPage() {
  const { accounts, settings, categories, activeAssumptions } = useAppData();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<SetupDraft>(() => loadDraft(settings.defaultSwr));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const year = yearOf(today());

  if (accounts.length > 0 && !saving) {
    return (
      <>
        <PageHeader title="Set up FI Tracker" />
        <Notice>
          Setup is for a fresh start, and this browser already has data. Add to it from{' '}
          <Link to="/accounts" className="text-primary hover:underline">
            Accounts
          </Link>{' '}
          and{' '}
          <Link to="/snapshots" className="text-primary hover:underline">
            Snapshots
          </Link>
          , or go to the{' '}
          <Link to="/" className="text-primary hover:underline">
            Dashboard
          </Link>
          .
        </Notice>
      </>
    );
  }

  const set = (p: Partial<SetupDraft>) =>
    setDraft((d) => {
      const next = { ...d, ...p };
      saveDraft(next);
      return next;
    });

  const go = (to: number) => {
    if (to > step) {
      const problems = validateStep(step, draft, year);
      if (problems.length) {
        setErrors(problems);
        return;
      }
      // Pre-fill the FI budget from today's spending the first time the goal step opens.
      if (to === 3 && draft.fiSpendingMinor === undefined && draft.monthlySpendingMinor)
        set({ fiSpendingMinor: draft.monthlySpendingMinor * 12 });
    }
    setErrors([]);
    setStep(to);
    window.scrollTo({ top: 0 });
  };

  const finish = async () => {
    const problems = validateStep(step, draft, year);
    if (problems.length) {
      setErrors(problems);
      return;
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
      saveDraft(undefined);
      // Ask the browser not to clear this site's storage under pressure (product review, issue 11).
      const kept = await requestPersistence();
      navigate(`/?setup=done&storage=${kept ? 'kept' : 'not-kept'}`);
    } catch (e) {
      setSaving(false);
      setErrors([`Could not save: ${e instanceof Error ? e.message : String(e)}`]);
    }
  };

  const last = step === STEPS.length - 1;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Set up FI Tracker"
        description="The minimum the projection needs. Everything is saved at the end, and can be changed later."
      />
      <ol className="mb-5 flex flex-wrap gap-2" aria-label="Setup steps">
        {STEPS.map((name, i) => (
          <li key={name}>
            <button
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs',
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
                  'grid size-4 place-items-center rounded-full text-[10px]',
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
      <Card>
        <CardContent className="flex flex-col gap-5 p-6">
          <div>
            <div className="text-xs text-subtle">
              Step {step + 1} of {STEPS.length}
            </div>
            <h2 className="text-xl font-semibold">{STEPS[step]}</h2>
          </div>
          {step === 0 && <StepAbout d={draft} set={set} />}
          {step === 1 && <StepAccounts d={draft} set={set} />}
          {step === 2 && <StepMoney d={draft} set={set} />}
          {step === 3 && <StepGoal d={draft} set={set} />}
          {step === 4 && <StepTaiwan d={draft} set={set} />}
          {step === 5 && <StepReview d={draft} set={set} />}
          {errors.length > 0 && (
            <Notice tone="warning">
              <ul className="list-disc pl-4">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Notice>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            {step > 0 && (
              <Button variant="ghost" onClick={() => go(step - 1)}>
                Back
              </Button>
            )}
            <div className="flex-1" />
            {step === 4 && (
              <Button
                variant="outline"
                onClick={() => {
                  set({ taiwan: { ...draft.taiwan, skipped: true } });
                  setErrors([]);
                  setStep(5);
                }}
              >
                Skip for now
              </Button>
            )}
            {last ? (
              <Button onClick={() => void finish()} disabled={saving}>
                {saving ? 'Saving…' : 'Finish and see my dashboard'}
              </Button>
            ) : (
              <Button onClick={() => go(step + 1)}>Next</Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
