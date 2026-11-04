import { baselineContext, buildProjectionInput, type PlanData } from '@/domain/baseline';
import { runProjection } from '@/domain/projection';
import { makeInput } from '@/domain/testFixtures';
import { buildDemoBackup } from '@/io/demo';
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

describe('My plan slider speed (UX doc, P1: the date moves within 0.3 s)', () => {
  it('reruns the demo household’s projection for a slider move well inside 0.3 s', () => {
    const d = buildDemoBackup().data;
    const plan: PlanData = {
      settings: d.settings[0],
      accounts: d.accounts,
      snapshots: d.snapshots,
      fxRates: d.fxRates,
      liabilities: d.liabilities,
      categories: d.categories,
      cashFlows: d.cashFlows,
      incomeStreams: d.incomeStreams,
    };
    const ctx = baselineContext(plan);
    const base = buildProjectionInput(plan, d.assumptionSets[0], undefined, ctx);
    const move = (age: number) => {
      const spec = {
        overrides: leverOverrides({ stopAge: age, monthlySaving: 50_000 }, base),
        events: [],
        withdrawalRule: { kind: 'fixed_swr' as const },
      };
      return runProjection(buildProjectionInput(plan, d.assumptionSets[0], spec, ctx));
    };
    move(50); // warm up
    const start = performance.now();
    for (let age = 45; age < 55; age++) expect(move(age).rows.length).toBeGreaterThan(0);
    // Ten moves, each well under the 300 ms budget.
    expect((performance.now() - start) / 10).toBeLessThan(100);
  });
});
