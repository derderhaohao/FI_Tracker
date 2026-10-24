import { describe, expect, it } from 'vitest';
import type { CashFlow, Category, Liability, Snapshot } from './entities';
import { loanPaymentsIn, loanSchedules, monthsLeft, scheduledLoanFlows } from './loans';
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
const snap = (date: string): Snapshot => ({
  id: date,
  accountId: 'car',
  date,
  balanceMinor: 100_000_00,
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

describe('loan schedules', () => {
  it('count the term down from when it was entered, back to the first snapshot', () => {
    const [s] = loanSchedules([terms()], [loanAccount], [snap('2026-06-30')]);
    expect(s).toMatchObject({
      monthly: 12_500,
      startMonth: '2026-06',
      endMonth: '2027-11',
      mode: 'included',
    });
    expect(monthsLeft(s, '2026-10')).toBe(13);
    expect(monthsLeft(s, '2028-01')).toBe(0);
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
