import { applyWithdrawalRule } from './index';

const ctx = {
  portfolio: 10_000_000,
  spending: 400_000,
  plannedSpending: 400_000,
  streamIncome: 0,
  dividendYield: 0.03,
  swr: 0.04,
};

describe('withdrawal rules', () => {
  it('fixed real SWR spends the plan every year', () => {
    expect(applyWithdrawalRule({ kind: 'fixed_swr' }, { ...ctx, streamIncome: 100_000 })).toEqual({
      spending: 400_000,
      withdrawal: 300_000,
    });
  });

  it('guardrails cut spending when the rate rises 20% above the SWR, and raise it below', () => {
    const rule = { kind: 'guardrails' as const, band: 0.2, step: 0.1 };
    expect(applyWithdrawalRule(rule, ctx).spending).toBe(400_000);
    expect(applyWithdrawalRule(rule, { ...ctx, portfolio: 8_000_000 }).spending).toBeCloseTo(360_000);
    expect(applyWithdrawalRule(rule, { ...ctx, portfolio: 13_000_000 }).spending).toBeCloseTo(440_000);
  });

  it('fixed percentage and dividend rules follow the portfolio', () => {
    expect(applyWithdrawalRule({ kind: 'fixed_percentage', rate: 0.05 }, ctx).withdrawal).toBe(500_000);
    const d = applyWithdrawalRule({ kind: 'dividend' }, { ...ctx, streamIncome: 50_000 });
    expect(d.withdrawal).toBeCloseTo(300_000);
    expect(d.spending).toBeCloseTo(350_000);
  });
});

describe('default withdrawal rules', () => {
  it('fills the PRD defaults', async () => {
    const { defaultWithdrawalRule } = await import('./index');
    expect(defaultWithdrawalRule('guardrails')).toEqual({ kind: 'guardrails', band: 0.2, step: 0.1 });
    expect(defaultWithdrawalRule('fixed_percentage')).toEqual({ kind: 'fixed_percentage', rate: 0.04 });
    expect(defaultWithdrawalRule('dividend')).toEqual({ kind: 'dividend' });
    expect(defaultWithdrawalRule('fixed_swr')).toEqual({ kind: 'fixed_swr' });
  });
});
