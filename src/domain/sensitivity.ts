import type { AssumptionSet } from './entities';
import {
  baselineContext,
  buildProjectionInput,
  type PlanData,
  type ScenarioSpec,
  type BaselineContext,
} from './baseline';
import { runProjection } from './projection';

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
  const base = run('Base', spec);
  const shiftReturn = o.returnShift ?? 0;
  const mult = o.spendingMultiplier ?? 1;
  const rows = [
    run('Return +1%', with_({ returnShift: shiftReturn + 0.01 })),
    run('Return −1%', with_({ returnShift: shiftReturn - 0.01 })),
    run('Spending −10%', with_({ spendingMultiplier: mult * 0.9 })),
    run('Spending +10%', with_({ spendingMultiplier: mult * 1.1 })),
  ];
  const baseSr = o.savingsRate ?? ctx.t12.savingsRate;
  if (Number.isFinite(baseSr)) {
    rows.push(run('Savings rate +5 pts', with_({ savingsRate: Math.min(1, baseSr + 0.05) })));
    rows.push(run('Savings rate −5 pts', with_({ savingsRate: baseSr - 0.05 })));
  }
  for (const r of rows) {
    if (r.yearsToFi !== undefined && base.yearsToFi !== undefined) r.shift = r.yearsToFi - base.yearsToFi;
  }
  return { base, rows };
}
