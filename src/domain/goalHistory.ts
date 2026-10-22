import type { Draft, GoalSnapshot } from './entities';

export type GoalState = Omit<Draft<GoalSnapshot>, 'id' | 'date'>;

const SAME_AMOUNT_MINOR = 100;

/** True when the goal differs from the last recorded one (amounts within NT$1 count as equal). */
export function goalChanged(prev: GoalState | undefined, next: GoalState): boolean {
  if (!prev) return true;
  return (
    prev.fiTier !== next.fiTier ||
    prev.targetFiAge !== next.targetFiAge ||
    Math.abs(prev.swr - next.swr) > 1e-9 ||
    Math.abs(prev.fiSpendingMinor - next.fiSpendingMinor) >= SAME_AMOUNT_MINOR ||
    Math.abs(prev.guaranteedIncomeMinor - next.guaranteedIncomeMinor) >= SAME_AMOUNT_MINOR
  );
}

export type GoalHistoryAction = { kind: 'none' } | { kind: 'add' } | { kind: 'replace'; id: string };

/**
 * What to do with today's goal: nothing if unchanged, otherwise add a record, or
 * replace today's record so a day of editing leaves one entry.
 */
export function goalHistoryAction(
  history: readonly GoalSnapshot[],
  next: GoalState,
  today: string,
): GoalHistoryAction {
  const latest = [...history].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (!goalChanged(latest, next)) return { kind: 'none' };
  if (latest && latest.date === today) return { kind: 'replace', id: latest.id };
  return { kind: 'add' };
}
