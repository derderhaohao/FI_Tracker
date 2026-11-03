import { nextStep, type NextStepInput } from './nextStep';

const base: NextStepInput = {
  today: '2026-11-03',
  asOfDate: '2026-10-31',
  snapshotDateCount: 3,
  lastBackupAt: '2026-10-31T10:00:00.000Z',
  firstDataDate: '2026-01-01',
  autosaving: false,
};

describe('Home next step (UX doc, D1)', () => {
  it('asks for the monthly update once a month-end has passed without one', () => {
    expect(nextStep({ ...base, asOfDate: '2026-09-30' })).toBe('update');
    expect(nextStep(base)).not.toBe('update');
  });

  it('asks for a backup only after two months of data (A1)', () => {
    const stale = { ...base, lastBackupAt: undefined };
    expect(nextStep(stale)).toBe('backup');
    expect(nextStep({ ...stale, snapshotDateCount: 1 })).not.toBe('backup');
    expect(nextStep({ ...base, snapshotDateCount: 1, backupPrompt: 'setup' })).not.toBe('backup');
    expect(nextStep({ ...base, snapshotDateCount: 2, backupPrompt: 'setup' })).toBe('backup');
    // An active auto-save file counts as a backup.
    expect(nextStep({ ...stale, autosaving: true })).not.toBe('backup');
  });

  it('then asks for the real 勞保 figures, else suggests a what-if', () => {
    expect(nextStep({ ...base, pensionEstimated: true })).toBe('pension');
    expect(nextStep(base)).toBe('what-if');
  });
});
