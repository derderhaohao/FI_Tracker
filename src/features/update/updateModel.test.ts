import type { CashFlow, Category } from '@/domain/entities';
import { stamp } from '@/domain/testFixtures';
import { toMinor } from '@/domain/money';
import { buildMonthFlows, duePrompts, planFlows } from './updateModel';

const cat = (id: string, kind: 'income' | 'expense'): Category => ({
  id,
  name: id,
  kind,
  essential: false,
  ...stamp,
});
const categories = [cat('salary', 'income'), cat('rent', 'expense'), cat('food', 'expense')];
const flow = (id: string, month: string, categoryId: string, major: number, patch: Partial<CashFlow> = {}) =>
  ({
    id,
    month,
    categoryId,
    amountMinor: toMinor(major),
    currency: 'TWD',
    lumpSum: false,
    ...stamp,
    ...patch,
  }) as CashFlow;

const flows: CashFlow[] = [
  flow('a', '2026-09', 'salary', 90_000),
  flow('b', '2026-09', 'rent', 20_000),
  flow('c', '2026-09', 'food', 30_000),
  // A bonus is a one-off: never part of next month's totals.
  flow('d', '2026-09', 'salary', 50_000, { lumpSum: true }),
];

describe('pay and spending in the monthly update (UX doc, M1)', () => {
  it('pre-fills two totals from the last month with regular entries', () => {
    const plan = planFlows(flows, categories, [], '2026-10');
    expect(plan.existing).toBeUndefined();
    expect(plan.previousMonth).toBe('2026-09');
    expect(plan.previous).toEqual({ incomeMinor: toMinor(90_000), spendingMinor: toMinor(50_000) });
    expect(planFlows(flows, categories, [], '2026-09').existing).toEqual({
      incomeMinor: toMinor(140_000),
      spendingMinor: toMinor(50_000),
    });
  });

  it('scales last month’s categories to the new totals, keeping their split', () => {
    const out = buildMonthFlows(
      flows,
      categories,
      [],
      '2026-10',
      { incomeMinor: toMinor(90_000), spendingMinor: toMinor(60_000) },
      [],
      stamp.createdAt,
    );
    expect(out.every((f) => f.month === '2026-10' && !f.lumpSum)).toBe(true);
    const by = Object.fromEntries(out.map((f) => [f.categoryId, f.amountMinor]));
    expect(by).toEqual({ salary: toMinor(90_000), rent: toMinor(24_000), food: toMinor(36_000) });
  });

  it('uses the first category when there is nothing to copy, and adds one-offs as lump sums', () => {
    const out = buildMonthFlows(
      [],
      categories,
      [],
      '2026-10',
      { incomeMinor: toMinor(80_000), spendingMinor: 0 },
      [{ kind: 'expense', categoryId: 'food', amountMinor: toMinor(5_000), note: 'Party' }],
      stamp.createdAt,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ categoryId: 'salary', amountMinor: toMinor(80_000), lumpSum: false });
    expect(out[1]).toMatchObject({ categoryId: 'food', lumpSum: true, note: 'Party' });
  });

  it('scales foreign-currency entries in their own currency, by the TWD total', () => {
    const fx = [{ id: 'r', date: '2026-09-30', currency: 'USD', twdPerUnit: 30, ...stamp }];
    const mixed = [
      flow('t', '2026-09', 'salary', 60_000),
      flow('u', '2026-09', 'salary', 1_000, { currency: 'USD' }),
    ];
    // 60,000 + 1,000 × 30 = 90,000 TWD last month; double it.
    expect(planFlows(mixed, categories, fx, '2026-10').previous?.incomeMinor).toBe(toMinor(90_000));
    const out = buildMonthFlows(
      mixed,
      categories,
      fx,
      '2026-10',
      { incomeMinor: toMinor(180_000), spendingMinor: 0 },
      [],
      stamp.createdAt,
    );
    expect(out.map((f) => [f.currency, f.amountMinor])).toEqual([
      ['TWD', toMinor(120_000)],
      ['USD', toMinor(2_000)],
    ]);
  });

  it('leaves transactions and scheduled loan payments out of last month’s totals', () => {
    const list = [
      ...flows,
      flow('tx', '2026-09', 'food', 9_999, { date: '2026-09-12' }),
      flow('loan', '2026-09', 'rent', 12_500, { scheduled: true }),
    ];
    expect(planFlows(list, categories, [], '2026-10').previous).toEqual({
      incomeMinor: toMinor(90_000),
      spendingMinor: toMinor(50_000),
    });
    // No earlier month at all: nothing to pre-fill.
    expect(planFlows(list, categories, [], '2026-09').previousMonth).toBeUndefined();
  });

  it('asks for the quarterly and annual checks only when due', () => {
    expect(duePrompts('2026-10')).toEqual([]);
    expect(duePrompts('2026-09')).toEqual(['quarterly']);
    expect(duePrompts('2026-12')).toEqual(['quarterly', 'annual']);
  });
});
