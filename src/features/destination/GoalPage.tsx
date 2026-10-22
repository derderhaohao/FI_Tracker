import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import type { Category, FiTier } from '@/domain/entities';
import {
  coastFi,
  fiNumber,
  fiTarget,
  permanentIncome,
  requiredAnnualSavings,
  yearsToFi,
} from '@/domain/fiNumber';
import { fromMinor, parseMoneyInput } from '@/domain/money';
import { guaranteedStreams, laborInsuranceYears, portfolioRealReturn } from '@/domain/projection';
import { laborInsuranceAnnual } from '@/domain/taiwan/laborInsurance';
import { db } from '@/db/db';
import { newId, patch, save } from '@/db/repo';
import { useAppData } from '@/app/data';
import { AssumptionBadge } from '@/components/AssumptionBadge';
import { MoneyInput, NumberInput, PercentInput } from '@/components/MoneyInput';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox, Field, Input } from '@/components/ui/input';
import { Badge, Notice, PageHeader, Segmented, Stat, Table } from '@/components/ui/misc';
import { pct, twd, twdCompact } from '@/lib/format';

const TIER_LABELS: Record<FiTier, string> = { lean: 'Lean', full: 'Full', fat: 'Fat' };

function updateDestination(changes: Partial<ReturnType<typeof useAppData>['settings']['destination']>) {
  return db.settings
    .get('singleton')
    .then((s) => s && patch(db.settings, 'singleton', { destination: { ...s.destination, ...changes } }));
}

function BudgetRow({ c, actual }: { c: Category; actual: number }) {
  return (
    <tr>
      <td className="font-medium">{c.name}</td>
      <td>
        <Checkbox
          label="Essential"
          checked={c.essential}
          onChange={(e) => void patch(db.categories, c.id, { essential: e.target.checked })}
        />
      </td>
      <td className="w-44">
        <MoneyInput
          aria-label={`FI budget for ${c.name}`}
          value={c.fiAnnualMinor}
          currency="TWD"
          onCommit={(v) => void patch(db.categories, c.id, { fiAnnualMinor: v })}
        />
      </td>
      <td className="text-right text-muted-foreground">{actual > 0 ? twd(actual) : '—'}</td>
      <td className="text-right text-muted-foreground">
        {c.fiAnnualMinor !== undefined && actual > 0 ? pct(fromMinor(c.fiAnnualMinor) / actual - 1, 0) : ''}
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
          <th>Stream</th>
          <th className="text-right">Start age</th>
          <th className="text-right">End age</th>
          <th className="text-right">Per year (today's TWD)</th>
          <th>Inflation-linked</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {incomeStreams.map((s) => (
          <tr key={s.id}>
            <td className="font-medium">{s.name}</td>
            <td className="w-24">
              <NumberInput
                aria-label="Start age"
                value={s.startAge}
                min={0}
                max={120}
                onCommit={(v) => v !== undefined && void patch(db.incomeStreams, s.id, { startAge: v })}
                className="h-8"
              />
            </td>
            <td className="w-24">
              <NumberInput
                aria-label="End age"
                value={s.endAge}
                min={0}
                max={120}
                onCommit={(v) => void patch(db.incomeStreams, s.id, { endAge: v })}
                className="h-8"
              />
            </td>
            <td className="w-44">
              <MoneyInput
                aria-label="Annual amount"
                value={s.annualMinor}
                currency="TWD"
                onCommit={(v) => void patch(db.incomeStreams, s.id, { annualMinor: v ?? 0 })}
              />
            </td>
            <td>
              <input
                type="checkbox"
                aria-label="Inflation-linked"
                checked={s.inflationLinked}
                onChange={(e) => void patch(db.incomeStreams, s.id, { inflationLinked: e.target.checked })}
              />
            </td>
            <td className="text-right">
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Delete ${s.name}`}
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
              aria-label="Stream name"
              className="h-8"
              placeholder="Rental, part-time…"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </td>
          <td>
            <Input
              aria-label="New start age"
              className="h-8 text-right"
              inputMode="numeric"
              value={draft.startAge}
              onChange={(e) => setDraft({ ...draft, startAge: e.target.value })}
            />
          </td>
          <td>
            <Input
              aria-label="New end age"
              className="h-8 text-right"
              inputMode="numeric"
              placeholder="none"
              value={draft.endAge}
              onChange={(e) => setDraft({ ...draft, endAge: e.target.value })}
            />
          </td>
          <td>
            <Input
              aria-label="New annual amount"
              className="h-8 text-right"
              inputMode="decimal"
              value={draft.annual}
              onChange={(e) => setDraft({ ...draft, annual: e.target.value })}
            />
          </td>
          <td>
            <input
              type="checkbox"
              aria-label="New stream inflation-linked"
              checked={draft.inflationLinked}
              onChange={(e) => setDraft({ ...draft, inflationLinked: e.target.checked })}
            />
          </td>
          <td className="text-right">
            <Button
              size="sm"
              disabled={!valid}
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
              <Plus aria-hidden /> Add
            </Button>
          </td>
        </tr>
      </tbody>
    </Table>
  );
}

export function GoalPage() {
  const data = useAppData();
  const { settings, categories, ctx, baselineInput, activeAssumptions } = data;
  const d = settings.destination;
  const expense = categories.filter((c) => c.kind === 'expense');
  const startAge = ctx.startAge;
  const streamsNow = guaranteedStreams(baselineInput, startAge);
  const G = permanentIncome(streamsNow, baselineInput.horizonAge);
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
  const r = portfolioRealReturn(baselineInput);
  const P = ctx.netWorth.investable;
  const target =
    targetAge !== undefined
      ? fiTarget(
          baselineInput.fiSpending,
          guaranteedStreams(baselineInput, targetAge),
          swr,
          targetAge,
          baselineInput.horizonAge,
        )
      : undefined;
  const yearsLeft = targetAge !== undefined ? targetAge - startAge : undefined;
  const needAnnual =
    target !== undefined && yearsLeft !== undefined
      ? requiredAnnualSavings(P, target, r, yearsLeft)
      : undefined;
  const currentMonthly = ctx.t12.monthsWithData > 0 ? ctx.t12.savings / ctx.t12.monthsWithData : 0;
  const coast = target !== undefined && yearsLeft !== undefined ? coastFi(target, r, yearsLeft) : undefined;
  const closedFormYears = yearsToFi(P, Math.max(0, currentMonthly * 12), data.fiNumberNow, r);

  return (
    <>
      <PageHeader
        title="Goal"
        description="What FI means for you: the FI-phase budget by category, guaranteed income, and the safe withdrawal rate."
        actions={<AssumptionBadge set={activeAssumptions} />}
      />
      {ctx.fiSpendingFromT12 && (
        <Notice tone="warning" className="mb-4">
          No FI budget yet, so FI spending uses your trailing-12-month spending ({twd(ctx.t12.annualExpense)}
          ). Fill in the annual FI-phase amount per category below.
        </Notice>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {(['lean', 'full', 'fat'] as const).map((t) => (
          <Stat
            key={t}
            className={d.fiTier === t ? 'border-primary' : undefined}
            label={
              <span className="flex items-center gap-2">
                {TIER_LABELS[t]} FI {d.fiTier === t && <Badge tone="primary">Plan</Badge>}
              </span>
            }
            value={twdCompact(
              fiNumber(
                ctx.fiSpendingFromT12 ? ctx.t12.annualExpense + tiers.postEmployment : tiers[t],
                G,
                swr,
              ),
            )}
            sub={`Spending ${twd(ctx.fiSpendingFromT12 ? ctx.t12.annualExpense + tiers.postEmployment : tiers[t])}/yr${G > 0 ? ` − guaranteed ${twdCompact(G)}` : ''} ÷ SWR ${pct(swr, 2)}`}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="FI budget"
            description="Annual spending once FI, per category. Trailing-12-month actuals are the reality check."
          />
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Tier</th>
                  <th>FI budget / year</th>
                  <th className="text-right">Last 12 months</th>
                  <th className="text-right">vs actual</th>
                </tr>
              </thead>
              <tbody>
                {expense.map((c) => (
                  <BudgetRow key={c.id} c={c} actual={ctx.t12.byCategory[c.id] ?? 0} />
                ))}
                <tr className="font-medium">
                  <td>Total</td>
                  <td />
                  <td className="text-right">{twd(tiers.full - tiers.postEmployment)}</td>
                  <td className="text-right">{twd(ctx.t12.expense)}</td>
                  <td />
                </tr>
              </tbody>
            </Table>
            <p className="mt-2 text-xs text-subtle">
              Lean counts essential categories only. Fat multiplies Full by the fat multiplier. Trailing
              actuals cover {ctx.t12.monthsWithData} month
              {ctx.t12.monthsWithData === 1 ? '' : 's'}; add categories in Settings.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Settings" />
          <CardContent className="flex flex-col gap-4">
            <Field label="Plan on tier">
              {() => (
                <Segmented
                  label="FI tier"
                  value={d.fiTier}
                  options={(['lean', 'full', 'fat'] as const).map((t) => ({
                    value: t,
                    label: TIER_LABELS[t],
                  }))}
                  onChange={(v) => void updateDestination({ fiTier: v })}
                />
              )}
            </Field>
            <Field
              label="Safe withdrawal rate"
              hint="Default 4%; 3.25–3.5% is more conservative for 40+ years"
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
            <Field label="Fat multiplier" hint="Fat = Full × this">
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
            <Field label="Target FI age" hint="Optional; shows the savings needed to get there">
              {(id) => (
                <NumberInput
                  id={id}
                  value={d.targetFiAge}
                  min={startAge}
                  max={settings.horizonAge}
                  placeholder="none"
                  onCommit={(v) => void updateDestination({ targetFiAge: v })}
                />
              )}
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="After leaving work" description="Added to every tier's FI spending." />
          <CardContent className="flex flex-col gap-3">
            <Field label="Self-paid NHI premium / month">
              {(id) => (
                <MoneyInput
                  id={id}
                  value={d.nhiMonthlyMinor}
                  currency="TWD"
                  onCommit={(v) => void updateDestination({ nhiMonthlyMinor: v ?? 0 })}
                />
              )}
            </Field>
            <Field label="Private health insurance / year">
              {(id) => (
                <MoneyInput
                  id={id}
                  value={d.privateInsuranceAnnualMinor}
                  currency="TWD"
                  onCommit={(v) => void updateDestination({ privateInsuranceAnnualMinor: v ?? 0 })}
                />
              )}
            </Field>
            <Field label="Healthcare reserve / year">
              {(id) => (
                <MoneyInput
                  id={id}
                  value={d.healthcareReserveAnnualMinor}
                  currency="TWD"
                  onCommit={(v) => void updateDestination({ healthcareReserveAnnualMinor: v ?? 0 })}
                />
              )}
            </Field>
            <p className="text-sm text-muted-foreground">Total {twd(tiers.postEmployment)} a year.</p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Guaranteed income"
            description="Streams that reduce what the portfolio must cover once you stop working. 勞退 is not listed here: its balance unlocks into the portfolio at its access age."
          />
          <CardContent>
            <IncomeStreams />
            <p className="mt-3 text-sm text-muted-foreground">
              {li.enabled ? (
                <>
                  Estimated 勞保 annuity from age {li.claimAge}: <strong>{twd(laborNow)}</strong> a year
                  (today's TWD), from Taiwan settings.{' '}
                </>
              ) : (
                <>The 勞保 annuity is off. </>
              )}
              <Link to="/settings#taiwan" className="text-primary hover:underline">
                Taiwan settings
              </Link>
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader
            title="Quick estimates"
            description={`Closed-form checks at an expected real return of ${pct(r, 2)} (target allocation, net of fees). The year-by-year projection is the number of record.`}
          />
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Stat
              label="Years to FI at current savings"
              value={Number.isFinite(closedFormYears) ? closedFormYears.toFixed(1) : 'Never'}
              sub={`Saving ${twdCompact(currentMonthly)}/month`}
            />
            {targetAge !== undefined &&
            target !== undefined &&
            needAnnual !== undefined &&
            coast !== undefined ? (
              <>
                <Stat
                  label={`FI target at age ${targetAge}`}
                  value={twdCompact(target)}
                  sub="FI number plus bridge fund for income that starts later"
                />
                <Stat
                  label={`Savings needed for age ${targetAge}`}
                  value={`${twdCompact(needAnnual / 12)}/mo`}
                  sub={
                    currentMonthly > 0
                      ? `You save ${twdCompact(currentMonthly)}/mo (${needAnnual / 12 <= currentMonthly ? 'on track' : 'short'})`
                      : undefined
                  }
                />
                <Stat
                  label="Coast FI"
                  value={twdCompact(coast)}
                  sub={
                    P >= coast
                      ? 'Reached: no more saving needed for the target age'
                      : `${pct(P / coast, 0)} of the way`
                  }
                />
              </>
            ) : (
              <p className="self-center text-sm text-muted-foreground md:col-span-3">
                Set a target FI age to see the savings needed and the Coast FI amount.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      <p className="mt-4 text-xs text-subtle">
        Annual amounts are in today's TWD. Streams that are not inflation-linked lose real value over time.
      </p>
    </>
  );
}
