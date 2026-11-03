import type { ScenarioLevers } from '@/domain/entities';
import { toMinor } from '@/domain/money';
import type { ProjectionInput } from '@/domain/projection';

/** The three sliders on My plan (UX doc, P1), in TWD major units; undefined = as planned. */
export interface PlanLevers {
  stopAge?: number;
  monthlySaving?: number;
  fiSpending?: number;
}

export interface LeverBase {
  /** Take-home pay after spending and loan payments, per month. */
  monthlySaving: number;
  /** Yearly spending once FI, post-employment costs included. */
  fiSpending: number;
  /** Loan payments per year, paid on their own schedule. */
  loansAnnual: number;
}

/** Where the sliders start: the plan as it is today. */
export function leverBase(input: ProjectionInput): LeverBase {
  const loansAnnual = input.liabilities.reduce(
    (s, l) => s + (l.months === undefined || l.months > 0 ? l.annualPayment : 0),
    0,
  );
  return {
    monthlySaving: (input.annualIncome - input.currentSpending - loansAnnual) / 12,
    fiSpending: input.fiSpending,
    loansAnnual,
  };
}

/**
 * The scenario overrides for the sliders. Saving more means spending less now: spending is
 * what is left of pay after loans and the chosen saving.
 */
export function leverOverrides(levers: PlanLevers, input: ProjectionInput): ScenarioLevers {
  const base = leverBase(input);
  const o: ScenarioLevers = {};
  if (levers.stopAge !== undefined) o.targetFiAge = levers.stopAge;
  if (levers.monthlySaving !== undefined)
    o.currentSpendingMinor = toMinor(
      Math.max(0, input.annualIncome - base.loansAnnual - levers.monthlySaving * 12),
    );
  if (levers.fiSpending !== undefined) o.fiSpendingMinor = toMinor(Math.max(0, levers.fiSpending));
  return o;
}

/** True when no slider has moved from the plan. */
export function leversUnchanged(levers: PlanLevers): boolean {
  return (
    levers.stopAge === undefined && levers.monthlySaving === undefined && levers.fiSpending === undefined
  );
}
