import { makeInput } from '@/domain/testFixtures';
import { toMinor } from '@/domain/money';
import { leverBase, leverOverrides, leversUnchanged } from './planModel';

describe('My plan sliders (UX doc, P1)', () => {
  const input = makeInput({
    annualIncome: 1_200_000,
    currentSpending: 600_000,
    fiSpending: 700_000,
    liabilities: [{ balance: 500_000, rate: 0.02, annualPayment: 120_000, months: 48 }],
  });

  it('starts from the plan: saving after loans, FI spending', () => {
    expect(leverBase(input)).toEqual({ monthlySaving: 40_000, fiSpending: 700_000, loansAnnual: 120_000 });
    // A paid-off loan no longer counts.
    expect(leverBase({ ...input, liabilities: [{ ...input.liabilities[0], months: 0 }] }).monthlySaving).toBe(
      50_000,
    );
  });

  it('turns slider values into scenario overrides', () => {
    expect(leversUnchanged({})).toBe(true);
    expect(leverOverrides({}, input)).toEqual({});
    // Saving 50,000 a month leaves 1,200,000 − 120,000 − 600,000 = 480,000 to spend.
    expect(leverOverrides({ stopAge: 50, monthlySaving: 50_000, fiSpending: 650_000 }, input)).toEqual({
      targetFiAge: 50,
      currentSpendingMinor: toMinor(480_000),
      fiSpendingMinor: toMinor(650_000),
    });
    expect(leverOverrides({ monthlySaving: 1_000_000 }, input).currentSpendingMinor).toBe(0);
  });
});
