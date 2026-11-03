import type { Account, CashFlow, Category, FxRate, Snapshot } from '@/domain/entities';
import { monthlyTotals } from '@/domain/cashflow';
import { addMonths, lastDayOfMonth, monthOf } from '@/domain/dates';
import { BASE_CURRENCY, rateFor } from '@/domain/fx';
import { toMinor } from '@/domain/money';
import { newId } from '@/db/repo';
import { t } from '@/i18n';

/**
 * The monthly update (product review, Next phase): one card per account, pre-filled with
 * last month, so a phone update takes under three minutes. Accounts whose balance has not
 * moved for three snapshots are grouped and confirmed together.
 */

export interface UpdateItem {
  account: Account;
  /** Latest balance before the update date, minor units in the account currency. */
  lastMinor?: number;
  lastDate?: string;
  /** Already saved for the update date (editing an update in progress). */
  savedMinor?: number;
}

export interface UpdatePlan {
  changing: UpdateItem[];
  steady: UpdateItem[];
  currencies: { currency: string; last?: number; saved?: number }[];
}

/** Month-end of last month: the date most people snapshot. */
export function defaultUpdateDate(todayDate: string): string {
  return lastDayOfMonth(addMonths(monthOf(todayDate), -1));
}

export function planUpdate(
  accounts: readonly Account[],
  snapshots: readonly Snapshot[],
  fxRates: readonly FxRate[],
  date: string,
): UpdatePlan {
  const changing: UpdateItem[] = [];
  const steady: UpdateItem[] = [];
  for (const account of accounts.filter((a) => !a.archived)) {
    const own = snapshots
      .filter((s) => s.accountId === account.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    const before = own.filter((s) => s.date < date);
    const item: UpdateItem = {
      account,
      lastMinor: before[0]?.balanceMinor,
      lastDate: before[0]?.date,
      savedMinor: own.find((s) => s.date === date)?.balanceMinor,
    };
    const recent = before.slice(0, 3);
    const unchanged = recent.length === 3 && recent.every((s) => s.balanceMinor === recent[0].balanceMinor);
    (unchanged ? steady : changing).push(item);
  }
  const currencies = [...new Set(accounts.filter((a) => !a.archived).map((a) => a.currency))]
    .filter((c) => c !== BASE_CURRENCY)
    .sort()
    .map((currency) => {
      const earlier = fxRates.filter((r) => r.currency === currency && r.date < date);
      return {
        currency,
        last: earlier.length ? rateFor(earlier, currency, date) : undefined,
        saved: fxRates.find((r) => r.currency === currency && r.date === date)?.twdPerUnit,
      };
    });
  return { changing, steady, currencies };
}

/** "1 min 40 s" */
export function durationText(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? t('{m} min {v} s', { m, v: s % 60 }) : `${s} s`;
}

const TIMES_KEY = 'fi-tracker-update-times';

/** Keeps the last 12 update durations on this device (success metric: under 3 minutes). */
export function recordUpdateTime(date: string, ms: number): void {
  try {
    const list = JSON.parse(localStorage.getItem(TIMES_KEY) ?? '[]') as { date: string; ms: number }[];
    list.push({ date, ms });
    localStorage.setItem(TIMES_KEY, JSON.stringify(list.slice(-12)));
  } catch {
    // Storage unavailable: nothing to record.
  }
}

// ---------- Pay and spending inside the monthly update (UX doc, M1) ----------

export interface FlowTotals {
  /** TWD minor units. */
  incomeMinor: number;
  spendingMinor: number;
}

export interface FlowPlan {
  /** Totals already entered for the month (any entries, one-offs included). */
  existing?: FlowTotals;
  /** The latest earlier month with monthly totals, and its regular (non one-off) totals. */
  previousMonth?: string;
  previous?: FlowTotals;
}

/** Regular monthly totals: not one-offs, not individual transactions. */
const regular = (c: CashFlow) => !c.lumpSum && !c.date && !c.scheduled;

function totalsOf(
  flows: readonly CashFlow[],
  categories: readonly Category[],
  fxRates: readonly FxRate[],
): FlowTotals {
  const m = monthlyTotals(flows, categories, fxRates)[0];
  return { incomeMinor: toMinor(m?.income ?? 0), spendingMinor: toMinor(m?.expense ?? 0) };
}

/** What the pay-and-spending step starts from: this month's entries, else last month's totals. */
export function planFlows(
  cashFlows: readonly CashFlow[],
  categories: readonly Category[],
  fxRates: readonly FxRate[],
  month: string,
): FlowPlan {
  const here = cashFlows.filter((c) => c.month === month && !c.scheduled);
  const previousMonth = [
    ...new Set(cashFlows.filter((c) => regular(c) && c.month < month).map((c) => c.month)),
  ]
    .sort()
    .at(-1);
  return {
    existing: here.length ? totalsOf(here, categories, fxRates) : undefined,
    previousMonth,
    previous: previousMonth
      ? totalsOf(
          cashFlows.filter((c) => c.month === previousMonth && regular(c)),
          categories,
          fxRates,
        )
      : undefined,
  };
}

export interface OneOff {
  kind: 'income' | 'expense';
  categoryId: string;
  amountMinor: number;
  note?: string;
}

/**
 * The month's entries from two totals: last month's regular entries scaled to the new totals,
 * so the categories keep their split; a single entry in the first category of the kind when
 * there is nothing to copy. One-offs are added as lump sums.
 */
export function buildMonthFlows(
  cashFlows: readonly CashFlow[],
  categories: readonly Category[],
  fxRates: readonly FxRate[],
  month: string,
  totals: FlowTotals,
  oneOffs: readonly OneOff[],
  now: string,
): CashFlow[] {
  const plan = planFlows(cashFlows, categories, fxRates, month);
  const kindOf = new Map(categories.map((c) => [c.id, c.kind]));
  const previous = cashFlows.filter((c) => c.month === plan.previousMonth && regular(c));
  const at = { createdAt: now, updatedAt: now };
  const out: CashFlow[] = [];
  for (const kind of ['income', 'expense'] as const) {
    const target = kind === 'income' ? totals.incomeMinor : totals.spendingMinor;
    if (target <= 0) continue;
    const from = previous.filter((c) => kindOf.get(c.categoryId) === kind);
    const fromTotal = totalsOf(from, categories, fxRates);
    const base = kind === 'income' ? fromTotal.incomeMinor : fromTotal.spendingMinor;
    if (from.length && base > 0) {
      const factor = target / base;
      for (const c of from)
        out.push({
          id: newId(),
          month,
          categoryId: c.categoryId,
          amountMinor: Math.round(c.amountMinor * factor),
          currency: c.currency,
          lumpSum: false,
          ...at,
        });
    } else {
      const category = categories.find((c) => c.kind === kind && !c.system);
      if (category)
        out.push({
          id: newId(),
          month,
          categoryId: category.id,
          amountMinor: target,
          currency: BASE_CURRENCY,
          lumpSum: false,
          ...at,
        });
    }
  }
  for (const o of oneOffs.filter((x) => x.amountMinor > 0))
    out.push({
      id: newId(),
      month,
      categoryId: o.categoryId,
      amountMinor: o.amountMinor,
      currency: BASE_CURRENCY,
      lumpSum: true,
      note: o.note || undefined,
      ...at,
    });
  return out;
}

/** Quarterly and annual prompts for the recap, only when due (UX doc, M1). */
export function duePrompts(month: string): ('quarterly' | 'annual')[] {
  const m = Number(month.slice(5, 7));
  const out: ('quarterly' | 'annual')[] = [];
  if (m % 3 === 0) out.push('quarterly');
  if (m === 12) out.push('annual');
  return out;
}
