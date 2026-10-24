import { baselineContext, buildProjectionInput, normaliseAllocation, type PlanData } from './baseline';
import { ASSET_CLASSES } from './entities';
import { computeAlerts } from './alerts';
import { monthlyTotals } from './cashflow';
import { netWorthAt, netWorthSeries } from './networth';
import { flowsVsPlan, lockProjection, netWorthVsPlan, plannedInvestableAt } from './planVsActual';
import { runProjection } from './projection';
import { sensitivity } from './sensitivity';
import { makeAccount, makeAssumptions, makeSettings, stamp } from './testFixtures';

function data(): PlanData {
  const accounts = [
    makeAccount({ id: 'cash', assetClass: 'cash' }),
    makeAccount({ id: 'etf', type: 'brokerage', assetClass: 'tw_equity' }),
    makeAccount({ id: 'ib', type: 'brokerage', assetClass: 'us_equity', currency: 'USD' }),
    makeAccount({ id: 'pension', type: 'pension', assetClass: 'other', accessAge: 60 }),
    makeAccount({ id: 'home', type: 'property', assetClass: 'property', investable: false }),
    makeAccount({ id: 'loan', type: 'liability', assetClass: 'other', investable: false }),
  ];
  const snap = (accountId: string, date: string, major: number) => ({
    id: `${accountId}${date}`,
    date,
    accountId,
    balanceMinor: major * 100,
    ...stamp,
  });
  return {
    settings: makeSettings({ birthYear: 1990 }),
    accounts,
    snapshots: [
      snap('cash', '2026-08-31', 400_000),
      snap('cash', '2026-09-30', 500_000),
      snap('etf', '2026-09-30', 2_000_000),
      snap('ib', '2026-09-30', 50_000),
      snap('pension', '2026-09-30', 1_000_000),
      snap('home', '2026-09-30', 12_000_000),
      snap('loan', '2026-09-30', 8_000_000),
    ],
    fxRates: [{ id: 'fx', date: '2026-09-30', currency: 'USD', twdPerUnit: 32, ...stamp }],
    liabilities: [
      {
        accountId: 'loan',
        interestRate: 0.02,
        monthlyPaymentMinor: 40_000_00,
        remainingMonths: 240,
        termsAsOf: '2026-08',
        cashFlow: 'included',
        categoryId: 'exp',
        ...stamp,
      },
    ],
    categories: [
      { id: 'inc', name: 'Salary', kind: 'income', essential: false, ...stamp },
      { id: 'exp', name: 'Living', kind: 'expense', essential: true, ...stamp },
    ],
    cashFlows: ['2026-08', '2026-09'].flatMap((m) => [
      {
        id: `i${m}`,
        month: m,
        categoryId: 'inc',
        amountMinor: 120_000_00,
        currency: 'TWD',
        lumpSum: false,
        ...stamp,
      },
      {
        id: `e${m}`,
        month: m,
        categoryId: 'exp',
        amountMinor: 70_000_00,
        currency: 'TWD',
        lumpSum: false,
        ...stamp,
      },
    ]),
    incomeStreams: [
      { id: 's', name: 'Rental', startAge: 50, annualMinor: 240_000_00, inflationLinked: false, ...stamp },
    ],
  };
}

describe('baseline', () => {
  const assumptions = makeAssumptions();

  it('builds buckets, cash flow and FI spending from the latest data', () => {
    const d = data();
    const ctx = baselineContext(d);
    expect(ctx.asOfDate).toBe('2026-09-30');
    expect(ctx.startAge).toBe(36);
    expect(ctx.fiSpendingFromT12).toBe(true);
    expect(ctx.warnings.some((w) => w.includes('No FI budget'))).toBe(true);
    const input = buildProjectionInput(d, assumptions, undefined, ctx);
    expect(input.liquid).toHaveLength(3);
    expect(input.locked).toEqual([
      { assetClass: 'other', currency: 'TWD', value: 1_000_000, unlockAge: 60, pension: true },
    ]);
    expect(input.nonInvestable[0].value).toBe(12_000_000);
    // 240 payments from 2026-08; the projection starts after September's.
    expect(input.liabilities[0]).toEqual({
      balance: 8_000_000,
      rate: 0.02,
      annualPayment: 480_000,
      months: 238,
    });
    expect(input.annualIncome).toBe(1_440_000);
    // Spending of 70k a month holds the 40k loan payment, which now runs on its own schedule.
    expect(input.currentSpending).toBe(360_000);
    expect(input.fiSpending).toBe(360_000);
    expect(input.allocation.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(input.rebalance).toBe(false);
  });

  it('applies scenario overrides', () => {
    const input = buildProjectionInput(data(), assumptions, {
      overrides: {
        annualIncomeMinor: 2_000_000_00,
        fiSpendingMinor: 500_000_00,
        spendingMultiplier: 1.1,
        targetFiAge: 50,
        allocation: { us_equity: 1 },
      },
      events: [{ date: '2030-06-01', amountMinor: -1_000_000_00, description: 'Down payment' }],
      withdrawalRule: { kind: 'guardrails', band: 0.2, step: 0.1 },
    });
    expect(input.annualIncome).toBe(2_000_000);
    expect(input.fiSpending).toBeCloseTo(550_000);
    expect(input.currentSpending).toBeCloseTo(396_000);
    expect(input.retireAtAge).toBe(50);
    expect(input.rebalance).toBe(true);
    expect(input.allocation[ASSET_CLASSES.indexOf('us_equity')]).toBe(1);
    expect(input.events).toEqual([{ year: 2030, amount: -1_000_000, description: 'Down payment' }]);
  });

  it('falls back to current holdings, then cash, for an empty allocation', () => {
    expect(normaliseAllocation({})[0]).toBe(1);
    const nw = netWorthAt('2026-09-30', data().accounts, data().snapshots, data().fxRates, 1990);
    const w = normaliseAllocation({}, nw);
    expect(w[ASSET_CLASSES.indexOf('tw_equity')]).toBeCloseTo(2_000_000 / 4_100_000);
  });

  it('reports sensitivity in the expected directions', () => {
    const { base, rows } = sensitivity(data(), assumptions, {
      overrides: {},
      events: [],
      withdrawalRule: { kind: 'fixed_swr' },
    });
    expect(base.fiAge).toBeDefined();
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(byLabel['Return +1%'].shift!).toBeLessThan(0);
    expect(byLabel['Return −1%'].shift!).toBeGreaterThan(0);
    expect(byLabel['Savings rate +5 pts'].shift!).toBeLessThan(0);
    expect(rows).toHaveLength(6);
  });

  it('compares actuals with a locked plan', () => {
    const d = data();
    const result = runProjection(buildProjectionInput(d, assumptions));
    const points = lockProjection(result);
    expect(points[0].investable).toBe(result.rows[0].investable);
    expect(points[0].savings).toBe(result.rows[1].savings);
    expect(plannedInvestableAt(points, '2026-09-30', '2026-09-30')).toBe(points[0].investable);
    expect(plannedInvestableAt(points, '2026-09-30', '2025-01-01')).toBeUndefined();
    const series = netWorthSeries(d.accounts, d.snapshots, d.fxRates, 1990);
    const rows = netWorthVsPlan(points, '2026-09-30', series);
    expect(rows).toHaveLength(1);
    expect(rows[0].actual).toBe(series[1].investable + series[1].locked);
    const totals = monthlyTotals(d.cashFlows, d.categories, d.fxRates);
    const flows = flowsVsPlan(points, totals);
    expect(flows[0].months).toBe(2);
    expect(flows[0].actualSavings).toBe(100_000);
  });

  it('raises alerts for low savings, drift and a thin emergency fund', () => {
    const d = data();
    const nw = netWorthAt('2026-09-30', d.accounts, d.snapshots, d.fxRates, 1990);
    const totals = monthlyTotals(d.cashFlows, d.categories, d.fxRates);
    const alerts = computeAlerts(
      { targetSavingsRate: 0.5, allocationDriftThreshold: 0.1, emergencyFundMonths: 12 },
      { cash: 0.5, tw_equity: 0.5 },
      nw,
      totals,
      70_000,
    );
    const ids = alerts.map((a) => a.id);
    expect(ids).toContain('savings-rate');
    expect(ids).toContain('emergency-fund');
    expect(ids.some((i) => i.startsWith('drift-'))).toBe(true);
  });
});
