import { t } from '@/i18n';

/**
 * One way to state a plan's health everywhere (product review, "one answer"): the status
 * comes from the chance the money lasts in simulated futures, and every page rounds and
 * words that chance the same way.
 */

export type PlanStatus = 'on_track' | 'watch' | 'at_risk';

/**
 * A word, not a verdict (UX doc, A1): anything under 100% "success" sounds scary, so only a
 * chance below 60% is red.
 */
export const STATUS_LABELS: Record<PlanStatus, string> = {
  on_track: t('Likely'),
  watch: t('Fairly likely'),
  at_risk: t('Uncertain'),
};

/** One line behind each word. */
export const STATUS_EXPLAIN: Record<PlanStatus, string> = {
  on_track: t('Likely: the money lasts in at least 8 of 10 simulated futures.'),
  watch: t(
    'Fairly likely: the money lasts in 6 or 7 of 10 simulated futures. In the others, spending a little less after a bad run of markets would keep it going.',
  ),
  at_risk: t(
    'Uncertain: the money lasts in fewer than 6 of 10 simulated futures. A what-if in My plan shows what would make it safer.',
  ),
};

/** Likely 80%+, Fairly likely 60–79%, Uncertain under 60%. */
export function planStatus(chance: number): PlanStatus {
  if (chance >= 0.8) return 'on_track';
  if (chance >= 0.6) return 'watch';
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
  if (chance >= 0.95) return t('Nearly all');
  if (chance <= 0.05) return t('Almost none');
  return t('{chance} in 10', { chance: chanceDots(chance) });
}

/**
 * Sentence about how often the money lasts: "In 7 of 10 simulated futures your money
 * lasts to 95; in the other 3 it runs out, typically around age 82."
 */
export function lastsSentence(
  chance: number,
  horizonAge: number,
  depletionAge?: number,
  futures = t('simulated futures'),
): string {
  const dep =
    depletionAge !== undefined
      ? t(', typically around age {depletionAge}', { depletionAge: Math.round(depletionAge) })
      : '';
  if (chance >= 0.95)
    return t('In nearly all {futures} your money lasts to {horizonAge}.', { futures, horizonAge });
  if (chance <= 0.05)
    return t('In almost all {futures} your money runs out before {horizonAge}{dep}.', {
      futures,
      horizonAge,
      dep,
    });
  const n = chanceDots(chance);
  return t('In {n} of 10 {futures} your money lasts to {horizonAge}; in the other {v} it runs out{dep}.', {
    n,
    futures,
    horizonAge,
    v: 10 - n,
    dep,
  });
}
