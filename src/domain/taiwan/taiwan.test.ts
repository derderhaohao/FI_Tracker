import { defaultTaiwanSettings } from './defaults';
import { amtFlag, domesticDividendTax, nhiSupplementaryPremium, usWithholding } from './dividends';
import { claimAdjustment, laborInsuranceAnnual, laborInsuranceMonthly } from './laborInsurance';
import { laborPensionContribution, laborPensionPayoutType } from './laborPension';

describe('Taiwan rules', () => {
  it('estimates the 勞保 annuity with the better of the two formulas', () => {
    const t = defaultTaiwanSettings();
    t.laborInsurance.avgMonthlyInsuredSalaryMinor = 45_800_00;
    // 45,800 × 30 × 1.55% = 21,297 beats 45,800 × 30 × 0.775% + 3,000 = 13,648.5
    expect(laborInsuranceMonthly(t.laborInsurance, 30)).toBeCloseTo(21_297);
    // Low salary, few years: formula A wins.
    t.laborInsurance.avgMonthlyInsuredSalaryMinor = 25_000_00;
    expect(laborInsuranceMonthly(t.laborInsurance, 15)).toBeCloseTo(25_000 * 15 * 0.00775 + 3000);
    expect(laborInsuranceMonthly(t.laborInsurance, 10)).toBe(0);
  });

  it('adjusts for early or late claims and a solvency haircut', () => {
    const li = defaultTaiwanSettings().laborInsurance;
    li.avgMonthlyInsuredSalaryMinor = 40_000_00;
    expect(claimAdjustment(li, 60)).toBeCloseTo(0.8);
    expect(claimAdjustment(li, 58)).toBeCloseTo(0.8);
    expect(claimAdjustment(li, 70)).toBeCloseTo(1.2);
    const full = laborInsuranceAnnual(li, 30, 65, 0);
    expect(laborInsuranceAnnual(li, 30, 65, 0.2)).toBeCloseTo(full * 0.8);
    expect(full).toBeCloseTo(40_000 * 30 * 0.0155 * 12);
  });

  it('computes 勞退 contributions with the wage cap and tax saving', () => {
    const t = defaultTaiwanSettings();
    t.laborPension.monthlyInsuredWageMinor = 200_000_00;
    const c = laborPensionContribution(t, 0.06);
    expect(c.employer).toBe(150_000 * 0.06 * 12);
    expect(c.voluntary).toBe(150_000 * 0.06 * 12);
    expect(c.taxSaving).toBeCloseTo(c.voluntary * 0.12);
    expect(laborPensionContribution(t, 0.1).voluntary).toBe(c.voluntary);
    expect(laborPensionPayoutType(t, 14)).toBe('lump_sum');
    expect(laborPensionPayoutType(t, 15)).toBe('monthly');
  });

  it('taxes domestic dividends by the chosen method', () => {
    const t = defaultTaiwanSettings();
    t.marginalTaxRate = 0.2;
    t.dividendTax.mode = 'combined';
    // 0.2 × 2M − min(8.5% × 2M, 80k)
    expect(domesticDividendTax(2_000_000, t)).toBeCloseTo(400_000 - 80_000);
    t.dividendTax.mode = 'separate';
    expect(domesticDividendTax(2_000_000, t)).toBeCloseTo(560_000);
    t.dividendTax.mode = 'best';
    t.marginalTaxRate = 0.05;
    expect(domesticDividendTax(100_000, t)).toBeCloseTo(5_000 - 8_500);
    expect(domesticDividendTax(0, t)).toBe(0);
  });

  it('charges NHI supplementary premium only on large single payments', () => {
    const t = defaultTaiwanSettings();
    expect(nhiSupplementaryPremium(79_000, t)).toBe(0);
    expect(nhiSupplementaryPremium(80_000, t)).toBeCloseTo(80_000 * 0.0211);
    expect(usWithholding(1000, t)).toBe(300);
    expect(amtFlag(1_000_000, t)).toBe(true);
    expect(amtFlag(999_999, t)).toBe(false);
  });
});
