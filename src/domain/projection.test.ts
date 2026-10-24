import { makeInput, withReturn } from './testFixtures';
import { yearsToFi } from './fiNumber';
import { portfolioRealReturn, runProjection } from './projection';

describe('deterministic projection', () => {
  const P = 1_000_000;
  const s = 500_000;
  const r = 0.05;
  const T = 400_000 / 0.04;
  const base = withReturn(
    makeInput({
      annualIncome: 1_500_000,
      currentSpending: 1_000_000,
      liquid: [{ assetClass: 'cash', currency: 'TWD', value: P }],
    }),
    'cash',
    r,
  );

  it('grows savings at the real return, contributions in the middle of each year', () => {
    const result = runProjection(base);
    for (const k of [1, 5, 10]) {
      const expected = P * (1 + r) ** k + (s * Math.sqrt(1 + r) * ((1 + r) ** k - 1)) / r;
      expect(result.rows[k].liquid).toBeCloseTo(expected, 4);
    }
  });

  it('reaches FI when the closed form says so', () => {
    const result = runProjection(base);
    // Mid-year contributions are the closed form with s × √(1 + r).
    const n = yearsToFi(P, s * Math.sqrt(1 + r), T, r);
    expect(result.fiAge).toBe(40 + Math.ceil(n));
    expect(result.yearsToFi!).toBeGreaterThan(Math.floor(n));
    expect(Math.abs(result.yearsToFi! - n)).toBeLessThan(0.1);
    expect(result.rows[0].fiTarget).toBe(T);
  });

  it('converts nominal returns to real with inflation', () => {
    const nominal = withReturn({ ...base, inflation: 0.02, salaryGrowth: 0.02 }, 'cash', 1.05 * 1.02 - 1);
    const a = runProjection(nominal);
    const b = runProjection(base);
    expect(a.rows[10].liquid).toBeCloseTo(b.rows[10].liquid, 2);
    expect(a.rows[10].inflationIndex).toBeCloseTo(1.02 ** 10, 10);
  });

  it('retires at FI and depletes after S ÷ portfolio years at zero return', () => {
    const result = runProjection(
      makeInput({ liquid: [{ assetClass: 'cash', currency: 'TWD', value: 10_000_000 }] }),
    );
    expect(result.fiAge).toBe(40);
    expect(result.retireAge).toBe(40);
    expect(result.rows[25].liquid).toBeCloseTo(0, 6);
    expect(result.depletionAge).toBe(65);
    expect(result.success).toBe(false);
  });

  it('never reaches FI with zero savings and zero return, and does not deplete', () => {
    const result = runProjection(
      makeInput({ liquid: [{ assetClass: 'cash', currency: 'TWD', value: 100 }] }),
    );
    expect(result.fiAge).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.balanceAtHorizon).toBe(100);
  });

  it('shrinks with negative returns', () => {
    const result = runProjection(withReturn(makeInput({ fiSpending: 1e12 }), 'cash', -0.1));
    expect(result.rows[1].liquid).toBeCloseTo(900_000);
    expect(result.rows[2].liquid).toBeCloseTo(810_000);
  });

  it('unlocks a pension at its access age and counts it toward FI only then', () => {
    const result = runProjection(
      makeInput({
        liquid: [],
        fiSpending: 40_000,
        locked: [{ assetClass: 'other', currency: 'TWD', value: 2_000_000, unlockAge: 60, pension: true }],
      }),
    );
    expect(result.rows[19].liquid).toBe(0);
    expect(result.rows[19].locked).toBe(2_000_000);
    expect(result.rows[20].liquid).toBe(2_000_000);
    expect(result.fiAge).toBe(60);
  });

  it('adds 勞退 contributions to the locked pension while working', () => {
    const result = runProjection(
      makeInput({
        liquid: [],
        fiSpending: 1e12,
        annualIncome: 500_000,
        currentSpending: 400_000,
        pension: { employer: 100_000, voluntary: 50_000, liquidDelta: -44_000, accessAge: 60 },
      }),
    );
    expect(result.rows[1].locked).toBe(150_000);
    expect(result.rows[1].savings).toBe(56_000);
    expect(result.rows[1].liquid).toBe(56_000);
  });

  it('applies one-off events in their year', () => {
    const result = runProjection(
      makeInput({ fiSpending: 1e12, events: [{ year: 2028, amount: -300_000, description: 'Car' }] }),
    );
    expect(result.rows[2].liquid).toBe(1_000_000);
    expect(result.rows[3].liquid).toBe(700_000);
    expect(result.rows[3].eventAmount).toBe(-300_000);
  });

  it('lowers withdrawals by guaranteed income once it starts', () => {
    const result = runProjection(
      makeInput({
        liquid: [{ assetClass: 'cash', currency: 'TWD', value: 30_000_000 }],
        fiSpending: 1_000_000,
        streams: [{ name: 'Rent', startAge: 50, annual: 400_000, inflationLinked: true }],
      }),
    );
    expect(result.rows[1].withdrawal).toBe(1_000_000);
    expect(result.rows[11].withdrawal).toBe(600_000);
    expect(result.rows[11].streamIncome).toBe(400_000);
  });

  it('retires at a target age even before FI', () => {
    const result = runProjection(
      makeInput({ retireAtAge: 45, annualIncome: 1_000_000, currentSpending: 500_000 }),
    );
    expect(result.retireAge).toBe(45);
    expect(result.rows[5].liquid).toBe(3_500_000);
    expect(result.rows[6].liquid).toBe(3_100_000);
  });

  it('applies US dividend withholding and FX drift to USD assets', () => {
    const input = withReturn(
      makeInput({
        fiSpending: 1e12,
        liquid: [{ assetClass: 'us_equity', currency: 'USD', value: 1_000_000 }],
        fxDrift: -0.01,
      }),
      'us_equity',
      0.07,
    );
    input.assets = input.assets.map((a) =>
      a.assetClass === 'us_equity' ? { ...a, dividendYield: 0.02, fee: 0.001 } : a,
    );
    const result = runProjection(input);
    expect(result.rows[1].liquid).toBeCloseTo(1_000_000 * (1 + 0.07 - 0.001 - 0.02 * 0.3) * 0.99, 4);
    // Dividends are counted on each half-year's balance.
    expect(result.rows[1].overseasIncome).toBeGreaterThan(20_000);
    expect(result.rows[1].overseasIncome).toBeLessThan(20_500);
    expect(result.rows[1].amt).toBe(false);
  });

  it('records total net worth with non-investable assets and amortising liabilities', () => {
    const result = runProjection(
      makeInput({
        fiSpending: 1e12,
        nonInvestable: [{ assetClass: 'property', currency: 'TWD', value: 5_000_000 }],
        liabilities: [{ balance: 1_000_000, rate: 0, annualPayment: 400_000 }],
      }),
    );
    expect(result.rows[0].totalNetWorth).toBe(1_000_000 + 5_000_000 - 1_000_000);
    expect(result.rows[1].liabilities).toBe(600_000);
    expect(result.rows[3].liabilities).toBe(0);
  });

  describe('loan payments from Accounts', () => {
    const working = makeInput({
      annualIncome: 1_200_000,
      currentSpending: 600_000,
      fiSpending: 1e12,
      liquid: [],
      liabilities: [{ balance: 480_000, rate: 0, annualPayment: 240_000, months: 24 }],
    });

    it('come out of savings while the loan runs, then stop', () => {
      const r = runProjection(working);
      expect(r.rows[1].loanPayments).toBeCloseTo(240_000);
      expect(r.rows[2].loanPayments).toBeCloseTo(240_000);
      expect(r.rows[3].loanPayments).toBe(0);
      expect(r.rows[1].savings).toBeCloseTo(360_000);
      expect(r.rows[3].savings).toBeCloseTo(600_000);
      expect(r.rows[2].liabilities).toBe(0);
    });

    it('are fixed in nominal terms, so they shrink with inflation', () => {
      const r = runProjection({ ...working, inflation: 0.02, salaryGrowth: 0.02 });
      expect(r.rows[2].loanPayments).toBeCloseTo(240_000 / 1.02);
    });

    it('keep being paid from investments after FI, and raise the money needed by what is left', () => {
      const rich = makeInput({ liquid: [{ assetClass: 'cash', currency: 'TWD', value: 20_000_000 }] });
      const loan = {
        ...rich,
        liabilities: [{ balance: 360_000, rate: 0, annualPayment: 120_000, months: 36 }],
      };
      const a = runProjection(rich);
      const b = runProjection(loan);
      expect(b.retireAge).toBe(40);
      expect(b.rows[0].fiTarget - a.rows[0].fiTarget).toBeCloseTo(360_000);
      for (const k of [1, 2, 3]) expect(b.rows[k].withdrawal - a.rows[k].withdrawal).toBeCloseTo(120_000);
      expect(b.rows[4].withdrawal).toBeCloseTo(a.rows[4].withdrawal);
    });

    it('count toward a savings-rate lever', () => {
      const r = runProjection({ ...working, savingsRate: 0.3 });
      expect(r.rows[1].spending + r.rows[1].loanPayments).toBeCloseTo(1_200_000 * 0.7);
    });
  });

  it('supports a savings-rate lever and income changes', () => {
    const result = runProjection(
      makeInput({
        liquid: [],
        fiSpending: 1e12,
        annualIncome: 1_000_000,
        savingsRate: 0.4,
        incomeChanges: [{ fromAge: 41, toAge: 42, annualIncome: 0 }],
      }),
    );
    expect(result.rows[1].savings).toBe(400_000);
    expect(result.rows[2].savings).toBe(-600_000);
    expect(result.rows[3].savings).toBe(400_000);
  });

  it('computes the expected real return of the allocation, net of fees', () => {
    const input = withReturn({ ...makeInput(), inflation: 0.02 }, 'cash', 0.03);
    input.assets = input.assets.map((a) => (a.assetClass === 'cash' ? { ...a, fee: 0.01 } : a));
    expect(portfolioRealReturn(input)).toBeCloseTo(1.02 / 1.02 - 1, 12);
  });
});
