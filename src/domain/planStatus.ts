/**
 * One way to state a plan's health everywhere (product review, "one answer"): the status
 * comes from the chance the money lasts in simulated futures, and every page rounds and
 * words that chance the same way.
 */

export type PlanStatus = 'on_track' | 'watch' | 'at_risk';

export const STATUS_LABELS: Record<PlanStatus, string> = {
  on_track: 'On track',
  watch: 'Watch',
  at_risk: 'At risk',
};

/** On track 85%+, Watch 70–84%, At risk under 70%. */
export function planStatus(chance: number): PlanStatus {
  if (chance >= 0.85) return 'on_track';
  if (chance >= 0.7) return 'watch';
  return 'at_risk';
}

/** Filled dots out of ten: 95% or more fills all ten, 5% or less fills none. */
export function chanceDots(chance: number): number {
  if (chance >= 0.95) return 10;
  if (chance <= 0.05) return 0;
  return Math.min(9, Math.max(1, Math.round(chance * 10)));
}

/** "Nearly all", "7 in 10", "Almost none". */
export function chanceText(chance: number): string {
  if (chance >= 0.95) return 'Nearly all';
  if (chance <= 0.05) return 'Almost none';
  return `${chanceDots(chance)} in 10`;
}

/**
 * Sentence about how often the money lasts: "In 7 of 10 simulated futures your money
 * lasts to 95; in the other 3 it runs out, typically around age 82."
 */
export function lastsSentence(
  chance: number,
  horizonAge: number,
  depletionAge?: number,
  futures = 'simulated futures',
): string {
  const dep = depletionAge !== undefined ? `, typically around age ${Math.round(depletionAge)}` : '';
  if (chance >= 0.95) return `In nearly all ${futures} your money lasts to ${horizonAge}.`;
  if (chance <= 0.05) return `In almost all ${futures} your money runs out before ${horizonAge}${dep}.`;
  const n = chanceDots(chance);
  return `In ${n} of 10 ${futures} your money lasts to ${horizonAge}; in the other ${10 - n} it runs out${dep}.`;
}
