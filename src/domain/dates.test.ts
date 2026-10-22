import { addMonths, ageAt, daysBetween, lastDayOfMonth, monthRange } from './dates';

describe('dates', () => {
  it('does month arithmetic across years', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthRange('2026-11', '2027-01')).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29');
    expect(daysBetween('2026-01-01', '2026-03-01')).toBe(59);
    expect(ageAt(1990, '2026-10-22')).toBe(36);
  });
});
