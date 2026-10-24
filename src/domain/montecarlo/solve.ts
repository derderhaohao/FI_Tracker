import type { ProjectionInput } from '../projection';
import { runMonteCarlo, type MonteCarloOptions } from './runner';

/**
 * "What does it take to reach N%?" (PRD R14): solves one lever at a time for the value
 * that brings the chance the money lasts up to a target.
 */

export type SolveLever = 'stopAge' | 'fiSpending' | 'partTime';

export interface SolveResult {
  lever: SolveLever;
  /** Stop age, FI spending per year, or part-time income per year (today's TWD). */
  value?: number;
  chance?: number;
  /** False when even the limit of the search falls short. */
  reachable: boolean;
}

export type ChanceFn = (input: ProjectionInput) => number;

export function monteCarloChance(options: MonteCarloOptions): ChanceFn {
  return (input) => runMonteCarlo(input, options).successRate;
}

/** The input with one lever set. */
export function withLever(
  input: ProjectionInput,
  lever: SolveLever,
  value: number,
  stop: number,
): ProjectionInput {
  // A plan that stops as soon as it reaches its target keeps that rule: it works extra
  // years after reaching it, and spending cuts or part-time income don't move the stop
  // date forward, so only the lever itself changes.
  const adaptive = input.retireAtAge === undefined;
  if (lever === 'stopAge')
    return adaptive
      ? { ...input, workExtraYears: (input.workExtraYears ?? 0) + (value - stop) }
      : { ...input, retireAtAge: value };
  if (lever === 'fiSpending')
    return { ...input, fiSpending: value, targetSpending: input.targetSpending ?? input.fiSpending };
  return { ...input, barista: { annual: value, untilAge: Math.max(60, stop + 5), inTarget: false } };
}

/**
 * Finds the smallest change that reaches `target`, assuming the chance rises
 * monotonically: later stop age, lower FI spending, or more part-time income.
 * `stop` is the current stop age (typical path).
 */
export function solveLever(
  input: ProjectionInput,
  lever: SolveLever,
  target: number,
  stop: number,
  chance: ChanceFn,
): SolveResult {
  const at = (v: number) => chance(withLever(input, lever, v, stop));
  if (lever === 'stopAge') {
    let lo = stop;
    let hi = Math.min(input.horizonAge - 1, Math.max(stop, 75));
    const top = at(hi);
    if (top < target) return { lever, reachable: false, value: hi, chance: top };
    const start = at(lo);
    if (start >= target) return { lever, reachable: true, value: lo, chance: start };
    let best = { value: hi, chance: top };
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const c = at(mid);
      if (c >= target) {
        hi = mid;
        best = { value: mid, chance: c };
      } else lo = mid;
    }
    return { lever, reachable: true, ...best };
  }
  // Continuous levers: bisection, 12 steps (~0.02% of the range).
  const fi = input.fiSpending;
  let good = lever === 'fiSpending' ? fi * 0.4 : fi; // the limit that is safest
  let bad = lever === 'fiSpending' ? fi : 0; // today's value
  const limit = at(good);
  if (limit < target) return { lever, reachable: false, value: good, chance: limit };
  const now = at(bad);
  if (now >= target) return { lever, reachable: true, value: bad, chance: now };
  let best = { value: good, chance: limit };
  for (let i = 0; i < 12; i++) {
    const mid = (good + bad) / 2;
    const c = at(mid);
    if (c >= target) {
      good = mid;
      best = { value: mid, chance: c };
    } else bad = mid;
  }
  const rounded =
    lever === 'fiSpending' ? Math.floor(best.value / 1000) * 1000 : Math.ceil(best.value / 1000) * 1000;
  return { lever, reachable: true, value: rounded, chance: best.chance };
}
