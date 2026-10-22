import { stamp } from './testFixtures';
import { goalChanged, goalHistoryAction, type GoalState } from './goalHistory';

const state: GoalState = {
  fiTier: 'full',
  fiSpendingMinor: 800_000_00,
  guaranteedIncomeMinor: 0,
  swr: 0.04,
  fiNumberMinor: 20_000_000_00,
  targetFiAge: 50,
};
const record = (date: string, patch: Partial<GoalState> = {}) => ({
  id: date,
  date,
  ...state,
  ...patch,
  ...stamp,
});

describe('goal history', () => {
  it('detects meaningful changes only', () => {
    expect(goalChanged(undefined, state)).toBe(true);
    expect(goalChanged(state, { ...state, fiSpendingMinor: state.fiSpendingMinor + 50 })).toBe(false);
    expect(goalChanged(state, { ...state, fiSpendingMinor: state.fiSpendingMinor + 10_000_00 })).toBe(true);
    expect(goalChanged(state, { ...state, swr: 0.035 })).toBe(true);
    expect(goalChanged(state, { ...state, fiTier: 'lean' })).toBe(true);
    expect(goalChanged(state, { ...state, targetFiAge: undefined })).toBe(true);
  });

  it('adds one record per day and replaces same-day edits', () => {
    const history = [record('2026-01-01'), record('2026-03-01', { swr: 0.035 })];
    expect(goalHistoryAction(history, { ...state, swr: 0.035 }, '2026-04-01')).toEqual({ kind: 'none' });
    expect(goalHistoryAction(history, state, '2026-04-01')).toEqual({ kind: 'add' });
    expect(goalHistoryAction(history, state, '2026-03-01')).toEqual({ kind: 'replace', id: '2026-03-01' });
    expect(goalHistoryAction([], state, '2026-03-01')).toEqual({ kind: 'add' });
  });
});
