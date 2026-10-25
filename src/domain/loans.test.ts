import { describe, expect, it } from 'vitest';
import type { CashFlow, Category, Liability, Snapshot } from './entities';
import {
  isActive,
  loanPaymentsIn,
  loanPaymentsInCategory,
  loanSchedules,
  loanTerm,
  MAX_LOAN_MONTHS,
  monthsLeft,
  monthsToRepay,
  scheduledLoanFlows,
} from './loans';
import { makeAccount } from './testFixtures';

const stamp = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const loanAccount = makeAccount({ id: 'car', type: 'liability', assetClass: 'other', investable: false });
const terms = (over: Partial<Liability> = {}): Liability => ({
  accountId: 'car',
  interestRate: 0.025,
  monthlyPaymentMinor: 12_500_00,
  remainingMonths: 14,
  termsAsOf: '2026-09',
  ...stamp,
  ...over,
});
const snap = (date: string, owed = 170_000): Snapshot => ({
  id: date,
  accountId: 'car',
  date,
  balanceMinor: owed * 100,
  ...stamp,
});
const loansCategory: Category = {
  id: 'loans',
  name: 'Loan payments',
  kind: 'expense',
  essential: true,
  system: 'loans',
  ...stamp,
};
const flow = (month: string, categoryId: string, amount: number): CashFlow => ({
  id: `${categoryId}-${month}`,
  month,
  categoryId,
  amountMinor: amount * 100,
  currency: 'TWD',
  lumpSum: false,
  ...stamp,
});

describe('months to repay', () => {
  it('follow the amortisation formula', () => {
    // NT$170,000 at 2.5% with NT$12,500 a month: 13 full payments and a smaller 14th.
    expect(monthsToRepay(170_000, 0.025, 12_500)).toBe(14);
    expect(monthsToRepay(120_000, 0, 12_000)).toBe(10);
    expect(monthsToRepay(120_001, 0, 12_000)).toBe(11);
    expect(monthsToRepay(0, 0.03, 10_000)).toBe(0);
  });

  it('never end when the payment does not cover the interest', () => {
    expect(monthsToRepay(10_000_000, 0.03, 25_000)).toBeUndefined();
    expect(monthsToRepay(10_000, 0.03, 0)).toBeUndefined();
  });
});

describe('loan schedules', () => {
  it('work the term out from the latest balance; a loan added later starts at its first snapshot', () => {
    const bank: Snapshot = { ...snap('2026-01-31'), id: 'bank', accountId: 'bank' };
    const [s] = loanSchedules(
      [terms()],
      [loanAccount],
      [bank, snap('2026-06-30', 207_000), snap('2026-09-30')],
    );
    expect(s).toMatchObject({
      monthly: 12_500,
      startMonth: '2026-06',
      endMonth: '2027-12',
      mode: 'included',
    });
    expect(monthsLeft(s, '2026-10')).toBe(14);
    expect(monthsLeft(s, '2028-01')).toBe(0);
    expect(loanTerm(terms(), [snap('2026-09-30')])).toMatchObject({
      months: 14,
      asOf: '2026-10',
      balance: 170_000,
      date: '2026-09-30',
      neverRepaid: false,
    });
  });

  it('count a loan that was there when tracking began in every earlier cash-flow month', () => {
    // Setup records last month's cash flow, then today's balances: the loan was paid last month too.
    const [s] = loanSchedules([terms()], [loanAccount], [snap('2026-10-24')]);
    expect(isActive(s, '2026-09')).toBe(true);
    expect(isActive(s, '2024-01')).toBe(true);
    expect(isActive(s, '2027-12')).toBe(true);
    expect(isActive(s, '2028-01')).toBe(false);
  });

  it('shorten when a new, lower balance is entered', () => {
    const [s] = loanSchedules([terms()], [loanAccount], [snap('2026-09-30'), snap('2026-10-31', 50_000)]);
    expect(s.endMonth).toBe('2027-04');
  });

  it('run to the longest term when the payment never repays the loan', () => {
    const t = loanTerm(terms({ monthlyPaymentMinor: 300_00 }), [snap('2026-09-30')]);
    expect(t).toMatchObject({ months: MAX_LOAN_MONTHS, neverRepaid: true });
  });

  it('fall back to the stored term without a balance', () => {
    expect(loanTerm(terms(), [])).toEqual({ months: 14, asOf: '2026-09', neverRepaid: false });
  });

  it('skip loans without a payment or term, and archived ones', () => {
    expect(loanSchedules([terms({ monthlyPaymentMinor: 0 })], [loanAccount], [])).toEqual([]);
    expect(loanSchedules([terms({ remainingMonths: 0 })], [loanAccount], [])).toEqual([]);
    expect(loanSchedules([terms()], [{ ...loanAccount, archived: true }], [])).toEqual([]);
  });
});

describe('automatic loan payments in cash flow', () => {
  const schedules = loanSchedules([terms({ cashFlow: 'auto' })], [loanAccount], []);
  const stored = [flow('2026-09', 'food', 9_000), flow('2026-10', 'food', 9_000), flow('2027-12', 'food', 1)];

  it('fill every tracked month while the loan runs', () => {
    const rows = scheduledLoanFlows(stored, schedules, [loansCategory]);
    expect(rows.map((r) => [r.month, r.amountMinor, r.scheduled])).toEqual([
      ['2026-09', 12_500_00, true],
      ['2026-10', 12_500_00, true],
    ]);
  });

  it('give way to an amount typed for that month', () => {
    const rows = scheduledLoanFlows([...stored, flow('2026-10', 'loans', 50_000)], schedules, [
      loansCategory,
    ]);
    expect(rows.map((r) => r.month)).toEqual(['2026-09']);
  });

  it('need the Loan payments category and an automatic loan', () => {
    expect(scheduledLoanFlows(stored, schedules, [])).toEqual([]);
    const included = loanSchedules([terms()], [loanAccount], []);
    expect(scheduledLoanFlows(stored, included, [loansCategory])).toEqual([]);
  });
});

describe('automatic loan payments added to a chosen category', () => {
  const housing: Category = { id: 'housing', name: 'Housing', kind: 'expense', essential: true, ...stamp };
  const schedules = loanSchedules([terms({ cashFlow: 'auto', categoryId: 'housing' })], [loanAccount], []);
  const stored = [flow('2026-09', 'housing', 18_000), flow('2026-10', 'housing', 18_000)];

  it('add the payment to that category every tracked month, beside what was typed', () => {
    const rows = scheduledLoanFlows(stored, schedules, [housing, loansCategory]);
    expect(rows.map((r) => [r.categoryId, r.month, r.amountMinor])).toEqual([
      ['housing', '2026-09', 12_500_00],
      ['housing', '2026-10', 12_500_00],
    ]);
  });

  it('say what each cell holds, and count as loan payments, not everyday spending', () => {
    expect(loanPaymentsInCategory(schedules, [housing], 'housing', '2026-09')).toEqual({
      included: 0,
      added: 12_500,
    });
    const included = loanSchedules([terms({ categoryId: 'housing' })], [loanAccount], []);
    expect(loanPaymentsInCategory(included, [housing], 'housing', '2026-09')).toEqual({
      included: 12_500,
      added: 0,
    });
    const byMonth = new Map([['2026-09', { housing: 30_500 }]]);
    expect(loanPaymentsIn(['2026-09'], byMonth, schedules, [housing])).toBe(12_500);
  });
});

describe('loan payments inside recorded spending', () => {
  it('count the Loan payments row and the scheduled payment of loans kept in other spending', () => {
    const byMonth = new Map<string, Record<string, number>>([
      ['2026-09', { loans: 12_500, housing: 30_000 }],
      ['2026-10', { housing: 30_000 }],
    ]);
    const auto = loanSchedules([terms({ cashFlow: 'auto' })], [loanAccount], []);
    expect(loanPaymentsIn(['2026-09', '2026-10'], byMonth, auto, [loansCategory])).toBe(12_500);
    const included = loanSchedules([terms({ categoryId: 'housing' })], [loanAccount], []);
    expect(loanPaymentsIn(['2026-08', '2026-09', '2026-10'], byMonth, included, [])).toBe(25_000);
  });
});
