import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  ASSET_CLASSES,
  ASSET_CLASS_LABELS,
  type Scenario,
  type ScenarioLevers,
  type WithdrawalRule,
} from '@/domain/entities';
import { formatMinor, parseMoneyInput } from '@/domain/money';
import { defaultWithdrawalRule, WITHDRAWAL_RULE_LABELS } from '@/domain/withdrawal';
import { db } from '@/db/db';
import { patch } from '@/db/repo';
import { useAppData } from '@/app/data';
import { MoneyInput, NumberInput, PercentInput } from '@/components/MoneyInput';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Notice, Table } from '@/components/ui/misc';
import { Term } from '@/components/ui/term';
import type { GlossaryParams } from '@/lib/glossary';
import { pct, twd } from '@/lib/format';
import { nameCheck, savingsRateOf, spendingNow, stopAge, type LabRow } from './model';

/** "Today: 23.2% · −3.2 pts vs today" (PRD R6). */
function TodayHint({ today, change, extra }: { today: string; change?: string; extra?: string }) {
  return (
    <>
      Today: {today}
      {change && <span className="font-medium text-foreground"> · {change}</span>}
      {extra && <span className="block">{extra}</span>}
    </>
  );
}

function moneyChange(now: number, today: number, unit = '/yr'): string | undefined {
  const d = Math.round(now - today);
  if (Math.abs(d) < 1) return undefined;
  return `${d > 0 ? '+' : '−'}${twd(Math.abs(d))}${unit} vs today`;
}

function pointsChange(now: number | undefined, today: number | undefined): string | undefined {
  if (now === undefined || today === undefined) return undefined;
  const d = (now - today) * 100;
  if (Math.abs(d) < 0.05) return 'same as today';
  return `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} pts vs today`;
}

function setLevers(s: Scenario, changes: Partial<ScenarioLevers>) {
  const overrides: Record<string, unknown> = { ...s.overrides, ...changes };
  for (const [k, v] of Object.entries(overrides)) if (v === undefined) delete overrides[k];
  return patch(db.scenarios, s.id, { overrides: overrides as ScenarioLevers });
}

function Section({
  title,
  children,
  hint,
}: {
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="rounded-md border p-3">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {hint && <p className="mb-2 text-xs text-muted-foreground">{hint}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </fieldset>
  );
}

function IncomeChanges({ s }: { s: Scenario }) {
  const changes = s.overrides.incomeChanges ?? [];
  const [draft, setDraft] = useState({ label: '', fromAge: '', toAge: '', income: '' });
  const income = parseMoneyInput(draft.income);
  const valid =
    /^\d+$/.test(draft.fromAge) &&
    (draft.toAge === '' || /^\d+$/.test(draft.toAge)) &&
    income !== null &&
    income >= 0;
  return (
    <div className="sm:col-span-2 xl:col-span-3">
      <Table>
        <thead>
          <tr>
            <th>Income change</th>
            <th className="text-right">From age</th>
            <th className="text-right">To age</th>
            <th className="text-right">Net income / year</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {changes.map((c, i) => (
            <tr key={i}>
              <td>{c.label || '—'}</td>
              <td className="text-right">{c.fromAge}</td>
              <td className="text-right">{c.toAge ?? 'FI'}</td>
              <td className="text-right">{formatMinor(c.annualIncomeMinor)}</td>
              <td className="text-right">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remove income change"
                  onClick={() => void setLevers(s, { incomeChanges: changes.filter((_, j) => j !== i) })}
                >
                  <Trash2 />
                </Button>
              </td>
            </tr>
          ))}
          <tr>
            <td>
              <Input
                aria-label="Income change label"
                className="h-8"
                placeholder="Raise, job change, career break"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </td>
            <td>
              <Input
                aria-label="From age"
                className="h-8 text-right"
                inputMode="numeric"
                value={draft.fromAge}
                onChange={(e) => setDraft({ ...draft, fromAge: e.target.value })}
              />
            </td>
            <td>
              <Input
                aria-label="To age"
                className="h-8 text-right"
                inputMode="numeric"
                placeholder="until FI"
                value={draft.toAge}
                onChange={(e) => setDraft({ ...draft, toAge: e.target.value })}
              />
            </td>
            <td>
              <Input
                aria-label="Income during change"
                className="h-8 text-right"
                inputMode="decimal"
                placeholder="0 = break"
                value={draft.income}
                onChange={(e) => setDraft({ ...draft, income: e.target.value })}
              />
            </td>
            <td className="text-right">
              <Button
                size="sm"
                disabled={!valid}
                onClick={() => {
                  if (!valid || income === null) return;
                  void setLevers(s, {
                    incomeChanges: [
                      ...changes,
                      {
                        label: draft.label,
                        fromAge: Number(draft.fromAge),
                        toAge: draft.toAge === '' ? undefined : Number(draft.toAge),
                        annualIncomeMinor: income,
                      },
                    ],
                  });
                  setDraft({ label: '', fromAge: '', toAge: '', income: '' });
                }}
              >
                <Plus aria-hidden /> Add
              </Button>
            </td>
          </tr>
        </tbody>
      </Table>
    </div>
  );
}

function Events({ s }: { s: Scenario }) {
  const [draft, setDraft] = useState({ date: '', amount: '', description: '' });
  const amount = parseMoneyInput(draft.amount);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(draft.date) && amount !== null && amount !== 0;
  return (
    <div className="sm:col-span-2 xl:col-span-3">
      <Table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Event</th>
            <th className="text-right">Amount (− = cost)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {s.events.map((e, i) => (
            <tr key={i}>
              <td>{e.date}</td>
              <td>{e.description}</td>
              <td className="text-right">{formatMinor(e.amountMinor)}</td>
              <td className="text-right">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remove event"
                  onClick={() =>
                    void patch(db.scenarios, s.id, { events: s.events.filter((_, j) => j !== i) })
                  }
                >
                  <Trash2 />
                </Button>
              </td>
            </tr>
          ))}
          <tr>
            <td>
              <Input
                aria-label="Event date"
                type="date"
                className="h-8"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </td>
            <td>
              <Input
                aria-label="Event description"
                className="h-8"
                placeholder="Home down payment"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </td>
            <td>
              <Input
                aria-label="Event amount"
                className="h-8 text-right"
                inputMode="decimal"
                placeholder="-3,000,000"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              />
            </td>
            <td className="text-right">
              <Button
                size="sm"
                disabled={!valid}
                onClick={() => {
                  if (!valid || amount === null) return;
                  void patch(db.scenarios, s.id, {
                    events: [
                      ...s.events,
                      { date: draft.date, amountMinor: amount, description: draft.description },
                    ].sort((a, b) => a.date.localeCompare(b.date)),
                  });
                  setDraft({ date: '', amount: '', description: '' });
                }}
              >
                <Plus aria-hidden /> Add
              </Button>
            </td>
          </tr>
        </tbody>
      </Table>
    </div>
  );
}

function AllocationEditor({ s }: { s: Scenario }) {
  const { settings } = useAppData();
  const custom = s.overrides.allocation;
  const alloc = custom ?? settings.targetAllocation;
  const sum = ASSET_CLASSES.reduce((a, c) => a + (alloc[c] ?? 0), 0);
  return (
    <div className="sm:col-span-2 xl:col-span-3">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={custom !== undefined}
            onChange={(e) =>
              void setLevers(s, {
                allocation: e.target.checked ? { ...settings.targetAllocation } : undefined,
              })
            }
          />
          Custom allocation (rebalanced every year)
        </label>
        {custom === undefined && (
          <span className="text-muted-foreground">
            Using the target allocation from Settings for new savings.
          </span>
        )}
        {custom !== undefined && Math.abs(sum - 1) > 0.001 && (
          <span className="text-warning">
            Adds up to {(sum * 100).toFixed(0)}%; it will be scaled to 100%.
          </span>
        )}
      </div>
      {custom !== undefined && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {ASSET_CLASSES.map((c) => (
            <Field key={c} label={ASSET_CLASS_LABELS[c]}>
              {(id) => (
                <PercentInput
                  id={id}
                  value={custom[c] ?? 0}
                  min={0}
                  max={1}
                  step={1}
                  onCommit={(v) => void setLevers(s, { allocation: { ...custom, [c]: v ?? 0 } })}
                />
              )}
            </Field>
          ))}
        </div>
      )}
    </div>
  );
}

export function ScenarioEditor({
  s,
  today,
  row,
  advanced,
  params,
}: {
  s: Scenario;
  today: LabRow;
  row: LabRow;
  advanced: boolean;
  params: GlossaryParams;
}) {
  const data = useAppData();
  const { assumptionSets } = data;
  const base = today.input;
  const o = s.overrides;
  const rule = s.withdrawalRule;
  const tw = assumptionSets.find((a) => a.id === s.assumptionSetId)?.taiwan ?? data.activeAssumptions.taiwan;
  const todayRate = savingsRateOf(base);
  const rowRate = savingsRateOf(row.input);
  const todayStop = stopAge(today.result);
  const rowStop = stopAge(row.result);
  const warning = nameCheck(s.name, today, row);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Name" className={advanced ? undefined : 'sm:col-span-3'}>
          {(id) => (
            <Input
              id={id}
              key={s.id + s.name}
              defaultValue={s.name}
              onBlur={(e) =>
                e.target.value.trim() && void patch(db.scenarios, s.id, { name: e.target.value.trim() })
              }
            />
          )}
        </Field>
        {advanced && (
          <Field label="Assumption set">
            {(id) => (
              <Select
                id={id}
                value={s.assumptionSetId}
                onChange={(e) => void patch(db.scenarios, s.id, { assumptionSetId: e.target.value })}
              >
                {assumptionSets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {advanced && (
          <Field label="Monte Carlo seed" hint="Stored so reruns are reproducible">
            {(id) => (
              <NumberInput
                id={id}
                value={s.seed}
                onCommit={(v) => v !== undefined && void patch(db.scenarios, s.id, { seed: v })}
              />
            )}
          </Field>
        )}
      </div>
      {warning && <Notice tone="warning">{warning}</Notice>}

      <Section title="Work and saving" hint="Blank fields keep today's value from your data.">
        <Field
          label="Take-home pay / year"
          hint={
            <TodayHint
              today={twd(base.annualIncome)}
              change={
                o.annualIncomeMinor !== undefined
                  ? moneyChange(row.input.annualIncome, base.annualIncome)
                  : undefined
              }
            />
          }
        >
          {(id) => (
            <MoneyInput
              id={id}
              value={o.annualIncomeMinor}
              currency="TWD"
              placeholder="today"
              onCommit={(v) => void setLevers(s, { annualIncomeMinor: v })}
            />
          )}
        </Field>
        <Field
          label="Spending while working / year"
          hint={
            <TodayHint
              today={twd(spendingNow(base))}
              change={
                o.currentSpendingMinor !== undefined ||
                o.savingsRate !== undefined ||
                o.spendingMultiplier !== undefined
                  ? moneyChange(spendingNow(row.input), spendingNow(base))
                  : undefined
              }
            />
          }
        >
          {(id) => (
            <MoneyInput
              id={id}
              value={o.currentSpendingMinor}
              currency="TWD"
              placeholder="today"
              onCommit={(v) => void setLevers(s, { currentSpendingMinor: v })}
            />
          )}
        </Field>
        <Field
          label="Savings rate"
          hint={
            <TodayHint
              today={todayRate !== undefined ? pct(todayRate, 1) : '—'}
              change={o.savingsRate !== undefined ? pointsChange(rowRate, todayRate) : undefined}
              extra="Sets spending to pay × (1 − rate)"
            />
          }
        >
          {(id) => (
            <PercentInput
              id={id}
              value={o.savingsRate}
              min={-1}
              max={1}
              step={1}
              onCommit={(v) => void setLevers(s, { savingsRate: v })}
            />
          )}
        </Field>
        <Field
          label="Stop working at age"
          hint={
            <TodayHint
              today={
                todayStop !== undefined ? `${todayStop} (as soon as you reach your target)` : 'not reached'
              }
              change={
                o.targetFiAge !== undefined &&
                todayStop !== undefined &&
                rowStop !== undefined &&
                rowStop !== todayStop
                  ? `${rowStop > todayStop ? '+' : '−'}${Math.abs(rowStop - todayStop)} yrs vs today`
                  : undefined
              }
            />
          }
        >
          {(id) => (
            <NumberInput
              id={id}
              value={o.targetFiAge}
              min={0}
              max={120}
              placeholder="at FI"
              onCommit={(v) => void setLevers(s, { targetFiAge: v })}
            />
          )}
        </Field>
        {o.targetFiAge === undefined && (
          <Field
            label="Keep working after reaching your target (years)"
            hint="0 = stop as soon as investments reach the money needed"
          >
            {(id) => (
              <NumberInput
                id={id}
                value={o.workExtraYears}
                min={0}
                max={30}
                placeholder="0"
                onCommit={(v) => void setLevers(s, { workExtraYears: v || undefined })}
              />
            )}
          </Field>
        )}
        {advanced && (
          <Field
            label="Voluntary 勞退 contribution"
            hint={`Up to ${(tw.laborPension.maxVoluntaryRate * 100).toFixed(0)}%, tax-deductible`}
          >
            {(id) => (
              <PercentInput
                id={id}
                value={o.laborPensionVoluntaryRate}
                min={0}
                max={tw.laborPension.maxVoluntaryRate}
                step={1}
                onCommit={(v) => void setLevers(s, { laborPensionVoluntaryRate: v })}
              />
            )}
          </Field>
        )}
        <IncomeChanges s={s} />
      </Section>

      <Section title="After you stop working">
        {advanced && (
          <Field label="FI tier">
            {(id) => (
              <Select
                id={id}
                value={o.fiTier ?? ''}
                onChange={(e) =>
                  void setLevers(s, { fiTier: (e.target.value || undefined) as ScenarioLevers['fiTier'] })
                }
              >
                <option value="">Same as Goal</option>
                <option value="lean">Lean</option>
                <option value="full">Full</option>
                <option value="fat">Fat</option>
              </Select>
            )}
          </Field>
        )}
        <Field
          label="Spending once you stop / year"
          hint={
            <TodayHint
              today={twd(base.fiSpending)}
              change={
                o.fiSpendingMinor !== undefined ||
                o.spendingMultiplier !== undefined ||
                o.fiTier !== undefined
                  ? moneyChange(row.input.fiSpending, base.fiSpending)
                  : undefined
              }
            />
          }
        >
          {(id) => (
            <MoneyInput
              id={id}
              value={o.fiSpendingMinor}
              currency="TWD"
              placeholder="today"
              onCommit={(v) => void setLevers(s, { fiSpendingMinor: v })}
            />
          )}
        </Field>
        <Field
          label="Spending change (%)"
          hint="−10% = spend less. Applies from today to spending both while working and after you stop."
        >
          {(id) => (
            <PercentInput
              id={id}
              value={o.spendingMultiplier === undefined ? undefined : o.spendingMultiplier - 1}
              min={-1}
              max={4}
              step={1}
              onCommit={(v) => void setLevers(s, { spendingMultiplier: v === undefined ? undefined : 1 + v })}
            />
          )}
        </Field>
        <Field
          label="Part-time income after you stop / year"
          hint={
            <TodayHint
              today={base.barista ? twd(base.barista.annual) : 'none'}
              extra="Also lowers the money you need"
            />
          }
        >
          {(id) => (
            <MoneyInput
              id={id}
              value={o.baristaIncome?.annualMinor}
              currency="TWD"
              placeholder="none"
              onCommit={(v) =>
                void setLevers(s, {
                  baristaIncome: v
                    ? {
                        ...o.baristaIncome,
                        annualMinor: v,
                        untilAge: o.baristaIncome?.untilAge ?? (o.targetFiAge ?? base.startAge) + 10,
                      }
                    : undefined,
                })
              }
            />
          )}
        </Field>
        <Field label="Part-time until age">
          {(id) => (
            <NumberInput
              id={id}
              value={o.baristaIncome?.untilAge}
              min={0}
              max={120}
              onCommit={(v) =>
                o.baristaIncome &&
                v !== undefined &&
                void setLevers(s, { baristaIncome: { ...o.baristaIncome, untilAge: v } })
              }
            />
          )}
        </Field>
        <Field
          label={<Term k="drawRate" params={params} advanced={advanced} />}
          hint={
            <TodayHint
              today={pct(base.swr, 2)}
              change={o.swr !== undefined ? pointsChange(row.input.swr, base.swr) : undefined}
              extra="Lower = a bigger target, safer spending"
            />
          }
        >
          {(id) => (
            <PercentInput
              id={id}
              value={o.swr}
              min={0.01}
              max={0.1}
              step={0.05}
              onCommit={(v) => void setLevers(s, { swr: v })}
            />
          )}
        </Field>
      </Section>

      {advanced && (
        <Section title="Withdrawal rule">
          <Field label="Rule">
            {(id) => (
              <Select
                id={id}
                value={rule.kind}
                onChange={(e) =>
                  void patch(db.scenarios, s.id, {
                    withdrawalRule: defaultWithdrawalRule(e.target.value as WithdrawalRule['kind']),
                  })
                }
              >
                {(Object.keys(WITHDRAWAL_RULE_LABELS) as WithdrawalRule['kind'][]).map((k) => (
                  <option key={k} value={k}>
                    {WITHDRAWAL_RULE_LABELS[k]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {rule.kind === 'guardrails' && (
            <>
              <Field label="Guardrail band" hint="Cut or raise when the rate drifts this far from the SWR">
                {(id) => (
                  <PercentInput
                    id={id}
                    value={rule.band}
                    min={0}
                    max={1}
                    step={1}
                    onCommit={(v) =>
                      v !== undefined &&
                      void patch(db.scenarios, s.id, { withdrawalRule: { ...rule, band: v } })
                    }
                  />
                )}
              </Field>
              <Field label="Adjustment step">
                {(id) => (
                  <PercentInput
                    id={id}
                    value={rule.step}
                    min={0}
                    max={1}
                    step={1}
                    onCommit={(v) =>
                      v !== undefined &&
                      void patch(db.scenarios, s.id, { withdrawalRule: { ...rule, step: v } })
                    }
                  />
                )}
              </Field>
            </>
          )}
          {rule.kind === 'fixed_percentage' && (
            <Field label="Withdraw each year">
              {(id) => (
                <PercentInput
                  id={id}
                  value={rule.rate}
                  min={0}
                  max={0.2}
                  step={0.1}
                  onCommit={(v) =>
                    v !== undefined &&
                    void patch(db.scenarios, s.id, { withdrawalRule: { ...rule, rate: v } })
                  }
                />
              )}
            </Field>
          )}
          <p className="self-center text-xs text-muted-foreground sm:col-span-2 xl:col-span-2">
            {rule.kind === 'fixed_swr' && 'Spend the FI budget every year, adjusted for inflation.'}
            {rule.kind === 'guardrails' &&
              'Start at the FI budget; cut 10% when the withdrawal rate rises 20% above the SWR, raise 10% when it falls 20% below.'}
            {rule.kind === 'fixed_percentage' &&
              'Spending follows the portfolio; it never runs out, but spending can fall.'}
            {rule.kind === 'dividend' &&
              'Spend only the dividends (yields from the assumption set) plus guaranteed income.'}
          </p>
        </Section>
      )}

      {advanced && (
        <Section
          title="How the target is sized"
          hint="Leave blank to size the money-needed target on your spending once you stop."
        >
          <Field label="Size the target on spending of / year">
            {(id) => (
              <MoneyInput
                id={id}
                value={o.targetSpendingMinor}
                currency="TWD"
                placeholder="same as above"
                onCommit={(v) => void setLevers(s, { targetSpendingMinor: v })}
              />
            )}
          </Field>
          {o.baristaIncome && (
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                checked={o.baristaIncome.inTarget !== false}
                onChange={(e) =>
                  void setLevers(s, {
                    baristaIncome: { ...o.baristaIncome!, inTarget: e.target.checked ? undefined : false },
                  })
                }
              />
              Part-time income lowers the target (stop sooner)
            </label>
          )}
        </Section>
      )}

      <Section title="Investment mix">
        <AllocationEditor s={s} />
      </Section>

      {advanced && (
        <Section title="Taiwan levers">
          <Field
            label="勞保 claim age"
            hint={`Normal ${tw.laborInsurance.claimAge}; −/+${(tw.laborInsurance.adjustmentPerYear * 100).toFixed(0)}% a year`}
          >
            {(id) => (
              <NumberInput
                id={id}
                value={o.laborInsuranceClaimAge}
                min={tw.laborInsurance.claimAge - tw.laborInsurance.maxYearsEarly}
                max={tw.laborInsurance.claimAge + tw.laborInsurance.maxYearsDelay}
                placeholder={String(tw.laborInsurance.claimAge)}
                onCommit={(v) => void setLevers(s, { laborInsuranceClaimAge: v })}
              />
            )}
          </Field>
          <Field label="勞保 haircut" hint="Fund-solvency scenario">
            {(id) => (
              <PercentInput
                id={id}
                value={o.laborInsuranceHaircut}
                min={0}
                max={1}
                step={5}
                onCommit={(v) => void setLevers(s, { laborInsuranceHaircut: v })}
              />
            )}
          </Field>
          <Field label="Return shift" hint="Added to every asset class">
            {(id) => (
              <PercentInput
                id={id}
                value={o.returnShift}
                min={-0.2}
                max={0.2}
                step={0.5}
                onCommit={(v) => void setLevers(s, { returnShift: v })}
              />
            )}
          </Field>
        </Section>
      )}

      <Section title="Stress test">
        <Field
          label="Shares fall just after you stop (%)"
          hint="Spread over the first 2 years after stopping"
        >
          {(id) => (
            <PercentInput
              id={id}
              value={o.crash?.drop}
              min={0}
              max={0.9}
              step={5}
              onCommit={(v) =>
                void setLevers(s, { crash: v ? { drop: v, years: o.crash?.years ?? 2 } : undefined })
              }
            />
          )}
        </Field>
      </Section>

      <Section
        title="One-off events"
        hint="Home purchase, inheritance, large costs. Applied at the start of their year."
      >
        <Events s={s} />
      </Section>

      <Field label="Notes">
        {(id) => (
          <Textarea
            id={id}
            key={s.id}
            defaultValue={s.notes ?? ''}
            onBlur={(e) => void patch(db.scenarios, s.id, { notes: e.target.value || undefined })}
          />
        )}
      </Field>
      <p className="text-xs text-subtle">Changes save automatically. Amounts are in today's money.</p>
    </div>
  );
}
