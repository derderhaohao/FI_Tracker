import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { formatDate, monthLabel, twdCompact } from '@/lib/format';
import { allocationGap } from '@/domain/alerts';
import { monthlyTotals } from '@/domain/cashflow';
import { monthOf, today } from '@/domain/dates';
import { downloadMonthlyReminder } from '@/lib/ics';
import { downloadBackup } from '@/lib/backupActions';
import { formatMoney, fromMinor } from '@/domain/money';
import { netWorthSeries } from '@/domain/networth';
import { db } from '@/db/db';
import { newId, patch } from '@/db/repo';
import { useAppData } from '@/app/data';
import { FiMoveCard } from '@/features/dashboard/FiMoveCard';
import { MoneyInput } from '@/components/MoneyInput';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Notice, PageHeader } from '@/components/ui/misc';
import {
  buildMonthFlows,
  defaultUpdateDate,
  duePrompts,
  durationText,
  planFlows,
  planUpdate,
  recordUpdateTime,
  type OneOff,
  type UpdateItem,
} from './updateModel';
import { t } from '@/i18n';

type Step =
  | { kind: 'date' }
  | { kind: 'account'; item: UpdateItem; n: number; of: number }
  | { kind: 'steady'; items: UpdateItem[] }
  | { kind: 'fx'; currency: string; last?: number; saved?: number }
  | { kind: 'flows' }
  | { kind: 'save' };

const money = (minor: number | undefined, currency: string) =>
  minor === undefined ? '—' : formatMoney(fromMinor(minor), currency);

/** Swipe right on a card to confirm it is unchanged. */
function useSwipe(onRight: () => void) {
  const start = useRef<number | undefined>(undefined);
  return {
    onTouchStart: (e: React.TouchEvent) => (start.current = e.touches[0].clientX),
    onTouchEnd: (e: React.TouchEvent) => {
      if (start.current !== undefined && e.changedTouches[0].clientX - start.current > 70) onRight();
      start.current = undefined;
    },
  };
}

export function UpdatePage() {
  const data = useAppData();
  const { accounts, snapshots, fxRates, cashFlows, categories, settings } = data;
  const [date, setDate] = useState(() => defaultUpdateDate(today()));
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<Record<string, number | undefined>>({});
  const [rates, setRates] = useState<Record<string, string>>({});
  const [started] = useState(() => Date.now());
  const [done, setDone] = useState<{ ms: number; count: number; reviewId: string }>();
  const [error, setError] = useState<string>();
  const month = monthOf(date);
  const flowPlan = useMemo(
    () => planFlows(cashFlows, categories, fxRates, month),
    [cashFlows, categories, fxRates, month],
  );
  const transactions = settings.cashFlowMode === 'transactions';
  // Pay and spending: two totals pre-filled from last month (UX doc, M1).
  const [income, setIncome] = useState<number | undefined>();
  const [spending, setSpending] = useState<number | undefined>();
  const [oneOffs, setOneOffs] = useState<OneOff[]>([]);
  const incomeValue = income ?? flowPlan.previous?.incomeMinor;
  const spendingValue = spending ?? flowPlan.previous?.spendingMinor;

  const plan = useMemo(
    () => planUpdate(accounts, snapshots, fxRates, date),
    [accounts, snapshots, fxRates, date],
  );
  const steps: Step[] = useMemo(() => {
    const list: Step[] = [{ kind: 'date' }];
    plan.changing.forEach((item, i) =>
      list.push({ kind: 'account', item, n: i + 1, of: plan.changing.length }),
    );
    if (plan.steady.length) list.push({ kind: 'steady', items: plan.steady });
    plan.currencies.forEach((c) => list.push({ kind: 'fx', ...c }));
    list.push({ kind: 'flows' });
    list.push({ kind: 'save' });
    return list;
  }, [plan]);
  const step = steps[Math.min(index, steps.length - 1)];
  const next = () => setIndex((i) => Math.min(i + 1, steps.length - 1));
  const back = () => setIndex((i) => Math.max(0, i - 1));
  const valueOf = (it: UpdateItem) =>
    it.account.id in values ? values[it.account.id] : (it.savedMinor ?? it.lastMinor);
  const rateOf = (c: { currency: string; last?: number; saved?: number }) =>
    rates[c.currency] ?? String(c.saved ?? c.last ?? '');
  const swipe = useSwipe(() => {
    if (step.kind === 'account') {
      setValues((v) => ({ ...v, [step.item.account.id]: step.item.lastMinor }));
      next();
    }
  });

  if (accounts.length === 0) {
    return (
      <>
        <PageHeader title={t('Monthly update')} />
        <Notice>
          {t('Add accounts first, or run the')}{' '}
          <Link to="/setup" className="text-primary hover:underline">
            {t('setup')}
          </Link>
          .
        </Notice>
      </>
    );
  }

  const save = async () => {
    setError(undefined);
    const items = [...plan.changing, ...plan.steady];
    const missing = items.filter((it) => valueOf(it) === undefined);
    if (missing.length) {
      setError(t('Enter a balance for {join}.', { join: missing.map((m) => m.account.nickname).join(', ') }));
      return;
    }
    const now = new Date().toISOString();
    const writeFlows = !transactions && !flowPlan.existing;
    const flows = writeFlows
      ? buildMonthFlows(
          cashFlows,
          categories,
          fxRates,
          month,
          { incomeMinor: incomeValue ?? 0, spendingMinor: spendingValue ?? 0 },
          oneOffs,
          now,
        )
      : [];
    const reviewId = newId();
    await db.transaction(
      'rw',
      [db.snapshots, db.fxRates, db.settings, db.cashFlows, db.reviews],
      async () => {
        await db.cashFlows.bulkPut(flows);
        // The month's review ticks itself from what was just entered (UX doc, M1).
        await db.reviews.put({
          id: reviewId,
          date,
          type: 'monthly',
          notes: '',
          decisions: [],
          checklist: {
            snapshot: true,
            fx: plan.currencies.every((c) => Number(rateOf(c)) > 0),
            cashflow: flows.length > 0 || !!flowPlan.existing,
            lump: oneOffs.length > 0,
          },
          createdAt: now,
          updatedAt: now,
        });
        for (const it of items) {
          const existing = await db.snapshots.where('[accountId+date]').equals([it.account.id, date]).first();
          await db.snapshots.put({
            id: existing?.id ?? newId(),
            accountId: it.account.id,
            date,
            balanceMinor: valueOf(it)!,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          });
        }
        for (const c of plan.currencies) {
          const rate = Number(rateOf(c));
          if (!(rate > 0)) continue;
          const existing = await db.fxRates.where('[currency+date]').equals([c.currency, date]).first();
          await db.fxRates.put({
            id: existing?.id ?? newId(),
            currency: c.currency,
            date,
            twdPerUnit: rate,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          });
        }
        const s = await db.settings.get('singleton');
        if (s) await db.settings.put({ ...s, snapshotSinceBackup: true, updatedAt: now });
      },
    );
    const ms = Date.now() - started;
    recordUpdateTime(date, ms);
    setDone({ ms, count: items.length, reviewId });
  };

  if (done) return <Recap date={date} ms={done.ms} count={done.count} reviewId={done.reviewId} />;

  const progress = Math.round((index / (steps.length - 1)) * 100);

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        title={t('Monthly update')}
        description={t(
          'Balances, the USD rate, pay and spending: one card at a time, pre-filled with last month.',
        )}
      />
      <div className="mb-3 h-1.5 rounded bg-surface-2" aria-hidden>
        <div className="h-1.5 rounded bg-primary" style={{ width: `${progress}%` }} />
      </div>
      <Card {...swipe}>
        <CardContent className="flex flex-col gap-4 p-5">
          {step.kind === 'date' && (
            <>
              <h2 className="text-lg font-semibold">{t('Which month-end is this update for?')}</h2>
              <Field
                label={t('Balances as of')}
                hint={t('Month-end works well; use the date on your statements.')}
              >
                {(id) => (
                  <Input
                    id={id}
                    type="date"
                    value={date}
                    onChange={(e) => e.target.value && setDate(e.target.value)}
                  />
                )}
              </Field>
              <p className="text-sm text-muted-foreground">
                {t('{length} account{v} to check{v2}.', {
                  length: plan.changing.length,
                  v: plan.changing.length === 1 ? '' : 's',
                  v2: plan.steady.length
                    ? t(', plus {length} that usually stay the same', { length: plan.steady.length })
                    : '',
                })}
              </p>
              <Button onClick={next}>{t('Start')}</Button>
            </>
          )}

          {step.kind === 'account' && (
            <>
              <div className="text-xs text-subtle">
                {t('Account {n} of {of}', { n: step.n, of: step.of })}
              </div>
              <h2 className="text-lg font-semibold">{step.item.account.nickname}</h2>
              <p className="text-sm text-muted-foreground">
                {t('Last: {lastMinor}{v}', {
                  lastMinor: money(step.item.lastMinor, step.item.account.currency),
                  v: step.item.lastDate
                    ? t(' on {lastDate}', { lastDate: formatDate(step.item.lastDate) })
                    : '',
                })}
                {step.item.account.type === 'liability' ? t(' owed') : ''}
                {step.item.savedMinor !== undefined &&
                  t('. Already saved for {date}: {savedMinor}', {
                    date: formatDate(date),
                    savedMinor: money(step.item.savedMinor, step.item.account.currency),
                  })}
              </p>
              <Field label={step.item.account.type === 'liability' ? t('Amount owed now') : t('Balance now')}>
                {(id) => (
                  <MoneyInput
                    key={step.item.account.id}
                    id={id}
                    value={valueOf(step.item)}
                    currency={step.item.account.currency}
                    allowNegative
                    onCommit={(v) => setValues((s) => ({ ...s, [step.item.account.id]: v }))}
                  />
                )}
              </Field>
              <div className="flex flex-wrap gap-2">
                {step.item.lastMinor !== undefined && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setValues((s) => ({ ...s, [step.item.account.id]: step.item.lastMinor }));
                      next();
                    }}
                  >
                    {t('Same as last month')}
                  </Button>
                )}
                <Button onClick={next} disabled={valueOf(step.item) === undefined}>
                  {t('Next')}
                </Button>
              </div>
              <p className="text-xs text-subtle">{t('Tip: swipe right for “same as last month”.')}</p>
            </>
          )}

          {step.kind === 'steady' && (
            <>
              <h2 className="text-lg font-semibold">{t('Usually unchanged')}</h2>
              <p className="text-sm text-muted-foreground">
                {t(
                  'These have not moved for three snapshots. Confirm them together, or change any that did.',
                )}
              </p>
              <ul className="flex flex-col gap-2">
                {step.items.map((it) => (
                  <li key={it.account.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>{it.account.nickname}</span>
                    <div className="w-40">
                      <MoneyInput
                        aria-label={t('{nickname} balance', { nickname: it.account.nickname })}
                        value={valueOf(it)}
                        currency={it.account.currency}
                        allowNegative
                        onCommit={(v) => setValues((s) => ({ ...s, [it.account.id]: v }))}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <Button onClick={next}>{t('All correct')}</Button>
            </>
          )}

          {step.kind === 'fx' && (
            <>
              <h2 className="text-lg font-semibold">
                {t('{currency}/TWD rate', { currency: step.currency })}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("TWD per 1 {currency} on {date}{v}. Your bank's or a public rate is fine.", {
                  currency: step.currency,
                  date: formatDate(date),
                  v: step.last !== undefined ? t('; last time {last}', { last: step.last }) : '',
                })}
              </p>
              <Field label={t('{currency}/TWD', { currency: step.currency })}>
                {(id) => (
                  <Input
                    id={id}
                    inputMode="decimal"
                    value={rateOf(step)}
                    onChange={(e) => setRates((r) => ({ ...r, [step.currency]: e.target.value }))}
                  />
                )}
              </Field>
              <Button onClick={next} disabled={!(Number(rateOf(step)) > 0)}>
                {t('Next')}
              </Button>
            </>
          )}

          {step.kind === 'flows' && (
            <>
              <h2 className="text-lg font-semibold">
                {t('Pay and spending in {month}', { month: monthLabel(month) })}
              </h2>
              {transactions ? (
                <p className="text-sm text-muted-foreground">
                  {t('You record individual transactions. Import the month’s bank CSV in')}{' '}
                  <Link to="/money/cashflow" className="text-primary hover:underline">
                    {t('Cash flow')}
                  </Link>
                  .
                </p>
              ) : flowPlan.existing ? (
                <p className="text-sm text-muted-foreground">
                  {t(
                    'Already entered for {month}: pay {income}, spending {spending}. Change them in Cash flow.',
                    {
                      month: monthLabel(month),
                      income: twdCompact(fromMinor(flowPlan.existing.incomeMinor)),
                      spending: twdCompact(fromMinor(flowPlan.existing.spendingMinor)),
                    },
                  )}
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {flowPlan.previousMonth
                      ? t('Pre-filled from {month}. Change a total and its categories keep their split.', {
                          month: monthLabel(flowPlan.previousMonth),
                        })
                      : t('Two totals for the month, in TWD.')}
                  </p>
                  <Field label={t('Take-home pay (TWD)')}>
                    {(id) => <MoneyInput id={id} value={incomeValue} currency="TWD" onCommit={setIncome} />}
                  </Field>
                  <Field label={t('Spending (TWD)')}>
                    {(id) => (
                      <MoneyInput id={id} value={spendingValue} currency="TWD" onCommit={setSpending} />
                    )}
                  </Field>
                  {oneOffs.map((o, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[1fr_8rem_auto] items-end gap-2 rounded-md border p-2"
                    >
                      <Field label={t('One-off')}>
                        {(id) => (
                          <Select
                            id={id}
                            value={o.categoryId}
                            onChange={(e) => {
                              const c = categories.find((x) => x.id === e.target.value)!;
                              setOneOffs((l) =>
                                l.map((x, j) => (j === i ? { ...x, categoryId: c.id, kind: c.kind } : x)),
                              );
                            }}
                          >
                            {categories
                              .filter((c) => !c.system)
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.kind === 'income'
                                    ? t('In: {name}', { name: c.name })
                                    : t('Out: {name}', { name: c.name })}
                                </option>
                              ))}
                          </Select>
                        )}
                      </Field>
                      <Field label={t('Amount (TWD)')}>
                        {(id) => (
                          <MoneyInput
                            id={id}
                            value={o.amountMinor || undefined}
                            currency="TWD"
                            onCommit={(v) =>
                              setOneOffs((l) =>
                                l.map((x, j) => (j === i ? { ...x, amountMinor: v ?? 0 } : x)),
                              )
                            }
                          />
                        )}
                      </Field>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t('Remove one-off')}
                        onClick={() => setOneOffs((l) => l.filter((_, j) => j !== i))}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="flex items-center gap-1 self-start text-sm text-primary hover:underline"
                    onClick={() => {
                      const c =
                        categories.find((x) => x.kind === 'income' && !x.system) ??
                        categories.find((x) => !x.system);
                      if (c) setOneOffs((l) => [...l, { kind: c.kind, categoryId: c.id, amountMinor: 0 }]);
                    }}
                  >
                    <Plus className="size-4" aria-hidden /> {t('Add a bonus or one-off')}
                  </button>
                </>
              )}
              <Button onClick={next}>{t('Next')}</Button>
            </>
          )}

          {step.kind === 'save' && (
            <>
              <h2 className="text-lg font-semibold">{t('Save {date}', { date: formatDate(date) })}</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {[...plan.changing, ...plan.steady].map((it) => (
                  <li key={it.account.id} className="flex justify-between gap-2">
                    <span>{it.account.nickname}</span>
                    <span className="tabular">{money(valueOf(it), it.account.currency)}</span>
                  </li>
                ))}
              </ul>
              {error && <Notice tone="warning">{error}</Notice>}
              {!transactions && !flowPlan.existing && (
                <p className="flex justify-between gap-2 border-t pt-2 text-sm">
                  <span>{t('Pay − spending')}</span>
                  <span className="tabular">
                    {twdCompact(fromMinor((incomeValue ?? 0) - (spendingValue ?? 0)))}
                  </span>
                </p>
              )}
              <Button onClick={() => void save()}>{t('Save and see the recap')}</Button>
            </>
          )}

          {index > 0 && (
            <button
              type="button"
              className="flex items-center gap-1 self-start text-sm text-muted-foreground"
              onClick={back}
            >
              <ChevronLeft className="size-4" aria-hidden /> {t('Back')}
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * The end of the monthly job (UX doc, M1): what changed, the FI-date move, prompts only when
 * due, a note for future you, and the backup and calendar reminder in one place.
 */
function Recap({ date, ms, count, reviewId }: { date: string; ms: number; count: number; reviewId: string }) {
  const data = useAppData();
  const { accounts, snapshots, fxRates, settings, ctx } = data;
  const [note, setNote] = useState('');
  const [noted, setNoted] = useState(false);
  const month = monthOf(date);
  const series = useMemo(
    () => netWorthSeries(accounts, snapshots, fxRates, settings.birthYear),
    [accounts, snapshots, fxRates, settings.birthYear],
  );
  const i = series.findIndex((s) => s.date === date);
  const change = i > 0 ? series[i].total - series[i - 1].total : undefined;
  const flows = monthlyTotals(data.cashFlows, data.categories, fxRates).find((m) => m.month === month);
  const due = duePrompts(month);
  const gap = Math.round(allocationGap(settings.targetAllocation, ctx.netWorth) * 100);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('Monthly update')} />
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 text-sm">
          <div className="flex items-center gap-2">
            <Check className="size-6 text-good" aria-hidden />
            <h2 className="text-lg font-semibold">
              {t('Saved {count} balances for {date}', { count, date: formatDate(date) })}
            </h2>
          </div>
          <p className="text-muted-foreground">{t('Done in {ms}.', { ms: durationText(ms) })}</p>
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-md border p-3">
              <dt className="text-muted-foreground">{t('Net worth change')}</dt>
              <dd className="text-xl font-semibold tabular">
                {change === undefined ? '—' : `${change >= 0 ? '+' : '−'}${twdCompact(Math.abs(change))}`}
              </dd>
            </div>
            <div className="rounded-md border p-3">
              <dt className="text-muted-foreground">{t('Saved this month')}</dt>
              <dd className="text-xl font-semibold tabular">{flows ? twdCompact(flows.savings) : '—'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <FiMoveCard />

      {due.length > 0 && (
        <Card className="mt-4">
          <CardHeader title={t('Also due this month')} />
          <CardContent className="flex flex-col gap-2 text-sm">
            {due.includes('quarterly') && (
              <p>
                {t(
                  'Quarter end: your mix is {gap} points off target. Rebalance if that is more than you like, and compare the plan with what happened.',
                  { gap },
                )}{' '}
                <Link to="/update/reviews" className="text-primary hover:underline">
                  {t('Quarterly review')}
                </Link>
              </p>
            )}
            {due.includes('annual') && (
              <p>
                {t('Year end: revisit what you will spend once you stop working, and the 勞保 figures.')}{' '}
                <Link to="/plan/goal" className="text-primary hover:underline">
                  {t('FI spending')}
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardContent className="flex flex-col gap-3 p-4 text-sm">
          <Field label={t('Note for future you (optional)')}>
            {(id) => (
              <Textarea
                id={id}
                rows={2}
                value={note}
                placeholder={t('A raise, a big purchase, a decision…')}
                onChange={(e) => {
                  setNote(e.target.value);
                  setNoted(false);
                }}
              />
            )}
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!note.trim() || noted}
              onClick={async () => {
                await patch(db.reviews, reviewId, { notes: note.trim() });
                setNoted(true);
              }}
            >
              {noted ? t('Note saved') : t('Save note')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => void downloadBackup()}>{t('Save a backup')}</Button>
        <Button variant="outline" onClick={() => downloadMonthlyReminder(today())}>
          {t('Add a monthly calendar reminder')}
        </Button>
        <Link to="/" className={buttonVariants({ variant: 'ghost' })}>
          {t('Go to Home')}
        </Link>
      </div>
    </div>
  );
}
