import { stamp } from './testFixtures';
import {
  bridgeAdjustment,
  coastFi,
  fiNumber,
  fiSpendingByTier,
  fiTarget,
  realReturn,
  requiredAnnualSavings,
  yearsToFi,
} from './fiNumber';
import type { Category } from './entities';

describe('FI number', () => {
  it('divides spending net of guaranteed income by the SWR', () => {
    expect(fiNumber(1_000_000, 0, 0.04)).toBe(25_000_000);
    expect(fiNumber(1_000_000, 200_000, 0.04)).toBe(20_000_000);
    expect(fiNumber(100, 200, 0.04)).toBe(0);
  });

  it('builds Lean / Full / Fat tiers from categories plus post-employment costs', () => {
    const cats: Category[] = [
      { id: 'a', name: 'Food', kind: 'expense', essential: true, fiAnnualMinor: 300_000_00, ...stamp },
      { id: 'b', name: 'Travel', kind: 'expense', essential: false, fiAnnualMinor: 200_000_00, ...stamp },
      { id: 'c', name: 'Salary', kind: 'income', essential: false, fiAnnualMinor: 999_00, ...stamp },
    ];
    const tiers = fiSpendingByTier(cats, {
      fiTier: 'full',
      fatMultiplier: 1.5,
      nhiMonthlyMinor: 1_000_00,
      privateInsuranceAnnualMinor: 30_000_00,
      healthcareReserveAnnualMinor: 0,
    });
    expect(tiers.postEmployment).toBe(42_000);
    expect(tiers.lean).toBe(342_000);
    expect(tiers.full).toBe(542_000);
    expect(tiers.fat).toBe(792_000);
  });

  it('adds a bridge fund for guaranteed income that starts after FI', () => {
    const streams = [{ startAge: 65, annual: 200_000 }];
    expect(bridgeAdjustment(streams, 55, 95)).toBe(10 * 200_000);
    expect(fiTarget(1_000_000, streams, 0.04, 55, 95)).toBe(20_000_000 + 2_000_000);
    // Part-time income for five years lowers the need.
    expect(bridgeAdjustment([{ startAge: 50, endAge: 55, annual: 300_000 }], 50, 95)).toBe(-1_500_000);
  });

  it('matches the closed-form helpers', () => {
    expect(realReturn(0.071, 0.02)).toBeCloseTo(0.05, 10);
    // P = 0, s = 1, r = 0 → T years.
    expect(yearsToFi(0, 1, 10, 0)).toBe(10);
    // Grow P with s for n years and check that n comes back.
    const r = 0.05;
    const P = 1_000_000;
    const s = 500_000;
    const n = 12;
    const T = P * (1 + r) ** n + (s * ((1 + r) ** n - 1)) / r;
    expect(yearsToFi(P, s, T, r)).toBeCloseTo(n, 10);
    expect(requiredAnnualSavings(P, T, r, n)).toBeCloseTo(s, 6);
    expect(coastFi(T, r, n) * (1 + r) ** n).toBeCloseTo(T, 6);
    expect(yearsToFi(T, 0, T, r)).toBe(0);
    expect(yearsToFi(0, 0, T, r)).toBe(Number.POSITIVE_INFINITY);
    expect(requiredAnnualSavings(T, T, r, 5)).toBe(0);
  });
});
