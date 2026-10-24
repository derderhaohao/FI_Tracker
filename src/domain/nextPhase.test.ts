import { describe, expect, it } from 'vitest';
import { buildDemoBackup } from '../io/demo';
import { dataAsOf, fiDateMove, monthIndexLabel } from './fiDateMove';
import { defaultUpdateDate, durationText, planUpdate } from '../features/update/updateModel';
import { monthlyReminderIcs, nextReminderDate } from '../lib/ics';

const raw = buildDemoBackup().data;
const data = { ...raw, settings: raw.settings[0] };

describe('why did my FI date move', () => {
  const move = fiDateMove(data, raw.assumptionSets[0], raw.goalHistory)!;

  it('splits the move between the last two snapshots, and the parts add up', () => {
    expect(move.fromDate).toBe('2026-08-31');
    expect(move.toDate).toBe('2026-09-30');
    const sum = move.parts!.reduce((s, p) => s + p.months, 0);
    expect(sum).toBeCloseTo(move.totalMonths!, 9);
    expect(move.parts!.map((p) => p.key)).toEqual(['time', 'saving', 'market', 'fx', 'cashflow', 'goal']);
    expect(move.parts![0].months).toBeCloseTo(1, 6);
    expect(move.parts![1].months).toBeLessThan(0);
    expect(monthIndexLabel(move.toFi!)).toMatch(/^[A-Z][a-z]{2} \d{4}$/);
  });

  it('needs two snapshots', () => {
    const one = dataAsOf(data, '2025-01-31');
    expect(fiDateMove(one, raw.assumptionSets[0])).toBeUndefined();
  });
});

describe('monthly update', () => {
  it('defaults to last month-end and groups accounts that do not move', () => {
    expect(defaultUpdateDate('2026-10-24')).toBe('2026-09-30');
    expect(defaultUpdateDate('2026-01-05')).toBe('2025-12-31');
    const plan = planUpdate(data.accounts, data.snapshots, data.fxRates, '2026-10-31');
    const all = [...plan.changing, ...plan.steady];
    expect(all.length).toBe(data.accounts.filter((a) => !a.archived).length);
    expect(all.every((i) => i.lastDate === '2026-09-30')).toBe(true);
    expect(plan.currencies.map((c) => c.currency)).toEqual(['USD']);
    expect(plan.currencies[0].last).toBeGreaterThan(25);
    expect(durationText(100_000)).toBe('1 min 40 s');
    expect(durationText(400)).toBe('1 s');
  });
});

describe('calendar reminder', () => {
  it('repeats monthly and starts on the next matching day', () => {
    expect(nextReminderDate('2026-10-24', 1)).toBe('2026-11-01');
    expect(nextReminderDate('2026-10-24', 28)).toBe('2026-10-28');
    expect(nextReminderDate('2026-12-24', 1)).toBe('2027-01-01');
    const ics = monthlyReminderIcs({
      firstDate: '2026-11-01',
      dayOfMonth: 1,
      url: 'https://example.test/FI_Tracker/#/update',
      stamp: '20261024T000000Z',
      uid: 'x@fi-tracker',
    });
    expect(ics).toContain('DTSTART;VALUE=DATE:20261101\r\n');
    expect(ics).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=1\r\n');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
