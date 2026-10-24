import { describe, expect, it } from 'vitest';
import { backupNudge } from './backupNudge';
import { addDays } from './dates';
import { chanceDots, chanceText, lastsSentence, planStatus } from './planStatus';
import { budgetVsActual } from '../lib/format';

describe('plan status and rounding (review issues 1 and 4)', () => {
  it('rounds the same everywhere: 95%+ is "nearly all"', () => {
    expect([0.99, 0.95, 0.949, 0.68, 0.06, 0.05, 0].map(chanceDots)).toEqual([10, 10, 9, 7, 1, 0, 0]);
    expect(chanceText(0.99)).toBe('Nearly all');
    expect(chanceText(0.68)).toBe('7 in 10');
    expect(chanceText(0.03)).toBe('Almost none');
    expect(lastsSentence(0.99, 95)).toBe('In nearly all simulated futures your money lasts to 95.');
    expect(lastsSentence(0.68, 95, 81.6)).toBe(
      'In 7 of 10 simulated futures your money lasts to 95; in the other 3 it runs out, typically around age 82.',
    );
  });

  it('uses On track / Watch / At risk', () => {
    expect([0.9, 0.85, 0.8, 0.7, 0.69].map(planStatus)).toEqual([
      'on_track',
      'on_track',
      'watch',
      'watch',
      'at_risk',
    ]);
  });
});

describe('FI budget vs actual (review issue 7)', () => {
  it('says more or less instead of a bare sign', () => {
    expect(budgetVsActual(48_000_00, 10_000)).toBe('380% more');
    expect(budgetVsActual(0, 10_000)).toBe('100% less');
    expect(budgetVsActual(10_000_00, 10_000)).toBe('same');
    expect(budgetVsActual(undefined, 10_000)).toBe('');
  });
});

describe('backup nudges (review issue 11)', () => {
  it('prompts after setup and reviews, and after 30 days without a backup', () => {
    expect(backupNudge('setup', undefined, '2026-10-01', '2026-10-02')).toBe('setup');
    expect(backupNudge('review', '2026-10-01', '2026-01-01', '2026-10-02')).toBe('review');
    expect(backupNudge(undefined, '2026-09-01', '2026-01-01', '2026-10-02')).toBe('stale');
    expect(backupNudge(undefined, '2026-09-10', '2026-01-01', '2026-10-02')).toBeUndefined();
    expect(backupNudge(undefined, undefined, '2026-09-20', '2026-10-02')).toBeUndefined();
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
  });
});
