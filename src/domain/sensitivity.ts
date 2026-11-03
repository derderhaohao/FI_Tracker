import type { AssumptionSet } from './entities';
import {
  baselineContext,
  buildProjectionInput,
  type PlanData,
  type ScenarioSpec,
  type BaselineContext,
} from './baseline';
import { fromMinor, toMinor } from './money';
import { runProjection } from './projection';
import { t } from '@/i18n';

export interface SensitivityRow {
  label: string;
  /** FI age under the change; undefined when FI is never reached. */
  fiAge?: number;
  yearsToFi?: number;
  /** Change in years to FI against the base (positive = later). */
  shift?: number;
}

/** FI date shift for ±1% return, ±10% spending and ±5 points savings rate (TRJ-6). */
export function sensitivity(
  data: PlanData,
  assumptions: AssumptionSet,
  spec: ScenarioSpec,
  ctx: BaselineContext = baselineContext(data),
): { base: SensitivityRow; rows: SensitivityRow[] } {
  const run = (label: string, s: ScenarioSpec): SensitivityRow => {
    const r = runProjection(buildProjectionInput(data, assumptions, s, ctx));
    return { label, fiAge: r.fiAge, yearsToFi: r.yearsToFi };
  };
  const o = spec.overrides;
  const with_ = (patch: Partial<ScenarioSpec['overrides']>): ScenarioSpec => ({
    ...spec,
    overrides: { ...o, ...patch },
  });
  const base = run(t('Base'), spec);
  const shiftReturn = o.returnShift ?? 0;
  const mult = o.spendingMultiplier ?? 1;
  const rows = [
    run(t('Return +1%'), with_({ returnShift: shiftReturn + 0.01 })),
    run(t('Return −1%'), with_({ returnShift: shiftReturn - 0.01 })),
    run(t('Spending −10%'), with_({ spendingMultiplier: mult * 0.9 })),
    run(t('Spending +10%'), with_({ spendingMultiplier: mult * 1.1 })),
  ];
  // ±5 points of income saved. With a savings-rate lever the base already runs on that path;
  // otherwise move this year's spending by 5% of income, so both rows share the base's spending
  // basis and saving more can never make FI later.
  if (o.savingsRate !== undefined) {
    rows.push(run(t('Savings rate +5 pts'), with_({ savingsRate: Math.min(1, o.savingsRate + 0.05) })));
    rows.push(run(t('Savings rate −5 pts'), with_({ savingsRate: o.savingsRate - 0.05 })));
  } else {
    const income = o.annualIncomeMinor !== undefined ? fromMinor(o.annualIncomeMinor) : ctx.t12.annualIncome;
    const spending =
      o.currentSpendingMinor !== undefined ? fromMinor(o.currentSpendingMinor) : ctx.annualSpendingExLoans;
    // The spending multiplier scales this spending, so undo it on the step.
    const step = (0.05 * income) / mult;
    if (income > 0 && mult > 0) {
      rows.push(
        run(t('Savings rate +5 pts'), with_({ currentSpendingMinor: toMinor(Math.max(0, spending - step)) })),
      );
      rows.push(run(t('Savings rate −5 pts'), with_({ currentSpendingMinor: toMinor(spending + step) })));
    }
  }
  for (const r of rows) {
    if (r.yearsToFi !== undefined && base.yearsToFi !== undefined) r.shift = r.yearsToFi - base.yearsToFi;
  }
  return { base, rows };
}
