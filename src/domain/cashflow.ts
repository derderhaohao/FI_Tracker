import type { CashFlow, Category, FxRate } from './entities';
import { addMonths, lastDayOfMonth } from './dates';
import { rateFor } from './fx';
import { fromMinor } from './money';

export interface MonthTotals {
  month: string;
  income: number;
  expense: number;
  /** Lump sums only (ENG-5). */
  lumpIncome: number;
  lumpExpense: number;
  savings: number;
  /** (income − spending) ÷ income; NaN when there is no income. */
  savingsRate: number;
  /** Savings rate with lump sums left out, for trends. */
  regularSavingsRate: number;
  byCategory: Record<string, number>;
}

export function savingsRate(income: number, spending: number): number {
  if (income <= 0) return Number.NaN;
  return (income - spending) / income;
}

function emptyMonth(month: string): MonthTotals {
  return {
    month,
    income: 0,
    expense: 0,
    lumpIncome: 0,
    lumpExpense: 0,
    savings: 0,
    savingsRate: Number.NaN,
    regularSavingsRate: Number.NaN,
    byCategory: {},
  };
}

/** Cash flow converted to TWD at the rate for the month's last day. */
export function cashFlowTwd(cf: CashFlow, fxRates: readonly FxRate[]): number {
  const rate = rateFor(fxRates, cf.currency, lastDayOfMonth(cf.month)) ?? 0;
  return fromMinor(cf.amountMinor) * rate;
}

/** Totals per month in TWD, ascending by month. */
export function monthlyTotals(
  cashFlows: readonly CashFlow[],
  categories: readonly Category[],
  fxRates: readonly FxRate[],
): MonthTotals[] {
  const kind = new Map(categories.map((c) => [c.id, c.kind]));
  const months = new Map<string, MonthTotals>();
  for (const cf of cashFlows) {
    const k = kind.get(cf.categoryId);
    if (!k) continue;
    const t = months.get(cf.month) ?? emptyMonth(cf.month);
    const twd = cashFlowTwd(cf, fxRates);
    if (k === 'income') {
      t.income += twd;
      if (cf.lumpSum) t.lumpIncome += twd;
    } else {
      t.expense += twd;
      if (cf.lumpSum) t.lumpExpense += twd;
    }
    t.byCategory[cf.categoryId] = (t.byCategory[cf.categoryId] ?? 0) + twd;
    months.set(cf.month, t);
  }
  const list = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
  for (const t of list) {
    t.savings = t.income - t.expense;
    t.savingsRate = savingsRate(t.income, t.expense);
    t.regularSavingsRate = savingsRate(t.income - t.lumpIncome, t.expense - t.lumpExpense);
  }
  return list;
}

export interface TrailingTotals {
  /** Months that had data inside the window. */
  monthsWithData: number;
  income: number;
  expense: number;
  savings: number;
  savingsRate: number;
  /** Annualised: scaled to 12 months when fewer months have data. */
  annualIncome: number;
  annualExpense: number;
  byCategory: Record<string, number>;
}

/** Trailing-12-month totals ending at `endMonth` (inclusive). */
export function trailing12(totals: readonly MonthTotals[], endMonth?: string): TrailingTotals {
  const end = endMonth ?? totals.at(-1)?.month;
  const out: TrailingTotals = {
    monthsWithData: 0,
    income: 0,
    expense: 0,
    savings: 0,
    savingsRate: Number.NaN,
    annualIncome: 0,
    annualExpense: 0,
    byCategory: {},
  };
  if (!end) return out;
  const start = addMonths(end, -11);
  for (const t of totals) {
    if (t.month < start || t.month > end) continue;
    out.monthsWithData += 1;
    out.income += t.income;
    out.expense += t.expense;
    for (const [k, v] of Object.entries(t.byCategory)) out.byCategory[k] = (out.byCategory[k] ?? 0) + v;
  }
  out.savings = out.income - out.expense;
  out.savingsRate = savingsRate(out.income, out.expense);
  const scale = out.monthsWithData > 0 ? 12 / out.monthsWithData : 0;
  out.annualIncome = out.income * scale;
  out.annualExpense = out.expense * scale;
  return out;
}

/** Net savings between two months (exclusive start, inclusive end), for change attribution. */
export function savingsBetween(
  totals: readonly MonthTotals[],
  afterMonth: string,
  throughMonth: string,
): number {
  return totals
    .filter((t) => t.month > afterMonth && t.month <= throughMonth)
    .reduce((sum, t) => sum + t.savings, 0);
}
