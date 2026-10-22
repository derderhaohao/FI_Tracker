import { stamp } from './testFixtures';
import { monthlyTotals, savingsBetween, savingsRate, trailing12 } from './cashflow';
import type { CashFlow, Category } from './entities';

const categories: Category[] = [
  { id: 'salary', name: 'Salary', kind: 'income', essential: false, ...stamp },
  { id: 'bonus', name: 'Bonus', kind: 'income', essential: false, ...stamp },
  { id: 'rent', name: 'Rent', kind: 'expense', essential: true, ...stamp },
];
let n = 0;
const cf = (
  month: string,
  categoryId: string,
  major: number,
  lumpSum = false,
  currency = 'TWD',
): CashFlow => ({
  id: String(++n),
  month,
  categoryId,
  amountMinor: major * 100,
  currency,
  lumpSum,
  ...stamp,
});

describe('cash flow', () => {
  const flows = [
    cf('2026-01', 'salary', 100_000),
    cf('2026-01', 'bonus', 200_000, true),
    cf('2026-01', 'rent', 40_000),
    cf('2026-02', 'salary', 100_000),
    cf('2026-02', 'rent', 50_000),
    cf('2026-02', 'salary', 100, false, 'USD'),
  ];
  const fx = [{ id: 'x', date: '2026-02-28', currency: 'USD', twdPerUnit: 30, ...stamp }];

  it('totals each month and separates lump sums', () => {
    const t = monthlyTotals(flows, categories, fx);
    expect(t.map((x) => x.month)).toEqual(['2026-01', '2026-02']);
    expect(t[0].income).toBe(300_000);
    expect(t[0].lumpIncome).toBe(200_000);
    expect(t[0].savingsRate).toBeCloseTo(260_000 / 300_000);
    expect(t[0].regularSavingsRate).toBeCloseTo(0.6);
    expect(t[1].income).toBe(103_000);
    expect(savingsBetween(t, '2026-01', '2026-02')).toBe(53_000);
  });

  it('annualises the trailing 12 months', () => {
    const t12 = trailing12(monthlyTotals(flows, categories, fx));
    expect(t12.monthsWithData).toBe(2);
    expect(t12.income).toBe(403_000);
    expect(t12.annualExpense).toBe(90_000 * 6);
    expect(t12.byCategory.rent).toBe(90_000);
  });

  it('handles empty data and zero income', () => {
    expect(trailing12([]).monthsWithData).toBe(0);
    expect(savingsRate(0, 10)).toBeNaN();
  });
});
