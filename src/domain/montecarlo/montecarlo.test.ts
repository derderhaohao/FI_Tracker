import { buildProjectionInput, withoutVolatility, type PlanData } from '../baseline';
import { ASSET_CLASSES } from '../entities';
import { correlationMatrix } from '../assumptions';
import { runProjection } from '../projection';
import { makeAccount, makeAssumptions, makeSettings, stamp } from '../testFixtures';
import { cholesky, correlate } from './cholesky';
import { lognormalReturn, mulberry32, normalSource } from './rng';
import { runMonteCarlo } from './runner';

function planData(): PlanData {
  const accounts = [
    makeAccount({ id: 'cash', assetClass: 'cash' }),
    makeAccount({ id: 'tw', type: 'brokerage', assetClass: 'tw_equity' }),
    makeAccount({ id: 'us', type: 'brokerage', assetClass: 'us_equity', currency: 'USD' }),
    makeAccount({ id: 'pension', type: 'pension', assetClass: 'other', accessAge: 60 }),
  ];
  const snap = (accountId: string, major: number) => ({
    id: accountId,
    date: '2026-09-30',
    accountId,
    balanceMinor: major * 100,
    ...stamp,
  });
  const categories = [
    { id: 'inc', name: 'Salary', kind: 'income' as const, essential: false, ...stamp },
    {
      id: 'exp',
      name: 'Living',
      kind: 'expense' as const,
      essential: true,
      fiAnnualMinor: 600_000_00,
      ...stamp,
    },
  ];
  const months = ['2026-07', '2026-08', '2026-09'];
  const cashFlows = months.flatMap((m, i) => [
    {
      id: `i${i}`,
      month: m,
      categoryId: 'inc',
      amountMinor: 150_000_00,
      currency: 'TWD',
      lumpSum: false,
      ...stamp,
    },
    {
      id: `e${i}`,
      month: m,
      categoryId: 'exp',
      amountMinor: 60_000_00,
      currency: 'TWD',
      lumpSum: false,
      ...stamp,
    },
  ]);
  return {
    settings: makeSettings(),
    accounts,
    snapshots: [
      snap('cash', 1_000_000),
      snap('tw', 3_000_000),
      snap('us', 100_000),
      snap('pension', 1_500_000),
    ],
    fxRates: [{ id: 'fx', date: '2026-09-30', currency: 'USD', twdPerUnit: 32, ...stamp }],
    liabilities: [],
    categories,
    cashFlows,
    incomeStreams: [],
  };
}

describe('Monte Carlo', () => {
  const assumptions = makeAssumptions();
  assumptions.taiwan.laborInsurance.avgMonthlyInsuredSalaryMinor = 45_800_00;
  assumptions.taiwan.laborInsurance.insuredYearsToDate = 10;
  assumptions.taiwan.laborPension.monthlyInsuredWageMinor = 100_000_00;
  const input = buildProjectionInput(planData(), assumptions);

  it('is deterministic for a seed', () => {
    const a = runMonteCarlo(input, { runs: 200, seed: 7 });
    const b = runMonteCarlo(input, { runs: 200, seed: 7 });
    const c = runMonteCarlo(input, { runs: 200, seed: 8 });
    expect(a.p50).toEqual(b.p50);
    expect(a.successRate).toBe(b.successRate);
    expect(a.p50).not.toEqual(c.p50);
  });

  it('reproduces the deterministic projection exactly with zero volatility', () => {
    const flat = withoutVolatility(input);
    const det = runProjection(flat);
    const mc = runMonteCarlo(flat, { runs: 20, seed: 1 });
    expect(mc.p10).toEqual(Array.from(det.investable));
    expect(mc.p90).toEqual(Array.from(det.investable));
    expect(mc.fiAgeP50).toBe(det.fiAge);
    expect(mc.successRate).toBe(det.success ? 1 : 0);
  });

  it('draws returns with the assumed mean and correlation', () => {
    const L = cholesky(correlationMatrix(assumptions));
    const normal = normalSource(mulberry32(123));
    const n = 10_000;
    const tw = ASSET_CLASSES.indexOf('tw_equity');
    const us = ASSET_CLASSES.indexOf('us_equity');
    const z = new Float64Array(ASSET_CLASSES.length);
    const out = new Float64Array(ASSET_CLASSES.length);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < z.length; j++) z[j] = normal();
      correlate(L, z, out);
      xs.push(out[tw]);
      ys.push(out[us]);
    }
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    const mx = mean(xs);
    const my = mean(ys);
    const cov = mean(xs.map((x, i) => (x - mx) * (ys[i] - my)));
    const sd = (a: number[], m: number) => Math.sqrt(mean(a.map((v) => (v - m) ** 2)));
    expect(cov / (sd(xs, mx) * sd(ys, my))).toBeCloseTo(0.6, 1);
    const returns = xs.map((x) => lognormalReturn(0.07, 0.2, x));
    expect(mean(returns)).toBeCloseTo(0.07, 2);
    expect(sd(returns, mean(returns))).toBeCloseTo(0.2, 1);
  });

  it('repairs a correlation matrix that is not positive definite', () => {
    const L = cholesky([
      [1, 0.99, -0.99],
      [0.99, 1, 0.99],
      [-0.99, 0.99, 1],
    ]);
    expect(L.every((row) => row.every(Number.isFinite))).toBe(true);
  });

  // The 5-second target is checked by `npm run perf` without coverage instrumentation,
  // which slows this suite several-fold and would make a timing assertion meaningless here.
  it('runs the maximum of 10,000 paths and orders the bands', { timeout: 60_000 }, () => {
    const mc = runMonteCarlo(input, { runs: 20_000, seed: 42 });
    expect(mc.runs).toBe(10_000);
    expect(mc.successRate).toBeGreaterThan(0);
    expect(mc.p10[30]).toBeLessThan(mc.p50[30]);
    expect(mc.p50[30]).toBeLessThan(mc.p90[30]);
  });
});
