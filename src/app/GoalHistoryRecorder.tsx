import { useEffect } from 'react';
import { today } from '@/domain/dates';
import { goalHistoryAction, type GoalState } from '@/domain/goalHistory';
import { toMinor } from '@/domain/money';
import { db } from '@/db/db';
import { newId, patch, save } from '@/db/repo';
import { useAppData } from './data';

/**
 * Records the goal whenever it changes (DST-7), so shifts in the target stay visible.
 * Nothing is recorded until an FI budget exists, so trailing spending does not add noise.
 */
export function GoalHistoryRecorder() {
  const { settings, ctx, baselineInput, fiNumberNow, guaranteedIncome, goalHistory } = useAppData();
  const hasBudget = !ctx.fiSpendingFromT12;
  const next: GoalState = {
    fiTier: settings.destination.fiTier,
    fiSpendingMinor: toMinor(baselineInput.fiSpending),
    guaranteedIncomeMinor: toMinor(guaranteedIncome),
    swr: baselineInput.swr,
    fiNumberMinor: toMinor(fiNumberNow),
    targetFiAge: settings.destination.targetFiAge,
  };
  const key = JSON.stringify(next);

  useEffect(() => {
    if (!hasBudget) return;
    const state = JSON.parse(key) as GoalState;
    const action = goalHistoryAction(goalHistory, state, today());
    // A short delay lets a burst of edits settle into one write.
    const timer = setTimeout(() => {
      if (action.kind === 'add') void save(db.goalHistory, { id: newId(), date: today(), ...state });
      else if (action.kind === 'replace') void patch(db.goalHistory, action.id, state);
    }, 1500);
    return () => clearTimeout(timer);
  }, [key, hasBudget, goalHistory]);

  return null;
}
