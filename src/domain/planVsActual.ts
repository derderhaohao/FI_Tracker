import type { LockedPlanPoint } from './entities';
import type { MonthTotals } from './cashflow';
import { daysBetween, yearOf } from './dates';
import type { NetWorth } from './networth';
import type { ProjectionResult } from './projection';

/**
 * Freezes a projection as the plan of record (FBK-3). Point k holds investable net
 * worth at the start of projection year k and the savings and spending planned during it.
 */
export function lockProjection(result: ProjectionResult): LockedPlanPoint[] {
  return result.rows.map((r, k) => ({
    year: r.year,
    age: r.age,
    investable: r.investable,
    savings: result.rows[k + 1]?.savings ?? 0,
    spending: result.rows[k + 1]?.spending ?? 0,
  }));
}

/** Planned investable net worth on `date`, interpolated between yearly points from `startDate`. */
export function plannedInvestableAt(
  points: readonly LockedPlanPoint[],
  startDate: string,
  date: string,
): number | undefined {
  if (points.length === 0) return undefined;
  const t = daysBetween(startDate, date) / 365.25;
  if (t < 0) return undefined;
  const k = Math.floor(t);
  if (k >= points.length - 1) return points.at(-1)?.investable;
  const frac = t - k;
  return points[k].investable + (points[k + 1].investable - points[k].investable) * frac;
}

export interface NetWorthVsPlan {
  date: string;
  planned?: number;
  actual: number;
}

/** Actual investable (liquid + locked) against the plan at each snapshot since the plan start (FBK-2). */
export function netWorthVsPlan(
  points: readonly LockedPlanPoint[],
  startDate: string,
  series: readonly NetWorth[],
): NetWorthVsPlan[] {
  return series
    .filter((nw) => nw.date >= startDate)
    .map((nw) => ({
      date: nw.date,
      planned: plannedInvestableAt(points, startDate, nw.date),
      actual: nw.investable + nw.locked,
    }));
}

export interface FlowsVsPlan {
  year: number;
  plannedSavings: number;
  actualSavings: number;
  plannedSpending: number;
  actualSpending: number;
  /** Months of actual data in the year; plans are pro-rated to it. */
  months: number;
}

/** Savings and spending per calendar year against the plan, pro-rated to months with data. */
export function flowsVsPlan(
  points: readonly LockedPlanPoint[],
  totals: readonly MonthTotals[],
): FlowsVsPlan[] {
  const byYear = new Map<number, { savings: number; spending: number; months: number }>();
  for (const t of totals) {
    const y = yearOf(t.month);
    const agg = byYear.get(y) ?? { savings: 0, spending: 0, months: 0 };
    agg.savings += t.savings;
    agg.spending += t.expense;
    agg.months += 1;
    byYear.set(y, agg);
  }
  const out: FlowsVsPlan[] = [];
  for (const p of points) {
    const actual = byYear.get(p.year);
    if (!actual) continue;
    const share = actual.months / 12;
    out.push({
      year: p.year,
      plannedSavings: p.savings * share,
      actualSavings: actual.savings,
      plannedSpending: p.spending * share,
      actualSpending: actual.spending,
      months: actual.months,
    });
  }
  return out;
}
