import { describe, expect, it } from 'vitest';
import {
  calendarYears,
  effectiveStart,
  irr,
  lateListings,
  metrics,
  monthIndex,
  mortgagePayment,
  simulate,
  twr,
  type MarketData,
  type Scenario,
  type Series,
} from './engine';
import {
  convertAmount,
  decodeScenario,
  encodeScenario,
  equalWeights,
  sanitize,
  upgradeLegacy,
} from './state';

/** A series from monthly returns, its first close in `first`. */
function series(first: string, returns: number[], dividend = 0): Series {
  const tr = [100];
  const p = [100];
  for (const r of returns) {
    tr.push(tr[tr.length - 1] * (1 + r + dividend));
    p.push(p[p.length - 1] * (1 + r));
  }
  return { first: monthIndex(first), tr, p };
}

/** Deterministic, bumpy monthly returns. */
const bumpy = (n: number, seed: number) =>
  Array.from(
    { length: n },
    (_, i) => 0.008 + 0.04 * Math.sin(i * 0.7 + seed) * Math.cos(i * 0.13 + seed * 2),
  );

const base: Scenario = {
  amount: 10_000,
  start: '2010-01',
  end: '2020-12',
  holdings: [{ ticker: 'SPY', weight: 100 }],
  late: 'cash',
  rebalance: 'none',
  topUp: 0,
  priceOnly: false,
  benchmarks: [],
  currency: 'USD',
};

describe('Time Machine engine (PRD Part B acceptance)', () => {
  const spy = series('1999-12', bumpy(320, 1), 0.0015);
  const data: MarketData = { series: new Map([['SPY', spy]]) };

  it('$10,000 in SPY from Jan 2010 matches the total-return index exactly', () => {
    const sim = simulate({ ...base, end: '2026-07' }, data);
    const from = monthIndex('2009-12') - spy.first; // bought at December 2009's close
    const to = monthIndex('2026-07') - spy.first;
    const expected = (10_000 * spy.tr[to]) / spy.tr[from];
    const got = sim.portfolio.values[sim.months];
    expect(Math.abs(got / expected - 1)).toBeLessThan(1e-9);
    expect(sim.months).toBe(monthIndex('2026-07') - monthIndex('2010-01') + 1);
  });

  it('price-only mode leaves the dividends out (TM-21)', () => {
    const tr = simulate(base, data).portfolio.values.at(-1)!;
    const p = simulate({ ...base, priceOnly: true }, data).portfolio.values.at(-1)!;
    expect(p).toBeLessThan(tr);
    const from = monthIndex('2009-12') - spy.first;
    const to = monthIndex('2020-12') - spy.first;
    expect(p).toBeCloseTo((10_000 * spy.p[to]) / spy.p[from], 6);
  });

  it('a 50/50 portfolio with yearly rebalancing matches a step-by-step hand check', () => {
    const a = series('2014-12', bumpy(80, 2));
    const b = series('2014-12', bumpy(80, 5));
    const d: MarketData = {
      series: new Map([
        ['AAPL', a],
        ['MSFT', b],
      ]),
    };
    const sim = simulate(
      {
        ...base,
        start: '2015-01',
        end: '2020-12',
        rebalance: 'yearly',
        holdings: [
          { ticker: 'AAPL', weight: 50 },
          { ticker: 'MSFT', weight: 50 },
        ],
      },
      d,
    );
    // Hand check: grow each half month by month, reset to halves after each December.
    let x = 5000;
    let y = 5000;
    for (let m = 1; m <= 72; m++) {
      x *= a.tr[m] / a.tr[m - 1];
      y *= b.tr[m] / b.tr[m - 1];
      if (m % 12 === 0) x = y = (x + y) / 2;
    }
    expect(Math.abs(sim.portfolio.values[72] / (x + y) - 1)).toBeLessThan(1e-9);
    // Right after a rebalance the two holdings are equal.
    expect(sim.holdings[0].values[12]).toBeCloseTo(sim.holdings[1].values[12], 6);
    // Without rebalancing the result differs.
    const hold = simulate(
      {
        ...base,
        start: '2015-01',
        end: '2020-12',
        holdings: sim.holdings.map((h) => ({ ticker: h.name, weight: 50 })),
      },
      d,
    );
    expect(hold.portfolio.values[72]).not.toBeCloseTo(x + y, 2);
  });

  it('quarterly rebalancing resets at the end of March, June, September and December', () => {
    const d: MarketData = {
      series: new Map([
        ['A', series('2014-12', bumpy(30, 1))],
        ['B', series('2014-12', bumpy(30, 3))],
      ]),
    };
    const sim = simulate(
      {
        ...base,
        start: '2015-01',
        end: '2016-12',
        rebalance: 'quarterly',
        holdings: [
          { ticker: 'A', weight: 70 },
          { ticker: 'B', weight: 30 },
        ],
      },
      d,
    );
    for (const k of [3, 6, 9, 12]) {
      const total = sim.portfolio.values[k];
      expect(sim.holdings[0].values[k] / total).toBeCloseTo(0.7, 9);
    }
    expect(sim.holdings[0].values[4] / sim.portfolio.values[4]).not.toBeCloseTo(0.7, 4);
  });

  it('a property at 3% a year with no rent or costs compounds exactly', () => {
    const sim = simulate(
      {
        ...base,
        benchmarks: [
          {
            kind: 'property',
            name: 'Flat',
            growth: 0.03,
            rent: 0,
            rentMode: 'cash',
            buyCost: 0,
            sellCost: 0,
          },
        ],
      },
      data,
    );
    const p = sim.benchmarks[0];
    for (const n of [1, 5, 11]) expect(p.values[n * 12]).toBeCloseTo(10_000 * 1.03 ** n, 6);
    expect(p.afterSelling).toBeCloseTo(p.values.at(-1)!, 6);
  });

  it('property rent, costs and year-by-year changes', () => {
    const sim = simulate(
      {
        ...base,
        start: '2010-01',
        end: '2011-12',
        benchmarks: [
          {
            kind: 'property',
            name: 'Flat',
            growth: 0.03,
            years: { 2011: -0.1 },
            rent: 0.024,
            rentMode: 'cash',
            buyCost: 0.05,
            sellCost: 0.04,
          },
        ],
      },
      data,
    );
    const p = sim.benchmarks[0];
    expect(p.values[0]).toBeCloseTo(9_500, 6);
    // 2010 at +3%, 2011 at −10%, plus a year of rent at about 2% of the value each month.
    const price = 9_500 * 1.03 * 0.9;
    expect(p.values[24]).toBeGreaterThan(price);
    expect(p.values[24]).toBeLessThan(price + 9_500 * 0.024 * 2.1);
    expect(p.afterSelling).toBeLessThan(p.values[24] - price * 0.039);
  });

  it('a mortgaged property: the line is the equity, payments counted against it (TM-22)', () => {
    expect(mortgagePayment(100_000, 0.06, 30)).toBeCloseTo(599.55, 2);
    const sim = simulate(
      {
        ...base,
        start: '2010-01',
        end: '2010-12',
        benchmarks: [
          {
            kind: 'property',
            name: 'Home',
            growth: 0,
            rent: 0,
            rentMode: 'cash',
            buyCost: 0,
            sellCost: 0,
            mortgage: { down: 0.2, rate: 0.06, years: 30 },
          },
        ],
      },
      data,
    );
    const p = sim.benchmarks[0];
    // Price 50,000, loan 40,000: a flat price means equity falls by the interest paid.
    expect(p.values[0]).toBeCloseTo(10_000, 6);
    expect(p.values[12]).toBeCloseTo(10_000 - 40_000 * 0.06 * 0.995, -2);
  });

  it('cash and a fixed return compound monthly at the yearly rate', () => {
    const sim = simulate(
      {
        ...base,
        benchmarks: [
          { kind: 'cash', rate: 0.02 },
          { kind: 'fixed', rate: 0.07 },
        ],
      },
      data,
    );
    expect(sim.benchmarks[0].values[12]).toBeCloseTo(10_200, 6);
    expect(sim.benchmarks[1].values[24]).toBeCloseTo(10_000 * 1.07 ** 2, 6);
  });

  it('a late listing either waits in cash or moves the start (TM-7)', () => {
    const late = series('2012-06', bumpy(120, 4)); // first close June 2012, buyable from July
    const d: MarketData = {
      series: new Map([
        ['SPY', spy],
        ['NEW', late],
      ]),
    };
    const sc: Scenario = {
      ...base,
      holdings: [
        { ticker: 'SPY', weight: 50 },
        { ticker: 'NEW', weight: 50 },
      ],
    };
    expect(lateListings(sc, d)).toEqual([{ ticker: 'NEW', first: monthIndex('2012-07') }]);

    // Cash: NEW's half stays at 5,000 until it lists, then follows NEW from its first close.
    const cash = simulate(sc, d);
    expect(cash.startMonth).toBe(monthIndex('2010-01'));
    const listed = monthIndex('2012-06') - monthIndex('2010-01') + 1; // the point at June 2012's close
    expect(cash.holdings[1].values[listed]).toBe(5_000);
    const end = monthIndex('2020-12') - monthIndex('2010-01') + 1;
    expect(cash.holdings[1].values[end]).toBeCloseTo((5_000 * late.tr[end - listed]) / late.tr[0], 6);

    // Move: the scenario starts in July 2012, both halves invested at once.
    const moved = simulate({ ...sc, late: 'move' }, d);
    expect(effectiveStart({ ...sc, late: 'move' }, d)).toBe(monthIndex('2012-07'));
    expect(moved.startMonth).toBe(monthIndex('2012-07'));
    expect(moved.holdings[1].values[1]).toBeCloseTo((5_000 * late.tr[1]) / late.tr[0], 6);
  });

  it('top-ups go to every line at the same months, with a money-weighted return (TM-16)', () => {
    const sim = simulate({ ...base, topUp: 100, benchmarks: [{ kind: 'cash', rate: 0 }] }, data);
    expect(sim.portfolio.flows.slice(0, 3)).toEqual([10_000, 100, 100]);
    expect(sim.benchmarks[0].values[sim.months]).toBeCloseTo(10_000 + 100 * sim.months, 6);
    const m = metrics(sim.benchmarks[0], sim.startMonth);
    expect(m.invested).toBe(10_000 + 100 * sim.months);
    expect(m.yearly).toBeCloseTo(0, 6);
    // An IRR check: 1,000 now grows 1% in a month, then 1,000 more is added.
    expect(irr([1000, 1000], 1000 * 1.01 + 1000)).toBeCloseTo(1.01 ** 12 - 1, 6);
  });

  it('worst fall, recovery, calendar years and volatility use the time-weighted index', () => {
    const d: MarketData = {
      series: new Map([['X', series('2009-12', [0.1, -0.5, 0.2, 0.5, 0.5, 0, 0, 0, 0, 0, 0, 0, 0.1])]]),
    };
    const sim = simulate(
      { ...base, holdings: [{ ticker: 'X', weight: 100 }], start: '2010-01', end: '2011-01', topUp: 1_000 },
      d,
    );
    const m = metrics(sim.portfolio, sim.startMonth);
    expect(m.fall.depth).toBeCloseTo(-0.5, 9);
    expect(m.fall.peak).toBe(1);
    expect(m.fall.trough).toBe(2);
    // 0.5 × 1.2 × 1.5 = 0.9, then × 1.5 = 1.35 ≥ 1: back two months after the trough.
    expect(m.fall.recovery).toBe(3);
    const years = calendarYears(twr(sim.portfolio), sim.startMonth);
    expect(years.map((y) => y.year)).toEqual([2010, 2011]);
    expect(years[0].ret).toBeCloseTo(1.1 * 0.5 * 1.2 * 1.5 * 1.5 - 1, 9);
    expect(years[1].partial).toBe(true);
    expect(m.best?.year).toBe(2010);
    expect(m.volatility).toBeGreaterThan(0);
  });
});

describe('Time Machine currencies (PRD Part C)', () => {
  const spy = series('1999-12', bumpy(320, 1), 0.0015);
  const tw50 = { ...series('1999-12', bumpy(320, 7), 0.003), currency: 'TWD' as const };
  // Month-end TWD per USD, wandering between about 27 and 35.
  const fx = {
    first: monthIndex('1999-12'),
    v: Array.from({ length: 320 }, (_, i) => 31 + 4 * Math.sin(i / 9)),
  };
  const rate = (m: string) => fx.v[monthIndex(m) - fx.first];
  const d: MarketData = {
    series: new Map<string, Series>([
      ['SPY', spy],
      ['0050.TW', tw50],
    ]),
    fx,
  };

  it('$10,000 of SPY in a TWD scenario is the USD result times the change in the rate (TW-4)', () => {
    const usd = simulate(base, d);
    const twd = simulate({ ...base, currency: 'TWD', amount: 10_000 }, d);
    const expected = usd.portfolio.values[usd.months] * (rate('2020-12') / rate('2009-12'));
    expect(Math.abs(twd.portfolio.values[twd.months] / expected - 1)).toBeLessThan(0.001);
    // The currency part is the TWD result less the same run with the rate held still.
    expect(twd.portfolio.fxEffect).toBeCloseTo(
      twd.portfolio.values[twd.months] - usd.portfolio.values[usd.months],
      6,
    );
    expect(usd.portfolio.fxEffect).toBe(0);
  });

  it('a TWD listing in a USD scenario converts by the inverse rate', () => {
    const tw = simulate({ ...base, holdings: [{ ticker: '0050.TW', weight: 100 }], currency: 'TWD' }, d);
    const us = simulate({ ...base, holdings: [{ ticker: '0050.TW', weight: 100 }], currency: 'USD' }, d);
    const expected = tw.portfolio.values[tw.months] * (rate('2009-12') / rate('2020-12'));
    expect(us.portfolio.values[us.months]).toBeCloseTo(expected, 6);
    expect(tw.portfolio.fxEffect).toBe(0);
  });

  it('a 50/50 SPY + 0050 portfolio in TWD with yearly rebalancing matches a hand check (2015–2020)', () => {
    const sim = simulate(
      {
        ...base,
        start: '2015-01',
        end: '2020-12',
        currency: 'TWD',
        amount: 300_000,
        rebalance: 'yearly',
        holdings: [
          { ticker: 'SPY', weight: 50 },
          { ticker: '0050.TW', weight: 50 },
        ],
      },
      d,
    );
    let us = 150_000;
    let tw = 150_000;
    const at = (s: Series, m: number) => s.tr[m - s.first];
    for (let m = monthIndex('2015-01'); m <= monthIndex('2020-12'); m++) {
      us *= (at(spy, m) / at(spy, m - 1)) * (fx.v[m - fx.first] / fx.v[m - 1 - fx.first]);
      tw *= at(tw50, m) / at(tw50, m - 1);
      if (m % 12 === 11) us = tw = (us + tw) / 2;
    }
    expect(Math.abs(sim.portfolio.values[sim.months] / (us + tw) - 1)).toBeLessThan(1e-9);
    expect(sim.holdings[1].fxEffect).toBe(0);
    expect(sim.holdings[0].fxEffect).not.toBe(0);
  });

  it('needs exchange rates only when currencies are mixed', () => {
    const noFx: MarketData = { series: d.series };
    expect(() => simulate({ ...base, currency: 'TWD' }, noFx)).toThrow();
    expect(() => simulate(base, noFx)).not.toThrow();
  });
});

describe('Time Machine state (TM-6, TM-13)', () => {
  it('round-trips a scenario through a share link', () => {
    const sc: Scenario = {
      ...base,
      holdings: [
        { ticker: 'AAPL', weight: 50 },
        { ticker: 'MSFT', weight: 50 },
      ],
      benchmarks: [
        { kind: 'ticker', ticker: 'SPY' },
        {
          kind: 'property',
          name: '高雄公寓',
          growth: 0.04,
          rent: 0.02,
          rentMode: 'reinvest',
          buyCost: 0.03,
          sellCost: 0.02,
          years: { 2012: 0.1 },
          mortgage: { down: 0.3, rate: 0.02, years: 20 },
        },
      ],
      rebalance: 'quarterly',
      topUp: 250,
    };
    expect(decodeScenario(encodeScenario(sc), '2026-09')).toEqual(sc);
    expect(decodeScenario('not-a-link', '2026-09')).toBeUndefined();
  });

  it('bounds untrusted input', () => {
    const s = sanitize(
      {
        amount: -5,
        holdings: Array.from({ length: 20 }, () => ({ ticker: 'x', weight: 500 })),
        start: '1990-13',
      },
      '2026-09',
    );
    expect(s.amount).toBe(1);
    expect(s.holdings).toHaveLength(10);
    expect(s.holdings[0]).toEqual({ ticker: 'X', weight: 100 });
    expect(s.start).toBe('2010-01');
  });

  it('equal weights always add to 100', () => {
    for (let n = 1; n <= 10; n++) {
      const w = equalWeights(n);
      expect(Math.round(w.reduce((a, b) => a + b, 0) * 100) / 100).toBe(100);
    }
    expect(equalWeights(3)).toEqual([33.34, 33.33, 33.33]);
  });

  it('opens links made before Part C unchanged (TW-10)', () => {
    // An old USD link has no version: it decodes to the same scenario and the same final value.
    const old = encodeScenario(base);
    const sc = decodeScenario(old, '2026-09')!;
    expect(sc.v).toBeUndefined();
    const up = upgradeLegacy(sc, undefined);
    expect(up).toEqual({ ...base, v: 2 });
    const d: MarketData = { series: new Map([['SPY', series('1999-12', bumpy(320, 1))]]) };
    expect(simulate(up, d).portfolio.values.at(-1)).toBe(simulate(base, d).portfolio.values.at(-1));
    // An old TWD link meant "USD shown in TWD": its amounts convert at the start rate.
    const twd = upgradeLegacy({ ...base, currency: 'TWD', topUp: 100 }, 32);
    expect(twd).toMatchObject({ v: 2, currency: 'TWD', amount: 320_000, topUp: 3_200 });
    expect(upgradeLegacy({ ...base, currency: 'TWD' }, undefined).v).toBeUndefined();
  });

  it('converts amounts to round numbers when the currency changes', () => {
    expect(convertAmount(10_000, 'USD', 'TWD', 32.4)).toBe(320_000);
    expect(convertAmount(300_000, 'TWD', 'USD', 32.4)).toBe(9_300);
    expect(convertAmount(500, 'USD', 'USD', 32.4)).toBe(500);
  });
});
