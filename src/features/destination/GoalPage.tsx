import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import type { Category, FiTier } from '@/domain/entities';
import { coastFi, fiNumber, fiTarget } from '@/domain/fiNumber';
import { fromMinor, parseMoneyInput } from '@/domain/money';
import { laborInsuranceYears, portfolioRealReturn, targetStreams } from '@/domain/projection';
import { laborInsuranceAnnual } from '@/domain/taiwan/laborInsurance';
import { db } from '@/db/db';
import { newId, patch, save } from '@/db/repo';
import { useAppData } from '@/app/data';
import { AssumptionBadge } from '@/components/AssumptionBadge';
import { PlanHealthCard } from '@/components/PlanHealthCard';
import { InfoTip, Term } from '@/components/ui/term';
import { LineChart } from '@/components/charts/LineChart';
import { MoneyInput, NumberInput, PercentInput } from '@/components/MoneyInput';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox, Field, Input } from '@/components/ui/input';
import { Badge, Notice, PageHeader, Segmented, Stat, Table } from '@/components/ui/misc';
import { budgetVsActual, formatDate, monthLabel, pct, twd, twdCompact } from '@/lib/format';
import { addMonths } from '@/domain/dates';
import { LOAN_CATEGORY, loanTarget, type LoanSchedule } from '@/domain/loans';
import { t } from '@/i18n';

const TIER_LABELS: Record<FiTier, string> = { lean: t('Lean'), full: t('Full'), fat: t('Fat') };

function updateDestination(changes: Partial<ReturnType<typeof useAppData>['settings']['destination']>) {
  return db.settings
    .get('singleton')
    .then((s) => s && patch(db.settings, 'singleton', { destination: { ...s.destination, ...changes } }));
}

function BudgetRow({ c, actual, loans }: { c: Category; actual: number; loans: LoanSchedule[] }) {
  const { categories } = useAppData();
  const mine = loans.filter((l) =>
    l.mode === 'auto' ? loanTarget(l, categories)?.id === c.id : l.categoryId === c.id,
  );
  const until = mine.reduce((m, l) => (l.endMonth > m ? l.endMonth : m), '');
  const loanNote = mine.length
    ? t('Loan payments of {amount}/mo are added separately until {month}; leave them out of the FI budget.', {
        amount: twd(mine.reduce((sum, l) => sum + l.monthly, 0)),
        month: monthLabel(addMonths(until, -1)),
      })
    : undefined;
  return (
    <tr>
      <td className="font-medium">
        <span className="inline-flex items-center gap-1">
          {c.name}
          {loanNote && <InfoTip label={t('About loan payments')}>{loanNote}</InfoTip>}
        </span>
      </td>
      <td>
        <Checkbox
          label={t('Essential')}
          checked={c.essential}
          onChange={(e) => void patch(db.categories, c.id, { essential: e.target.checked })}
        />
      </td>
      <td className="w-44">
        {c.system === LOAN_CATEGORY ? (
          <span className="text-subtle">—</span>
        ) : (
          <MoneyInput
            aria-label={t('FI budget for {name}', { name: c.name })}
            value={c.fiAnnualMinor}
            currency="TWD"
            onCommit={(v) => void patch(db.categories, c.id, { fiAnnualMinor: v })}
          />
        )}
      </td>
      <td className="text-right whitespace-nowrap text-muted-foreground tabular">
        {actual > 0 ? twd(actual) : '—'}
      </td>
      <td className="min-w-24 text-right whitespace-nowrap text-muted-foreground">
        {budgetVsActual(c.fiAnnualMinor, actual)}
      </td>
    </tr>
  );
}

function IncomeStreams() {
  const { incomeStreams } = useAppData();
  const [draft, setDraft] = useState({
    name: '',
    startAge: '',
    endAge: '',
    annual: '',
    inflationLinked: true,
  });
  const annual = parseMoneyInput(draft.annual);
  const valid =
    draft.name.trim() &&
    /^\d+$/.test(draft.startAge) &&
    (draft.endAge === '' || /^\d+$/.test(draft.endAge)) &&
    annual !== null &&
    annual > 0;
  return (
    <Table>
      <thead>
        <tr>
          <th>{t('Stream')}</th>
          <th className="text-right">{t('Start age')}</th>
          <th className="text-right">{t('End age')}</th>
          <th className="text-right">{t("Per year (today's TWD)")}</th>
          <th>{t('Inflation-linked')}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {incomeStreams.map((s) => (
          <tr key={s.id}>
            <td className="font-medium">{s.name}</td>
            <td className="w-24">
              <NumberInput
                aria-label={t('Start age')}
                value={s.startAge}
                min={0}
                max={120}
                onCommit={(v) => v !== undefined && void patch(db.incomeStreams, s.id, { startAge: v })}
                className="h-8"
              />
            </td>
            <td className="w-24">
              <NumberInput
                aria-label={t('End age')}
                value={s.endAge}
                min={0}
                max={120}
                onCommit={(v) => void patch(db.incomeStreams, s.id, { endAge: v })}
                className="h-8"
              />
            </td>
            <td className="w-44">
              <MoneyInput
                aria-label={t('Annual amount')}
                value={s.annualMinor}
                currency="TWD"
                onCommit={(v) => void patch(db.incomeStreams, s.id, { annualMinor: v ?? 0 })}
              />
            </td>
            <td>
              <Checkbox
                aria-label={t('Inflation-linked')}
                checked={s.inflationLinked}
                onChange={(e) => void patch(db.incomeStreams, s.id, { inflationLinked: e.target.checked })}
              />
            </td>
            <td className="text-right">
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('Delete {name}', { name: s.name })}
                onClick={() => void db.incomeStreams.delete(s.id)}
              >
                <Trash2 />
              </Button>
            </td>
          </tr>
        ))}
        <tr>
          <td>
            <Input
              aria-label={t('Stream name')}
              className="h-8"
              placeholder={t('Rental, part-time…')}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </td>
          <td>
            <Input
              aria-label={t('New start age')}
              className="h-8 text-right"
              inputMode="numeric"
              value={draft.startAge}
              onChange={(e) => setDraft({ ...draft, startAge: e.target.value })}
            />
          </td>
          <td>
            <Input
              aria-label={t('New end age')}
              className="h-8 text-right"
              inputMode="numeric"
              placeholder={t('none')}
              value={draft.endAge}
              onChange={(e) => setDraft({ ...draft, endAge: e.target.value })}
            />
          </td>
          <td>
            <Input
              aria-label={t('New annual amount')}
              className="h-8 text-right"
              inputMode="decimal"
              value={draft.annual}
              onChange={(e) => setDraft({ ...draft, annual: e.target.value })}
            />
          </td>
          <td>
            <Checkbox
              aria-label={t('New stream inflation-linked')}
              checked={draft.inflationLinked}
              onChange={(e) => setDraft({ ...draft, inflationLinked: e.target.checked })}
            />
          </td>
          <td className="text-right">
            <Button
              size="sm"
              disabled={!valid}
              title={valid ? undefined : t('Enter a name, a start age and an amount first')}
              onClick={() => {
                if (!valid || annual === null) return;
                void save(db.incomeStreams, {
                  id: newId(),
                  name: draft.name.trim(),
                  startAge: Number(draft.startAge),
                  endAge: draft.endAge === '' ? undefined : Number(draft.endAge),
                  annualMinor: annual,
                  inflationLinked: draft.inflationLinked,
                });
                setDraft({ name: '', startAge: '', endAge: '', annual: '', inflationLinked: true });
              }}
            >
              <Plus aria-hidden /> {t('Add')}
            </Button>
          </td>
        </tr>
      </tbody>
    </Table>
  );
}

function GoalHistoryCard() {
  const { goalHistory } = useAppData();
  const rows = [...goalHistory].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <Card className="lg:col-span-3">
      <CardHeader
        title={t('Goal history')}
        description={t(
          'Recorded automatically whenever the FI budget, tier, SWR, guaranteed income or target age changes (one entry per day).',
        )}
      />
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('No history yet. It starts once an FI budget is set.')}
          </p>
        ) : (
          <>
            {rows.length > 1 && (
              <LineChart
                ariaLabel={t('FI number over time')}
                data={rows.map((r) => ({ date: r.date, fiNumber: fromMinor(r.fiNumberMinor) }))}
                xKey="date"
                series={[{ key: 'fiNumber', label: t('FI number'), slot: 0 }]}
                height={200}
              />
            )}
            <Table className="mt-3">
              <thead>
                <tr>
                  <th>{t('Date')}</th>
                  <th>{t('Tier')}</th>
                  <th className="text-right">{t('FI spending / yr')}</th>
                  <th className="text-right">{t('Guaranteed / yr')}</th>
                  <th className="text-right">{t('SWR')}</th>
                  <th className="text-right">{t('Target age')}</th>
                  <th className="text-right">{t('FI number')}</th>
                  <th className="text-right">{t('Change')}</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .map((r, i) => ({ r, prev: rows[i - 1] }))
                  .reverse()
                  .map(({ r, prev }) => {
                    const change = prev ? fromMinor(r.fiNumberMinor - prev.fiNumberMinor) : undefined;
                    return (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap">{formatDate(r.date)}</td>
                        <td>{TIER_LABELS[r.fiTier]}</td>
                        <td className="text-right">{twd(fromMinor(r.fiSpendingMinor))}</td>
                        <td className="text-right">{twdCompact(fromMinor(r.guaranteedIncomeMinor))}</td>
                        <td className="text-right">{pct(r.swr, 2)}</td>
                        <td className="text-right">{r.targetFiAge ?? '—'}</td>
                        <td className="text-right font-medium">{twdCompact(fromMinor(r.fiNumberMinor))}</td>
                        <td className="text-right text-muted-foreground">
                          {change === undefined
                            ? t('first')
                            : `${change >= 0 ? '+' : ''}${twdCompact(change)}`}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function GoalPage() {
  const data = useAppData();
  const { settings, categories, ctx, baselineInput, activeAssumptions } = data;
  const d = settings.destination;
  const expense = categories.filter((c) => c.kind === 'expense');
  const startAge = ctx.startAge;
  // Valued at the plan's stop age, like the Dashboard's FI number.
  const G = data.guaranteedIncome;
  const swr = settings.defaultSwr;
  const tiers = ctx.tiers;
  const li = activeAssumptions.taiwan.laborInsurance;
  const laborNow = li.enabled
    ? laborInsuranceAnnual(
        li,
        laborInsuranceYears(baselineInput, d.targetFiAge ?? startAge),
        li.claimAge,
        li.haircut,
      )
    : 0;

  const targetAge = d.targetFiAge;
  const planAge = data.baseline.retireAge ?? data.baseline.fiAge;
  const coast =
    targetAge !== undefined && targetAge > startAge
      ? coastFi(
          fiTarget(
            baselineInput.fiSpending,
            targetStreams(baselineInput, targetAge),
            swr,
            targetAge,
            baselineInput.horizonAge,
          ),
          portfolioRealReturn(baselineInput),
          targetAge - startAge,
        )
      : undefined;
  const targetMoney =
    targetAge !== undefined
      ? fiTarget(
          baselineInput.fiSpending,
          targetStreams(baselineInput, targetAge),
          swr,
          targetAge,
          baselineInput.horizonAge,
        )
      : undefined;

  return (
    <>
      <PageHeader
        title={t('Goal')}
        description={t(
          'What FI means for you: the FI-phase budget by category, guaranteed income, and the safe withdrawal rate.',
        )}
        actions={<AssumptionBadge set={activeAssumptions} />}
      />
      <PlanHealthCard
        compact
        note={
          G > 0
            ? t(
                'The FI numbers below count {G} a year of guaranteed income, as the plan receives it if you stop at {planStopAge}.',
                { G: twdCompact(G), planStopAge: data.planStopAge },
              )
            : undefined
        }
      />
      {ctx.fiSpendingFromT12 && (
        <Notice tone="warning" className="mb-4">
          {t(
            'No FI budget yet, so FI spending uses your trailing-12-month spending ({annualExpense}). Fill in the annual FI-phase amount per category below.',
            { annualExpense: twd(ctx.annualSpendingExLoans) },
          )}
        </Notice>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {(['lean', 'full', 'fat'] as const).map((tier) => (
          <Stat
            key={tier}
            className={d.fiTier === tier ? 'border-primary' : undefined}
            label={
              <span className="flex items-center gap-2">
                {t('{TIER_LABELS} FI', { TIER_LABELS: TIER_LABELS[tier] })}{' '}
                {d.fiTier === tier && <Badge tone="primary">{t('Plan')}</Badge>}
              </span>
            }
            value={twdCompact(
              fiNumber(
                ctx.fiSpendingFromT12 ? ctx.annualSpendingExLoans + tiers.postEmployment : tiers[tier],
                G,
                swr,
              ),
            )}
            sub={t('Spending {twd}/yr{v} ÷ SWR {swr}', {
              twd: twd(
                ctx.fiSpendingFromT12 ? ctx.annualSpendingExLoans + tiers.postEmployment : tiers[tier],
              ),
              v: G > 0 ? t(' − guaranteed {G}', { G: twdCompact(G) }) : '',
              swr: pct(swr, 2),
            })}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={t('FI budget')}
            description={t(
              'Annual spending once FI, per category. Trailing-12-month actuals are the reality check.',
            )}
          />
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <th>{t('Category')}</th>
                  <th>{t('Tier')}</th>
                  <th className="text-right">{t('FI budget / year (TWD)')}</th>
                  <th className="text-right">{t('Last 12 months')}</th>
                  <th className="text-right">{t('Budget vs now')}</th>
                </tr>
              </thead>
              <tbody>
                {expense.map((c) => (
                  <BudgetRow key={c.id} c={c} actual={ctx.t12.byCategory[c.id] ?? 0} loans={ctx.loans} />
                ))}
                <tr className="font-medium">
                  <td>{t('Total')}</td>
                  <td />
                  <td className="text-right">{twd(tiers.full - tiers.postEmployment)}</td>
                  <td className="text-right">{twd(ctx.t12.expense)}</td>
                  <td />
                </tr>
              </tbody>
            </Table>
            <p className="mt-2 text-xs text-subtle">
              {t(
                '“Budget vs now”: how much more or less the FI budget is than you spent in the last 12 months. Lean counts essential categories only. Fat multiplies Full by the fat multiplier. Trailing actuals cover {monthsWithData} month{v}; add categories in Settings.',
                { monthsWithData: ctx.t12.monthsWithData, v: ctx.t12.monthsWithData === 1 ? '' : 's' },
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title={t('Settings')} />
          <CardContent className="flex flex-col gap-4">
            <Field label={t('Plan on tier')}>
              {() => (
                <Segmented
                  label={t('FI tier')}
                  value={d.fiTier}
                  options={(['lean', 'full', 'fat'] as const).map((tier) => ({
                    value: tier,
                    label: TIER_LABELS[tier],
                  }))}
                  onChange={(v) => void updateDestination({ fiTier: v })}
                />
              )}
            </Field>
            <Field
              label={<Term k="drawRate" advanced />}
              hint={t('Default 4%; 3.25–3.5% is more conservative for 40+ years')}
            >
              {(id) => (
                <PercentInput
                  id={id}
                  value={swr}
                  min={0.025}
                  max={0.05}
                  step={0.05}
                  onCommit={(v) => v !== undefined && void patch(db.settings, 'singleton', { defaultSwr: v })}
                />
              )}
            </Field>
            <Field label={t('Fat multiplier')} hint={t('Fat = Full × this')}>
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  step={0.05}
                  min={1}
                  max={5}
                  defaultValue={d.fatMultiplier}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v >= 1 && v <= 5) void updateDestination({ fatMultiplier: v });
                  }}
                />
              )}
            </Field>
            <Field label={t('Target FI age')} hint={t('Optional; compares it with your plan below')}>
              {(id) => (
                <NumberInput
                  id={id}
                  value={d.targetFiAge}
                  min={startAge}
                  max={settings.horizonAge}
                  placeholder={t('none')}
                  onCommit={(v) => void updateDestination({ targetFiAge: v })}
                />
              )}
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title={t('After leaving work')} description={t("Added to every tier's FI spending.")} />
          <CardContent className="flex flex-col gap-3">
            <Field label={t('Self-paid NHI premium / month')}>
              {(id) => (
                <MoneyInput
                  id={id}
                  value={d.nhiMonthlyMinor}
                  currency="TWD"
                  onCommit={(v) => void updateDestination({ nhiMonthlyMinor: v ?? 0 })}
                />
              )}
            </Field>
            <Field label={t('Private health insurance / year')}>
              {(id) => (
                <MoneyInput
                  id={id}
                  value={d.privateInsuranceAnnualMinor}
                  currency="TWD"
                  onCommit={(v) => void updateDestination({ privateInsuranceAnnualMinor: v ?? 0 })}
                />
              )}
            </Field>
            <Field label={t('Healthcare reserve / year')}>
              {(id) => (
                <MoneyInput
                  id={id}
                  value={d.healthcareReserveAnnualMinor}
                  currency="TWD"
                  onCommit={(v) => void updateDestination({ healthcareReserveAnnualMinor: v ?? 0 })}
                />
              )}
            </Field>
            <p className="text-sm text-muted-foreground">
              {t('Total {postEmployment} a year.', { postEmployment: twd(tiers.postEmployment) })}
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title={t('Guaranteed income')}
            description={t(
              'Streams that reduce what the portfolio must cover once you stop working. 勞退 is not listed here: its balance unlocks into the portfolio at its access age.',
            )}
          />
          <CardContent>
            <IncomeStreams />
            <p className="mt-3 text-sm text-muted-foreground">
              {li.enabled ? (
                <>
                  {t('Estimated 勞保 annuity from age {claimAge}:', { claimAge: li.claimAge })}{' '}
                  <strong>{twd(laborNow)}</strong> {t("a year (today's TWD), from Taiwan settings.")}{' '}
                </>
              ) : (
                <>{t('The 勞保 annuity is off.')} </>
              )}
              <Link to="/settings/taiwan" className="text-primary hover:underline">
                {t('Taiwan settings')}
              </Link>
            </p>
          </CardContent>
        </Card>

        {targetAge !== undefined && (
          <Card className="lg:col-span-3">
            <CardHeader
              title={t('Your target age: {targetAge}', { targetAge })}
              description={t('From the same year-by-year projection as the Dashboard, so the answers match.')}
            />
            <CardContent className="text-sm">
              {planAge === undefined ? (
                <p>
                  {t(
                    "On the typical path your investments do not reach the money needed before {horizonAge}, so {targetAge} is out of reach at today's savings.",
                    { horizonAge: settings.horizonAge, targetAge },
                  )}
                </p>
              ) : planAge <= targetAge ? (
                <p>
                  {t('On the typical path you could stop at {planAge}', { planAge })}
                  {planAge < targetAge
                    ? t(', {v} year{v2} before your target', {
                        v: targetAge - planAge,
                        v2: targetAge - planAge === 1 ? '' : 's',
                      })
                    : t(', right on your target')}
                  .
                </p>
              ) : (
                <p>
                  {t(
                    'On the typical path you could stop at {planAge}, {v} year{v2} after your target. To see what closes the gap, try “Retire at {targetAge}” in the',
                    { planAge, v: planAge - targetAge, v2: planAge - targetAge === 1 ? '' : 's', targetAge },
                  )}{' '}
                  <Link to="/lab" className="text-primary hover:underline">
                    {t('Strategy Lab')}
                  </Link>
                  {t(': it shows the chance your money lasts and which changes help most.')}
                </p>
              )}
              {targetMoney !== undefined && (
                <p className="mt-1 text-muted-foreground">
                  {t(
                    'Money needed to stop at {targetAge}: {targetMoney} in usable investments (FI number plus a',
                    { targetAge, targetMoney: twdCompact(targetMoney) },
                  )}{' '}
                  <Term k="bridgeFund">{t('bridge fund')}</Term> {t('until pensions start).')}
                </p>
              )}
              {coast !== undefined && (
                <p className="mt-1 text-muted-foreground">
                  <Term k="coastFi" />: {twdCompact(coast)}.{' '}
                  {ctx.netWorth.investable >= coast
                    ? t(
                        'You have passed it: even with no more saving, your usable investments would typically grow to the money needed by {targetAge}.',
                        { targetAge },
                      )
                    : t('You are {pct} of the way there.', { pct: pct(ctx.netWorth.investable / coast, 0) })}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <GoalHistoryCard />
      </div>
      <p className="mt-4 text-xs text-subtle">
        {t(
          "Annual amounts are in today's TWD. Streams that are not inflation-linked lose real value over time.",
        )}
      </p>
    </>
  );
}
