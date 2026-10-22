import { stamp } from './testFixtures';
import { exactRate, rateFor, toTwd } from './fx';

const rates = [
  { id: '1', date: '2026-01-31', currency: 'USD', twdPerUnit: 32, ...stamp },
  { id: '2', date: '2026-02-28', currency: 'USD', twdPerUnit: 31, ...stamp },
];

describe('fx', () => {
  it('uses the latest rate on or before the date', () => {
    expect(rateFor(rates, 'USD', '2026-02-15')).toBe(32);
    expect(rateFor(rates, 'USD', '2026-03-10')).toBe(31);
    expect(rateFor(rates, 'TWD', '2026-03-10')).toBe(1);
  });

  it('falls back to the earliest later rate, and flags a missing rate', () => {
    expect(rateFor(rates, 'USD', '2025-12-01')).toBe(32);
    expect(rateFor(rates, 'JPY', '2026-01-31')).toBeUndefined();
    expect(toTwd(10, 'JPY', '2026-01-31', rates)).toEqual({ twd: 0, missingRate: true });
    expect(toTwd(10, 'USD', '2026-01-31', rates)).toEqual({ twd: 320, missingRate: false });
    expect(exactRate(rates, 'USD', '2026-02-15')).toBeUndefined();
  });
});
