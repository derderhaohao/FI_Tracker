import { buyVsRent, DEFAULT_BUY_VS_RENT, mortgagePayment, type BuyVsRentInput } from './buyVsRent';

const zero: BuyVsRentInput = {
  homePrice: 1_200_000,
  downPaymentRate: 0.25,
  buyingCostRate: 0,
  sellingCostRate: 0,
  mortgageRate: 0,
  mortgageYears: 10,
  holdingCostRate: 0,
  homeAppreciation: 0,
  monthlyRent: 0,
  rentGrowth: 0,
  investmentReturn: 0,
  inflation: 0,
  years: 10,
};

describe('buy vs. rent', () => {
  it('computes the standard mortgage payment', () => {
    expect(mortgagePayment(1_000_000, 0, 10)).toBeCloseTo(1_000_000 / 120);
    // 12M at 2.2% over 30 years ≈ NT$45,564 a month.
    expect(mortgagePayment(12_000_000, 0.022, 30)).toBeCloseTo(45_564, -1);
  });

  it('is a tie when nothing earns, costs or grows', () => {
    const r = buyVsRent(zero);
    for (const row of r.rows) expect(row.buyerNetWorth).toBeCloseTo(row.renterNetWorth, 4);
    expect(r.rows.at(-1)!.mortgageBalance).toBeCloseTo(0, 4);
    expect(r.upfront).toBe(300_000);
    expect(r.breakEvenYear).toBe(1);
  });

  it('favours renting when rent is free and buying when rent is dear', () => {
    expect(buyVsRent({ ...zero, holdingCostRate: 0.01 }).breakEvenYear).toBeUndefined();
    const dear = buyVsRent({ ...zero, monthlyRent: 20_000, investmentReturn: 0.05 });
    expect(dear.breakEvenYear).toBe(1);
    expect(dear.finalDifference).toBeGreaterThan(0);
  });

  it('reports in today’s TWD', () => {
    const r = buyVsRent({ ...zero, inflation: 0.02, investmentReturn: 0.02, homeAppreciation: 0.02 });
    expect(r.rows[10].renterNetWorth).toBeGreaterThan(299_000);
    expect(r.rows[10].renterNetWorth).toBeLessThan(1_300_000);
  });

  it('gives a sensible answer for the Taiwan defaults', () => {
    const r = buyVsRent(DEFAULT_BUY_VS_RENT);
    expect(r.rows).toHaveLength(31);
    expect(r.upfront).toBe(3_300_000);
    expect(Number.isFinite(r.finalDifference)).toBe(true);
  });
});
