import { describe, expect, it } from 'vitest';
import { ASSET_CLASSES } from './entities';
import { baselineContext, buildProjectionInput, BASELINE_SPEC, type PlanData } from './baseline';
import { medianReturn } from './montecarlo/rng';
import { runMonteCarlo } from './montecarlo/runner';
import { solveLever, withLever, type ChanceFn } from './montecarlo/solve';
import { expectedDraw, runProjection } from './projection';
import {
  classicInput,
  classicWithdrawalCheck,
  referenceChecks,
  zeroVolatilityCheck,
} from './referenceChecks';
import { makeInput, withReturn } from './testFixtures';
import { buildDemoBackup } from '../io/demo';

function demoInput() {
  const raw = buildDemoBackup().data;
  const settings = raw.settings[0];
  const plan: PlanData = { ...raw, settings };
  const set =
    raw.assumptionSets.find((a) => a.id === settings.activeAssumptionSetId) ?? raw.assumptionSets[0];
  return buildProjectionInput(plan, set, BASELINE_SPEC, baselineContext(plan));
}

describe('typical path (PRD R7)', () => {
  it('uses the median return, which equals the mean without volatility', () => {
    expect(medianReturn(0.07, 0)).toBe(0.07);
    expect(medianReturn(0.07, 0.2)).toBeCloseTo(1.07 / Math.sqrt(1 + 0.04 / 1.07 ** 2) - 1, 12);
    expect(medianReturn(0.07, 0.2)).toBeLessThan(0.07 - 0.015);
    const input = withReturn(makeInput(), 'tw_equity', 0.07, 0.2);
    expect(expectedDraw(input).nominal[ASSET_CLASSES.indexOf('tw_equity')]).toBeCloseTo(
      medianReturn(0.07, 0.2),
      12,
    );
  });

  it('sits between the simulated P40 and P60 at the horizon for the demo plan', () => {
    const input = demoInput();
    const typical = runProjection(input).balanceAtHorizon;
    const mc = runMonteCarlo(input, { runs: 1000, seed: 42 });
    const k = mc.ages.length - 1;
    expect(typical).toBeGreaterThanOrEqual(mc.p40[k]);
    expect(typical).toBeLessThanOrEqual(mc.p60[k]);
  });

  it('reports the median age money runs out in failed runs', () => {
    const input = makeInput({
      liquid: [{ assetClass: 'us_equity', currency: 'TWD', value: 1_000_000 }],
      fiSpending: 80_000,
      retireAtAge: 40,
      allocation: ASSET_CLASSES.map((c) => (c === 'us_equity' ? 1 : 0)),
      assets: makeInput().assets.map((a) =>
        a.assetClass === 'us_equity' ? { ...a, expectedReturn: 0.05, volatility: 0.2 } : a,
      ),
    });
    const mc = runMonteCarlo(input, { runs: 300, seed: 7 });
    expect(mc.successRate).toBeLessThan(1);
    expect(mc.depletionAgeP50).toBeGreaterThan(40);
    expect(mc.depletionAgeP50).toBeLessThan(95);
  });
});

describe('new levers', () => {
  const equity = (patch = {}) =>
    makeInput({
      liquid: [{ assetClass: 'us_equity', currency: 'TWD', value: 1_000_000 }],
      allocation: ASSET_CLASSES.map((c) => (c === 'us_equity' ? 1 : 0)),
      assets: makeInput().assets.map((a) =>
        a.assetClass === 'us_equity' ? { ...a, expectedReturn: 0.05 } : a,
      ),
      ...patch,
    });

  it('applies a crash to equities in the first years after stopping', () => {
    const base = runProjection(equity({ retireAtAge: 40, fiSpending: 0 }));
    const crash = runProjection(equity({ retireAtAge: 40, fiSpending: 0, crash: { drop: 0.36, years: 2 } }));
    expect(base.rows[2].investable).toBeCloseTo(1_000_000 * 1.05 ** 2, 0);
    expect(crash.rows[2].investable).toBeCloseTo(640_000, 0);
    expect(crash.rows[3].investable / crash.rows[2].investable).toBeCloseTo(1.05, 6);
  });

  it('keeps working extra years after reaching the target', () => {
    const input = equity({ annualIncome: 600_000, currentSpending: 300_000, fiSpending: 100_000 });
    const plain = runProjection(input);
    const extra = runProjection({ ...input, workExtraYears: 2 });
    expect(extra.retireAge).toBe(plain.retireAge! + 2);
  });

  it('can size the target on other spending, and leave part-time income out of it', () => {
    const input = equity({ annualIncome: 600_000, currentSpending: 300_000, fiSpending: 200_000 });
    const plain = runProjection(input);
    expect(runProjection({ ...input, fiSpending: 150_000, targetSpending: 200_000 }).retireAge).toBe(
      plain.retireAge,
    );
    expect(runProjection({ ...input, fiSpending: 150_000 }).retireAge).toBeLessThan(plain.retireAge!);
    const counted = runProjection({ ...input, barista: { annual: 80_000, untilAge: 70 } });
    const ignored = runProjection({ ...input, barista: { annual: 80_000, untilAge: 70, inTarget: false } });
    expect(counted.retireAge).toBeLessThan(plain.retireAge!);
    expect(ignored.retireAge).toBe(plain.retireAge);
  });
});

describe('reference checks (PRD R10)', () => {
  it('passes both built-in checks', () => {
    expect(zeroVolatilityCheck(demoInput()).pass).toBe(true);
    const classic = classicWithdrawalCheck();
    expect(classic.pass).toBe(true);
    expect(classic.detail).toMatch(/money lasts in 9\d% of \d+ start years/);
    expect(referenceChecks(classicInput())).toHaveLength(2);
  });
});

describe('reach a target chance (PRD R14)', () => {
  // A fake, monotone chance: +5 points per extra year, −1 point per 1% more spending.
  const fake =
    (base: ReturnType<typeof makeInput>): ChanceFn =>
    (input) => {
      const years = (input.workExtraYears ?? 0) + ((input.retireAtAge ?? 50) - (base.retireAtAge ?? 50));
      const spend = (input.fiSpending - base.fiSpending) / base.fiSpending;
      const part = (input.barista?.annual ?? 0) / base.fiSpending;
      return Math.min(1, 0.6 + 0.05 * years - spend + part * 0.5);
    };

  it('finds the stop age, spending and part-time income that reach the target', () => {
    const input = makeInput({ fiSpending: 400_000 });
    const chance = fake(input);
    const stop = solveLever(input, 'stopAge', 0.9, 50, chance);
    expect(stop).toMatchObject({ reachable: true, value: 56 });
    const spend = solveLever(input, 'fiSpending', 0.9, 50, chance);
    expect(spend.reachable).toBe(true);
    expect(spend.value!).toBeLessThanOrEqual(280_000);
    expect(spend.value!).toBeGreaterThan(275_000);
    const part = solveLever(input, 'partTime', 0.9, 50, chance);
    expect(part.value!).toBeGreaterThanOrEqual(240_000);
    expect(part.value!).toBeLessThan(242_000);
  });

  it('reports when a lever alone cannot reach the target', () => {
    const input = makeInput({ fiSpending: 400_000 });
    expect(solveLever(input, 'partTime', 0.99, 50, () => 0.5)).toMatchObject({ reachable: false });
    expect(solveLever(input, 'stopAge', 0.5, 50, () => 0.6)).toMatchObject({ reachable: true, value: 50 });
  });

  it('keeps a stop-at-target plan on its rule', () => {
    const adaptive = makeInput();
    expect(withLever(adaptive, 'stopAge', 53, 50).workExtraYears).toBe(3);
    expect(withLever(adaptive, 'fiSpending', 300_000, 50).targetSpending).toBe(400_000);
    expect(withLever(adaptive, 'partTime', 100_000, 50).barista).toEqual({
      annual: 100_000,
      untilAge: 60,
      inTarget: false,
    });
    expect(withLever(makeInput({ retireAtAge: 50 }), 'stopAge', 53, 50).retireAtAge).toBe(53);
  });
});
