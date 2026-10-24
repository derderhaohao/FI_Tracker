import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft } from 'lucide-react';
import { today } from '@/domain/dates';
import { downloadMonthlyReminder } from '@/lib/ics';
import { formatMoney, fromMinor } from '@/domain/money';
import { db } from '@/db/db';
import { newId } from '@/db/repo';
import { useAppData } from '@/app/data';
import { MoneyInput } from '@/components/MoneyInput';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { Notice, PageHeader } from '@/components/ui/misc';
import {
  defaultUpdateDate,
  durationText,
  planUpdate,
  recordUpdateTime,
  type UpdateItem,
} from './updateModel';

type Step =
  | { kind: 'date' }
  | { kind: 'account'; item: UpdateItem; n: number; of: number }
  | { kind: 'steady'; items: UpdateItem[] }
  | { kind: 'fx'; currency: string; last?: number; saved?: number }
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
  const { accounts, snapshots, fxRates } = useAppData();
  const [date, setDate] = useState(() => defaultUpdateDate(today()));
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<Record<string, number | undefined>>({});
  const [rates, setRates] = useState<Record<string, string>>({});
  const [started] = useState(() => Date.now());
  const [done, setDone] = useState<{ ms: number; count: number }>();
  const [error, setError] = useState<string>();

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
        <PageHeader title="Monthly update" />
        <Notice>
          Add accounts first, or run the{' '}
          <Link to="/setup" className="text-primary hover:underline">
            setup
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
      setError(`Enter a balance for ${missing.map((m) => m.account.nickname).join(', ')}.`);
      return;
    }
    const now = new Date().toISOString();
    await db.transaction('rw', db.snapshots, db.fxRates, db.settings, async () => {
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
    });
    const ms = Date.now() - started;
    recordUpdateTime(date, ms);
    setDone({ ms, count: items.length });
  };

  if (done) {
    return (
      <div className="mx-auto max-w-md">
        <PageHeader title="Monthly update" />
        <Card>
          <CardContent className="flex flex-col gap-3 p-6 text-sm">
            <Check className="size-8 text-good" aria-hidden />
            <h2 className="text-lg font-semibold">
              Saved {done.count} balances for {date}
            </h2>
            <p className="text-muted-foreground">Done in {durationText(done.ms)}.</p>
            <p>Last step: add last month's pay and spending, so savings and the FI date stay right.</p>
            <div className="flex flex-wrap gap-2">
              <Link to="/cashflow" className={buttonVariants()}>
                Cash flow
              </Link>
              <Link to="/" className={buttonVariants({ variant: 'outline' })}>
                See what moved
              </Link>
            </div>
            <button
              type="button"
              className="self-start text-primary hover:underline"
              onClick={() => downloadMonthlyReminder(today())}
            >
              Add a monthly reminder to your calendar
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const progress = Math.round((index / (steps.length - 1)) * 100);

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Monthly update" description="One card per account, pre-filled with last month." />
      <div className="mb-3 h-1.5 rounded bg-surface-2" aria-hidden>
        <div className="h-1.5 rounded bg-primary" style={{ width: `${progress}%` }} />
      </div>
      <Card {...swipe}>
        <CardContent className="flex flex-col gap-4 p-5">
          {step.kind === 'date' && (
            <>
              <h2 className="text-lg font-semibold">Which date are these balances for?</h2>
              <Field label="Snapshot date" hint="Month-end works well; use the date on your statements.">
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
                {plan.changing.length} account{plan.changing.length === 1 ? '' : 's'} to check
                {plan.steady.length ? `, plus ${plan.steady.length} that usually stay the same` : ''}.
              </p>
              <Button onClick={next}>Start</Button>
            </>
          )}

          {step.kind === 'account' && (
            <>
              <div className="text-xs text-subtle">
                Account {step.n} of {step.of}
              </div>
              <h2 className="text-lg font-semibold">{step.item.account.nickname}</h2>
              <p className="text-sm text-muted-foreground">
                Last: {money(step.item.lastMinor, step.item.account.currency)}
                {step.item.lastDate ? ` on ${step.item.lastDate}` : ''}
                {step.item.account.type === 'liability' ? ' owed' : ''}
                {step.item.savedMinor !== undefined &&
                  `. Already saved for ${date}: ${money(step.item.savedMinor, step.item.account.currency)}`}
              </p>
              <Field label={step.item.account.type === 'liability' ? 'Amount owed now' : 'Balance now'}>
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
                    Same as last month
                  </Button>
                )}
                <Button onClick={next} disabled={valueOf(step.item) === undefined}>
                  Next
                </Button>
              </div>
              <p className="text-xs text-subtle">Tip: swipe right for “same as last month”.</p>
            </>
          )}

          {step.kind === 'steady' && (
            <>
              <h2 className="text-lg font-semibold">Usually unchanged</h2>
              <p className="text-sm text-muted-foreground">
                These have not moved for three snapshots. Confirm them together, or change any that did.
              </p>
              <ul className="flex flex-col gap-2">
                {step.items.map((it) => (
                  <li key={it.account.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>{it.account.nickname}</span>
                    <div className="w-40">
                      <MoneyInput
                        aria-label={`${it.account.nickname} balance`}
                        value={valueOf(it)}
                        currency={it.account.currency}
                        allowNegative
                        onCommit={(v) => setValues((s) => ({ ...s, [it.account.id]: v }))}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <Button onClick={next}>All correct</Button>
            </>
          )}

          {step.kind === 'fx' && (
            <>
              <h2 className="text-lg font-semibold">{step.currency}/TWD rate</h2>
              <p className="text-sm text-muted-foreground">
                TWD per 1 {step.currency} on {date}
                {step.last !== undefined ? `; last time ${step.last}` : ''}. Your bank's or a public rate is
                fine.
              </p>
              <Field label={`${step.currency}/TWD`}>
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
                Next
              </Button>
            </>
          )}

          {step.kind === 'save' && (
            <>
              <h2 className="text-lg font-semibold">Save {date}</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {[...plan.changing, ...plan.steady].map((it) => (
                  <li key={it.account.id} className="flex justify-between gap-2">
                    <span>{it.account.nickname}</span>
                    <span className="tabular">{money(valueOf(it), it.account.currency)}</span>
                  </li>
                ))}
              </ul>
              {error && <Notice tone="warning">{error}</Notice>}
              <Button onClick={() => void save()}>Save balances</Button>
            </>
          )}

          {index > 0 && (
            <button
              type="button"
              className="flex items-center gap-1 self-start text-sm text-muted-foreground"
              onClick={back}
            >
              <ChevronLeft className="size-4" aria-hidden /> Back
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
