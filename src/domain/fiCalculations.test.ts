import { makeInput, withReturn } from './testFixtures';
import {
  activeIncome,
  bridgeAdjustment,
  coastFi,
  fiNumber,
  fiTarget,
  permanentIncome,
  realReturn,
  requiredAnnualSavings,
  yearsToFi,
} from './fiNumber';
import { portfolioRealReturn, runProjection, type ProjectionInput } from './projection';
import { fiProgress } from './networth';
import { savingsRate } from './cashflow';
import { applyWithdrawalRule } from './withdrawal';
import { chanceDots, chanceText, lastsSentence, planStatus } from './planStatus';
import { runMonteCarlo } from './montecarlo';

/**
 * Cross-checks for the FI calculations: closed-form answers worked by hand, the
 * inverse relations between the helpers, and the direction each lever moves the
 * projection. The projection is checked against the formulas, not against itself.
 */

const P = 1_000_000;

/** A worker with income and spending, cash growing at `r` real. */
function saver(r: number, patch: Partial<ProjectionInput> = {}): ProjectionInput {
  return withReturn(
    makeInput({
      annualIncome: 1_200_000,
      currentSpending: 700_000,
      liquid: [{ assetClass: 'cash', currency: 'TWD', value: P }],
      ...patch,
    }),
    'cash',
    r,
  );
}

describe('FI number, worked examples', () => {
  it.each([
    // [spending, guaranteed income, SWR, FI number]
    [400_000, 0, 0.04, 10_000_000],
    [600_000, 0, 0.03, 20_000_000],
    [1_200_000, 300_000, 0.04, 22_500_000],
    [500_000, 0, 0.05, 10_000_000],
    [300_000, 300_000, 0.04, 0],
    [300_000, 500_000, 0.04, 0],
  ])('S = %d, G = %d, SWR = %d gives %d', (S, G, swr, expected) => {
    expect(fiNumber(S, G, swr)).toBeCloseTo(expected, 6);
  });

  it('is 25 × spending at the 4% rule and 33⅓ × at 3%', () => {
    expect(fiNumber(1, 0, 0.04)).toBeCloseTo(25, 10);
    expect(fiNumber(1, 0, 0.03)).toBeCloseTo(100 / 3, 10);
  });

  it('is infinite with a zero or negative SWR', () => {
    expect(fiNumber(400_000, 0, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(fiNumber(400_000, 0, -0.01)).toBe(Number.POSITIVE_INFINITY);
  });

  it('falls as the SWR rises and rises with spending', () => {
    const swrs = [0.025, 0.03, 0.035, 0.04, 0.045, 0.05];
    const values = swrs.map((s) => fiNumber(500_000, 0, s));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThan(values[i - 1]);
    expect(fiNumber(600_000, 0, 0.04)).toBeGreaterThan(fiNumber(500_000, 0, 0.04));
  });
});

describe('real return (Fisher)', () => {
  it.each([
    [0.07, 0.02, 0.0490196],
    [0.05, 0.05, 0],
    [0.02, 0.03, -0.0097087],
    [0, 0, 0],
  ])('nominal %d with inflation %d is %d real', (n, pi, r) => {
    expect(realReturn(n, pi)).toBeCloseTo(r, 6);
  });

  it('round-trips with (1 + r)(1 + π) − 1', () => {
    for (const r of [-0.05, 0, 0.03, 0.08]) {
      for (const pi of [0, 0.015, 0.04]) expect(realReturn((1 + r) * (1 + pi) - 1, pi)).toBeCloseTo(r, 12);
    }
  });
});

describe('years to FI', () => {
  /** Future value of P plus end-of-year savings s for n years at r. */
  const fv = (p: number, s: number, r: number, n: number) =>
    r === 0 ? p + s * n : p * (1 + r) ** n + (s * ((1 + r) ** n - 1)) / r;

  it.each([
    [0, 100_000, 0.05, 10],
    [500_000, 300_000, 0.04, 15],
    [2_000_000, 0, 0.06, 20],
    [1_000_000, 500_000, -0.01, 8],
    [0, 250_000, 0, 30],
  ])('P = %d, s = %d, r = %d recovers n = %d from its future value', (p, s, r, n) => {
    expect(yearsToFi(p, s, fv(p, s, r, n), r)).toBeCloseTo(n, 8);
  });

  it('is zero once the target is reached', () => {
    expect(yearsToFi(10_000_000, 0, 10_000_000, 0.05)).toBe(0);
    expect(yearsToFi(12_000_000, -50_000, 10_000_000, 0.05)).toBe(0);
  });

  it('is infinite when savings and growth can never get there', () => {
    expect(yearsToFi(0, 0, 1, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(yearsToFi(1_000_000, -100_000, 10_000_000, 0.05)).toBe(Number.POSITIVE_INFINITY);
    expect(yearsToFi(1_000_000, 0, 10_000_000, -0.02)).toBe(Number.POSITIVE_INFINITY);
  });

  it('shortens with more savings, higher returns and a lower target', () => {
    const base = yearsToFi(1_000_000, 300_000, 10_000_000, 0.04);
    expect(yearsToFi(1_000_000, 400_000, 10_000_000, 0.04)).toBeLessThan(base);
    expect(yearsToFi(1_000_000, 300_000, 10_000_000, 0.06)).toBeLessThan(base);
    expect(yearsToFi(1_000_000, 300_000, 8_000_000, 0.04)).toBeLessThan(base);
    expect(yearsToFi(2_000_000, 300_000, 10_000_000, 0.04)).toBeLessThan(base);
  });

  it('matches a year-by-year simulation of the same formula', () => {
    const s = 400_000;
    const r = 0.05;
    const T = 15_000_000;
    let balance = P;
    let years = 0;
    while (balance < T) {
      balance = balance * (1 + r) + s;
      years += 1;
    }
    const n = yearsToFi(P, s, T, r);
    expect(Math.ceil(n)).toBe(years);
  });
});

describe('coast FI and required savings', () => {
  it('discounts the target back at the real return', () => {
    expect(coastFi(10_000_000, 0.05, 20)).toBeCloseTo(10_000_000 / 1.05 ** 20, 6);
    expect(coastFi(10_000_000, 0, 20)).toBe(10_000_000);
    expect(coastFi(10_000_000, 0.05, 0)).toBe(10_000_000);
  });

  it('needs no savings when today’s money coasts to the target', () => {
    const T = 10_000_000;
    const years = 25;
    const r = 0.05;
    expect(requiredAnnualSavings(coastFi(T, r, years), T, r, years)).toBeCloseTo(0, 4);
    expect(requiredAnnualSavings(coastFi(T, r, years) * 1.01, T, r, years)).toBe(0);
  });

  it('is the inverse of years to FI', () => {
    for (const [p, T, r, n] of [
      [0, 10_000_000, 0.05, 20],
      [1_000_000, 12_000_000, 0.03, 15],
      [3_000_000, 8_000_000, 0.07, 7],
    ]) {
      const s = requiredAnnualSavings(p, T, r, n);
      expect(s).toBeGreaterThan(0);
      expect(yearsToFi(p, s, T, r)).toBeCloseTo(n, 6);
    }
  });

  it('splits the gap evenly at zero return and handles no time left', () => {
    expect(requiredAnnualSavings(1_000_000, 6_000_000, 0, 10)).toBe(500_000);
    expect(requiredAnnualSavings(1_000_000, 6_000_000, 0.05, 0)).toBe(5_000_000);
    expect(requiredAnnualSavings(7_000_000, 6_000_000, 0, 0)).toBe(0);
  });
});

describe('guaranteed income and the bridge fund', () => {
  const pension = { startAge: 65, annual: 240_000 };
  const partTime = { startAge: 50, endAge: 55, annual: 200_000 };

  it('counts only income that lasts to the horizon as permanent', () => {
    expect(permanentIncome([pension, partTime], 95)).toBe(240_000);
    expect(permanentIncome([{ startAge: 60, endAge: 95, annual: 1 }], 95)).toBe(1);
    expect(permanentIncome([{ startAge: 60, endAge: 94, annual: 1 }], 95)).toBe(0);
  });

  it('sums the streams active at an age, start inclusive and end exclusive', () => {
    expect(activeIncome([pension, partTime], 49)).toBe(0);
    expect(activeIncome([pension, partTime], 50)).toBe(200_000);
    expect(activeIncome([pension, partTime], 55)).toBe(0);
    expect(activeIncome([pension, partTime], 65)).toBe(240_000);
  });

  it('needs no bridge when retiring after the pension starts', () => {
    expect(bridgeAdjustment([pension], 65, 95)).toBe(0);
    expect(bridgeAdjustment([pension], 70, 95)).toBe(0);
  });

  it('adds one year of pension for each year before it starts', () => {
    for (const fiAge of [45, 55, 60, 64]) {
      expect(bridgeAdjustment([pension], fiAge, 95)).toBe((65 - fiAge) * 240_000);
    }
  });

  it('builds the full target: (S − G) ÷ SWR plus the bridge', () => {
    // 600k a year, 240k pension from 65, retiring at 55 at 4%: 9M + 10 × 240k.
    expect(fiTarget(600_000, [pension], 0.04, 55, 95)).toBe(9_000_000 + 2_400_000);
    // Part-time income in the gap lowers it.
    expect(fiTarget(600_000, [pension, partTime], 0.04, 50, 95)).toBe(9_000_000 + 15 * 240_000 - 5 * 200_000);
    // Never below zero.
    expect(fiTarget(0, [{ startAge: 40, endAge: 50, annual: 1_000_000 }], 0.04, 40, 95)).toBe(0);
  });
});

describe('projection against the formulas', () => {
  it('compounds a lump sum at the real return when nothing is added or spent', () => {
    for (const r of [0.03, 0.05, -0.02]) {
      const result = runProjection(withReturn(makeInput({ fiSpending: 1e12 }), 'cash', r));
      for (const k of [1, 10, 30]) expect(result.rows[k].liquid).toBeCloseTo(P * (1 + r) ** k, 4);
    }
  });

  it('keeps every year’s books balanced at zero return', () => {
    const result = runProjection(
      makeInput({
        annualIncome: 900_000,
        currentSpending: 500_000,
        events: [{ year: 2031, amount: -250_000, description: 'Car' }],
      }),
    );
    for (let k = 1; k < result.rows.length; k++) {
      const row = result.rows[k];
      const prev = result.rows[k - 1];
      const flow = row.savings - row.withdrawal + row.eventAmount;
      if (prev.liquid + flow > 0) expect(row.liquid).toBeCloseTo(prev.liquid + flow, 4);
    }
  });

  it('sets the target to spending ÷ SWR with no other income', () => {
    for (const swr of [0.03, 0.035, 0.04, 0.05]) {
      const result = runProjection(makeInput({ swr, fiSpending: 600_000 }));
      expect(result.rows[0].fiTarget).toBeCloseTo(600_000 / swr, 6);
    }
  });

  it('reaches FI at zero return exactly when savings cover the gap', () => {
    // 1M today, 500k a year, target 10M: 18 years.
    const result = runProjection(saver(0, { currentSpending: 700_000 }));
    expect(result.fiAge).toBe(58);
    expect(result.yearsToFi).toBeCloseTo(18, 6);
    expect(result.rows[18].liquid).toBe(10_000_000);
  });

  it('agrees with years to FI under mid-year contributions', () => {
    for (const r of [0.02, 0.04, 0.06]) {
      const result = runProjection(saver(r));
      const n = yearsToFi(P, 500_000 * Math.sqrt(1 + r), 10_000_000, r);
      expect(result.fiAge).toBe(40 + Math.ceil(n));
      expect(Math.abs(result.yearsToFi! - n)).toBeLessThan(0.15);
    }
  });

  it('moves the FI age the right way for each lever', () => {
    const fiAge = (input: ProjectionInput) => runProjection(input).fiAge!;
    const base = fiAge(saver(0.04));
    expect(fiAge(saver(0.04, { currentSpending: 500_000 }))).toBeLessThan(base);
    expect(fiAge(saver(0.04, { currentSpending: 900_000 }))).toBeGreaterThan(base);
    expect(fiAge(saver(0.04, { fiSpending: 300_000 }))).toBeLessThan(base);
    expect(fiAge(saver(0.04, { fiSpending: 600_000 }))).toBeGreaterThan(base);
    expect(fiAge(saver(0.04, { swr: 0.05 }))).toBeLessThan(base);
    expect(fiAge(saver(0.04, { swr: 0.03 }))).toBeGreaterThan(base);
    expect(fiAge(saver(0.07))).toBeLessThan(base);
    expect(fiAge(saver(0.01))).toBeGreaterThan(base);
  });

  it('is already FI when today’s money covers the target', () => {
    const result = runProjection(
      makeInput({ liquid: [{ assetClass: 'cash', currency: 'TWD', value: 10_000_000 }] }),
    );
    expect(result.fiAge).toBe(40);
    expect(result.yearsToFi).toBe(0);
  });

  it('withdraws the planned spending each retired year under the fixed rule', () => {
    const result = runProjection(
      withReturn(
        makeInput({ liquid: [{ assetClass: 'cash', currency: 'TWD', value: 12_000_000 }] }),
        'cash',
        0.04,
      ),
    );
    for (const k of [1, 10, 30]) {
      expect(result.rows[k].withdrawal).toBe(400_000);
      expect(result.rows[k].spending).toBe(400_000);
    }
  });

  it('lasts forever at a real return above the SWR and runs out below it', () => {
    const at = (r: number) =>
      runProjection(
        withReturn(
          makeInput({ liquid: [{ assetClass: 'cash', currency: 'TWD', value: 10_000_000 }] }),
          'cash',
          r,
        ),
      );
    const rich = at(0.05);
    expect(rich.success).toBe(true);
    expect(rich.balanceAtHorizon).toBeGreaterThan(10_000_000);
    const poor = at(0);
    expect(poor.success).toBe(false);
    expect(poor.depletionAge).toBe(65);
  });

  it('runs out later with a higher return, and never earlier', () => {
    const depletion = (r: number) =>
      runProjection(
        withReturn(
          makeInput({
            liquid: [{ assetClass: 'cash', currency: 'TWD', value: 10_000_000 }],
            fiSpending: 600_000,
            retireAtAge: 40,
          }),
          'cash',
          r,
        ),
      ).depletionAge ?? Number.POSITIVE_INFINITY;
    const ages = [0, 0.01, 0.02, 0.03].map(depletion);
    for (let i = 1; i < ages.length; i++) expect(ages[i]).toBeGreaterThanOrEqual(ages[i - 1]);
    expect(ages[0]).toBeLessThan(ages[3]);
  });

  it('reports a weighted real return for a mixed allocation', () => {
    const input = withReturn(
      withReturn(
        makeInput({
          inflation: 0.02,
          allocation: makeInput().allocation.map((_, i) => (i === 0 ? 0.5 : i === 2 ? 0.5 : 0)),
        }),
        'cash',
        0.02,
      ),
      makeInput().assets[2].assetClass,
      0.07,
    );
    expect(portfolioRealReturn(input)).toBeCloseTo(0.5 * 0 + 0.5 * (1.07 / 1.02 - 1), 10);
  });

  it('gives Monte Carlo with no volatility the deterministic answer', () => {
    const input = saver(0.04);
    const det = runProjection(input);
    const mc = runMonteCarlo(input, { runs: 10, seed: 3 });
    expect(mc.fiRate).toBe(1);
    expect(mc.fiAgeP50).toBe(det.fiAge);
    expect(mc.p50).toEqual(Array.from(det.investable));
  });

  it('lowers the chance of success when volatility is added at the same median', () => {
    const rich = makeInput({
      liquid: [{ assetClass: 'cash', currency: 'TWD', value: 10_000_000 }],
      fiSpending: 250_000,
      retireAtAge: 40,
    });
    const calm = runMonteCarlo(withReturn(rich, 'cash', 0.03), { runs: 400, seed: 11 });
    const wild = runMonteCarlo(withReturn(rich, 'cash', 0.03, 0.25), { runs: 400, seed: 11 });
    expect(calm.successRate).toBe(1);
    expect(wild.successRate).toBeLessThan(1);
    expect(wild.p10[30]).toBeLessThan(wild.p90[30]);
  });
});

describe('progress, savings rate and withdrawal rules', () => {
  it('measures FI progress as investable ÷ FI number', () => {
    expect(fiProgress(2_500_000, 10_000_000)).toBe(0.25);
    expect(fiProgress(12_000_000, 10_000_000)).toBe(1.2);
    expect(fiProgress(1, 0)).toBe(1);
    expect(fiProgress(0, 0)).toBe(0);
  });

  it('computes the savings rate from income and spending', () => {
    expect(savingsRate(100_000, 60_000)).toBe(0.4);
    expect(savingsRate(100_000, 120_000)).toBe(-0.2);
    expect(savingsRate(0, 10)).toBeNaN();
  });

  const ctx = {
    portfolio: 10_000_000,
    spending: 400_000,
    plannedSpending: 400_000,
    streamIncome: 100_000,
    dividendYield: 0.03,
    swr: 0.04,
  };

  it('takes spending minus guaranteed income under the fixed rule', () => {
    expect(applyWithdrawalRule({ kind: 'fixed_swr' }, ctx)).toEqual({
      spending: 400_000,
      withdrawal: 300_000,
    });
  });

  it('applies the guardrails only outside the band', () => {
    const rule = { kind: 'guardrails' as const, band: 0.2, step: 0.1 };
    // 300k of 10M = 3%, below 4% × 0.8: raise by 10%.
    expect(applyWithdrawalRule(rule, ctx).spending).toBeCloseTo(440_000, 6);
    // 300k of 7.5M = 4%: inside the band, unchanged.
    expect(applyWithdrawalRule(rule, { ...ctx, portfolio: 7_500_000 }).spending).toBe(400_000);
    // 300k of 5M = 6%, above 4% × 1.2: cut by 10%.
    expect(applyWithdrawalRule(rule, { ...ctx, portfolio: 5_000_000 }).spending).toBeCloseTo(360_000, 6);
  });

  it('follows the portfolio under the percentage and dividend rules', () => {
    expect(applyWithdrawalRule({ kind: 'fixed_percentage', rate: 0.05 }, ctx)).toEqual({
      withdrawal: 500_000,
      spending: 600_000,
    });
    expect(applyWithdrawalRule({ kind: 'dividend' }, ctx).withdrawal).toBeCloseTo(300_000, 6);
    expect(applyWithdrawalRule({ kind: 'dividend' }, { ...ctx, portfolio: -5 }).withdrawal).toBe(0);
  });
});

describe('plan status wording', () => {
  it.each([
    [1, 'on_track', 10],
    [0.95, 'on_track', 10],
    [0.85, 'on_track', 9],
    [0.84, 'watch', 8],
    [0.7, 'watch', 7],
    [0.69, 'at_risk', 7],
    [0.3, 'at_risk', 3],
    [0.05, 'at_risk', 0],
    [0, 'at_risk', 0],
  ])('a %d chance is %s with %d dots', (chance, status, dots) => {
    expect(planStatus(chance)).toBe(status);
    expect(chanceDots(chance)).toBe(dots);
  });

  it('never shows 10 or 0 dots between 5% and 95%', () => {
    for (let c = 0.06; c < 0.95; c += 0.01) {
      expect(chanceDots(c)).toBeGreaterThanOrEqual(1);
      expect(chanceDots(c)).toBeLessThanOrEqual(9);
    }
  });

  it('words the chance and the sentence consistently', () => {
    expect(chanceText(0.99)).toBe('Nearly all');
    expect(chanceText(0.01)).toBe('Almost none');
    expect(chanceText(0.72)).toBe('7 in 10');
    expect(lastsSentence(0.99, 95)).toBe('In nearly all simulated futures your money lasts to 95.');
    expect(lastsSentence(0.02, 95, 81.6)).toBe(
      'In almost all simulated futures your money runs out before 95, typically around age 82.',
    );
    expect(lastsSentence(0.72, 90, 84)).toBe(
      'In 7 of 10 simulated futures your money lasts to 90; in the other 3 it runs out, typically around age 84.',
    );
  });
});
