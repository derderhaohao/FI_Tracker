import {
  convertAmount,
  decodeScenario,
  defaultScenario,
  encodeScenario,
  equalWeights,
  loadLast,
  loadSaved,
  MAX_BENCHMARKS,
  MAX_HOLDINGS,
  sanitize,
  saveLast,
  STORAGE_KEY,
  storeSaved,
  upgradeLegacy,
  weightTotal,
} from './state';

const END = '2026-09';

describe('Time Machine scenario state', () => {
  beforeEach(() => localStorage.clear());

  it('has a US default in USD and a Taiwan default in TWD', () => {
    const us = defaultScenario(END);
    expect(us.currency).toBe('USD');
    expect(us.holdings.map((h) => h.ticker)).toEqual(['AAPL', 'MSFT']);
    expect(weightTotal(us.holdings)).toBe(100);
    const tw = defaultScenario(END, 'TWD');
    expect(tw.currency).toBe('TWD');
    expect(tw.holdings.every((h) => h.ticker.endsWith('.TW'))).toBe(true);
    expect(tw.end).toBe(END);
  });

  it('falls back to the default for junk input', () => {
    expect(sanitize(null, END)).toEqual(defaultScenario(END));
    expect(sanitize('x', END)).toEqual(defaultScenario(END));
  });

  it('bounds every field from an untrusted link', () => {
    const s = sanitize(
      {
        amount: -5,
        start: '2010-13',
        end: '2020-06',
        holdings: [
          ...Array.from({ length: 15 }, (_, i) => ({ ticker: `t${i}`, weight: 500 })),
          { weight: 3 },
          null,
        ],
        late: 'nope',
        rebalance: 'quarterly',
        topUp: Number.NaN,
        priceOnly: 'yes',
        benchmarks: [
          { kind: 'ticker', ticker: 'spy' },
          { kind: 'cash', rate: 9 },
          { kind: 'bogus' },
          { kind: 'fixed' },
          { kind: 'cash', rate: 0.01 },
        ],
        currency: 'EUR',
      },
      END,
    );
    expect(s.amount).toBe(1);
    expect(s.start).toBe('2010-01');
    expect(s.end).toBe('2020-06');
    expect(s.holdings).toHaveLength(MAX_HOLDINGS);
    expect(s.holdings[0]).toEqual({ ticker: 'T0', weight: 100 });
    expect(s.late).toBe('cash');
    expect(s.rebalance).toBe('quarterly');
    expect(s.topUp).toBe(0);
    expect(s.priceOnly).toBe(false);
    expect(s.benchmarks).toHaveLength(MAX_BENCHMARKS);
    expect(s.benchmarks[0]).toEqual({ kind: 'ticker', ticker: 'SPY' });
    expect(s.benchmarks[1]).toEqual({ kind: 'cash', rate: 1 });
    expect(s.benchmarks[2]).toEqual({ kind: 'fixed', rate: 0.02 });
    expect(s.currency).toBe('USD');
    expect(s.v).toBeUndefined();
  });

  it('cleans a property benchmark and its mortgage', () => {
    const s = sanitize(
      {
        benchmarks: [
          {
            kind: 'property',
            name: 'x'.repeat(100),
            growth: 0.04,
            years: { 2015: 0.1, abc: 1, 2016: 'no' },
            rent: 2,
            rentMode: 'reinvest',
            mortgage: { down: 0, rate: 0.02, years: 80 },
          },
        ],
      },
      END,
    );
    const b = s.benchmarks[0];
    expect(b.kind).toBe('property');
    if (b.kind !== 'property') return;
    expect(b.name).toHaveLength(60);
    expect(b.years).toEqual({ 2015: 0.1 });
    expect(b.rent).toBe(0.5);
    expect(b.rentMode).toBe('reinvest');
    expect(b.mortgage).toEqual({ down: 0.01, rate: 0.02, years: 50 });
  });

  it('round-trips through a URL-safe share code, Chinese names included', () => {
    const s = { ...defaultScenario(END, 'TWD'), currencyPicked: true };
    const code = encodeScenario(s);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeScenario(code, END)).toEqual(s);
    expect(decodeScenario('%%%not-base64', END)).toBeUndefined();
  });

  it('remembers the last and saved scenarios, surviving broken storage', () => {
    expect(loadLast(END)).toBeUndefined();
    const s = defaultScenario(END);
    saveLast(s);
    storeSaved([{ name: 'Mine', scenario: s }]);
    expect(loadLast(END)).toEqual(s);
    expect(loadSaved(END)).toEqual([{ name: 'Mine', scenario: s }]);
    localStorage.setItem(STORAGE_KEY, '{broken');
    expect(loadLast(END)).toBeUndefined();
    expect(loadSaved(END)).toEqual([]);
  });

  it('splits equal weights that add to exactly 100', () => {
    for (const n of [1, 2, 3, 6, 7, 10]) {
      const w = equalWeights(n);
      expect(w).toHaveLength(n);
      expect(weightTotal(w.map((weight) => ({ ticker: 'X', weight })))).toBe(100);
      expect(Math.max(...w) - Math.min(...w)).toBeLessThanOrEqual(0.011);
    }
    expect(equalWeights(3)).toEqual([33.34, 33.33, 33.33]);
    expect(equalWeights(0)).toEqual([]);
  });

  it('upgrades old links: USD unchanged, TWD amounts converted at the start rate', () => {
    const old = { ...defaultScenario(END), v: undefined };
    expect(upgradeLegacy(old, 30)).toEqual({ ...old, v: 2 });
    const twd = { ...old, currency: 'TWD' as const, amount: 10_000, topUp: 100 };
    expect(upgradeLegacy(twd, 31.5)).toMatchObject({
      v: 2,
      amount: 315_000,
      topUp: 3150,
      currencyPicked: true,
    });
    expect(upgradeLegacy(twd, undefined)).toBe(twd);
    const current = defaultScenario(END);
    expect(upgradeLegacy(current, 30)).toBe(current);
  });

  it('converts an amount between currencies to two significant digits', () => {
    expect(convertAmount(10_000, 'USD', 'TWD', 32.1)).toBe(320_000);
    expect(convertAmount(300_000, 'TWD', 'USD', 32)).toBe(9400);
    expect(convertAmount(5, 'TWD', 'USD', 32)).toBe(1);
    expect(convertAmount(10_000, 'USD', 'USD', 32)).toBe(10_000);
    expect(convertAmount(0, 'USD', 'TWD', 32)).toBe(0);
  });
});
