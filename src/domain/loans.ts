import type { Account, CashFlow, Category, Liability, Snapshot } from './entities';
import { addMonths, monthOf, monthsBetween } from './dates';
import { fromMinor } from './money';

/**
 * Loans are defined once, by their terms in Accounts. Cash flow either already contains the
 * payment (inside a category the user names) or gets it added automatically as a scheduled
 * "Loan payments" row; the projection takes loan payments out of everyday spending and pays
 * them on their own schedule, so they stop when the loan ends and continue after FI.
 */

export const LOAN_CATEGORY = 'loans';

/** How a loan's payment shows up in cash flow; absent means it is already in spending. */
export function loanCashFlowMode(terms: Liability): 'included' | 'auto' {
  return terms.cashFlow ?? 'included';
}

export interface LoanSchedule {
  accountId: string;
  /** Monthly payment in TWD. */
  monthly: number;
  /** First month with a payment we know of: the loan's first snapshot, else when the terms were set. */
  startMonth: string;
  /** First month without a payment. */
  endMonth: string;
  mode: 'included' | 'auto';
  /**
   * The expense category the payment shows under: for included loans the one whose amounts
   * already hold it, for automatic ones the one it is added to (else the "Loan payments" row).
   */
  categoryId?: string;
}

/** Before any month: a loan already running when tracking began counts in every earlier month. */
const BEGINNING = '0000-01';

/** Longest schedule we model: a payment that never clears the loan runs this long. */
export const MAX_LOAN_MONTHS = 1200;

/**
 * Months to repay `balance` at `annualRate` with a fixed monthly `payment`:
 * n = −ln(1 − r·B / P) / ln(1 + r) with r the monthly rate. Undefined when the payment does
 * not cover the interest, so the loan is never repaid.
 */
export function monthsToRepay(balance: number, annualRate: number, payment: number): number | undefined {
  if (balance <= 0.005) return 0;
  if (payment <= 0) return undefined;
  const r = annualRate / 12;
  if (r <= 0) return Math.ceil(balance / payment - 1e-9);
  if (payment <= r * balance) return undefined;
  return Math.ceil(-Math.log(1 - (r * balance) / payment) / Math.log(1 + r) - 1e-9);
}

export interface LoanTerm {
  /** Payments left after `asOf`'s previous month; MAX_LOAN_MONTHS when never repaid. */
  months: number;
  /** First month the remaining payments count from. */
  asOf: string;
  /** The balance the term is worked out from, in the loan's currency, and its date. */
  balance?: number;
  date?: string;
  /** The payment does not cover the interest. */
  neverRepaid: boolean;
}

/**
 * The remaining term, worked out from the loan's latest balance in Snapshots, its rate and its
 * payment, so it follows every new balance. Without a snapshot, the term stored with the loan.
 */
export function loanTerm(terms: Liability, snapshots: readonly Snapshot[]): LoanTerm | undefined {
  const latest = snapshots
    .filter((s) => s.accountId === terms.accountId)
    .reduce<Snapshot | undefined>((m, s) => (m === undefined || s.date > m.date ? s : m), undefined);
  if (!latest) {
    if (terms.remainingMonths <= 0) return undefined;
    return {
      months: terms.remainingMonths,
      asOf: terms.termsAsOf ?? monthOf(terms.updatedAt),
      neverRepaid: false,
    };
  }
  const balance = fromMinor(latest.balanceMinor);
  const months = monthsToRepay(balance, terms.interestRate, fromMinor(terms.monthlyPaymentMinor));
  return {
    months: months ?? MAX_LOAN_MONTHS,
    asOf: addMonths(monthOf(latest.date), 1),
    balance,
    date: latest.date,
    neverRepaid: months === undefined,
  };
}

/** Payment schedules for loans with a monthly payment, ending when the loan is repaid. */
export function loanSchedules(
  liabilities: readonly Liability[],
  accounts: readonly Account[],
  snapshots: readonly Snapshot[],
): LoanSchedule[] {
  const out: LoanSchedule[] = [];
  const firstTracked = snapshots.reduce<string | undefined>(
    (m, s) => (m === undefined || s.date < m ? s.date : m),
    undefined,
  );
  for (const terms of liabilities) {
    const account = accounts.find((a) => a.id === terms.accountId);
    if (!account || account.archived || terms.monthlyPaymentMinor <= 0) continue;
    const term = loanTerm(terms, snapshots);
    if (!term) continue;
    const first = snapshots
      .filter((s) => s.accountId === terms.accountId)
      .reduce<string | undefined>((m, s) => (m === undefined || s.date < m ? s.date : m), undefined);
    // A loan that was there when tracking began (in the first snapshot) was being paid in every
    // cash-flow month before it too; one added later starts at its first snapshot, or when its
    // terms were entered if earlier.
    const existing =
      first !== undefined && firstTracked !== undefined && monthOf(first) === monthOf(firstTracked);
    const startMonth = existing
      ? BEGINNING
      : [first ? monthOf(first) : undefined, terms.termsAsOf, term.asOf]
          .filter((m): m is string => m !== undefined)
          .reduce((a, b) => (b < a ? b : a));
    out.push({
      accountId: terms.accountId,
      monthly: fromMinor(terms.monthlyPaymentMinor),
      startMonth,
      endMonth: addMonths(term.asOf, term.months),
      mode: loanCashFlowMode(terms),
      categoryId: terms.categoryId,
    });
  }
  return out;
}

export const isActive = (s: LoanSchedule, month: string) => month >= s.startMonth && month < s.endMonth;

/** Payments still due from `month` (inclusive). */
export function monthsLeft(s: LoanSchedule, month: string): number {
  return Math.max(0, monthsBetween(month, s.endMonth));
}

/** The "Loan payments" expense category, if it exists. */
export function loanCategory(categories: readonly Category[]): Category | undefined {
  return categories.find((c) => c.system === LOAN_CATEGORY);
}

/**
 * The category an automatic loan's payment is added to: the expense category chosen for it,
 * else the "Loan payments" row (when it exists).
 */
export function loanTarget(s: LoanSchedule, categories: readonly Category[]): Category | undefined {
  const chosen = categories.find((c) => c.id === s.categoryId && c.kind === 'expense');
  return chosen ?? loanCategory(categories);
}

/**
 * Scheduled payments for loans added automatically: one TWD row per tracked month (a month
 * with any stored entry) and target category while a loan runs. In the "Loan payments" row a
 * stored entry for a month replaces the schedule for that month (a prepayment, a skipped
 * payment). These rows are never stored.
 */
export function scheduledLoanFlows(
  cashFlows: readonly CashFlow[],
  schedules: readonly LoanSchedule[],
  categories: readonly Category[],
): CashFlow[] {
  const system = loanCategory(categories);
  const auto = schedules.filter((s) => s.mode === 'auto');
  if (auto.length === 0) return [];
  const tracked = new Set(cashFlows.map((f) => f.month));
  const overridden = new Set(
    system ? cashFlows.filter((f) => f.categoryId === system.id).map((f) => f.month) : [],
  );
  const out: CashFlow[] = [];
  for (const month of [...tracked].sort()) {
    const byTarget = new Map<string, number>();
    for (const s of auto) {
      const target = loanTarget(s, categories);
      if (!target || !isActive(s, month)) continue;
      if (target.id === system?.id && overridden.has(month)) continue;
      byTarget.set(target.id, (byTarget.get(target.id) ?? 0) + s.monthly);
    }
    for (const [categoryId, amount] of byTarget) {
      out.push({
        id: `loan:${categoryId}:${month}`,
        month,
        categoryId,
        amountMinor: Math.round(amount * 100),
        currency: 'TWD',
        lumpSum: false,
        scheduled: true,
        createdAt: '',
        updatedAt: '',
      });
    }
  }
  return out;
}

/** Loan payments shown in `categoryId` for `month`: kept inside its amounts, or added to them. */
export function loanPaymentsInCategory(
  schedules: readonly LoanSchedule[],
  categories: readonly Category[],
  categoryId: string,
  month: string,
): { included: number; added: number } {
  let included = 0;
  let added = 0;
  for (const s of schedules) {
    if (!isActive(s, month)) continue;
    if (s.mode === 'included' && s.categoryId === categoryId) included += s.monthly;
    else if (s.mode === 'auto' && loanTarget(s, categories)?.id === categoryId) added += s.monthly;
  }
  return { included, added };
}

/**
 * Loan payments inside the cash-flow months `months` (TWD): what the "Loan payments" row
 * recorded, plus the scheduled payment of loans whose payment sits inside other spending.
 */
export function loanPaymentsIn(
  months: readonly string[],
  byMonth: ReadonlyMap<string, Record<string, number>>,
  schedules: readonly LoanSchedule[],
  categories: readonly Category[],
): number {
  const system = loanCategory(categories);
  let sum = 0;
  for (const month of months) {
    // The "Loan payments" row holds its own payments, typed overrides included.
    if (system) sum += byMonth.get(month)?.[system.id] ?? 0;
    for (const s of schedules) {
      if (!isActive(s, month)) continue;
      if (s.mode === 'included') sum += s.monthly;
      else {
        const target = loanTarget(s, categories);
        if (target && target.id !== system?.id) sum += s.monthly;
      }
    }
  }
  return sum;
}
