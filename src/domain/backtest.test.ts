import { geometricMean, HISTORY, runBacktest } from './backtest';
import { makeInput, withReturn } from './testFixtures';

describe('historical data', () => {
  it('covers 1871–2022 with plausible long-run averages', () => {
    expect(HISTORY[0].year).toBe(1871);
    expect(HISTORY.at(-1)!.year).toBe(2022);
    expect(HISTORY).toHaveLength(152);
    const stocks = geometricMean(HISTORY.map((h) => h.stocks));
    const bonds = geometricMean(HISTORY.map((h) => h.bonds));
    const inflation = geometricMean(HISTORY.map((h) => h.inflation));
    expect(stocks).toBeGreaterThan(0.08);
    expect(stocks).toBeLessThan(0.1);
    expect(bonds).toBeGreaterThan(0.035);
    expect(bonds).toBeLessThan(0.055);
    expect(inflation).toBeGreaterThan(0.015);
    expect(inflation).toBeLessThan(0.03);
    const y2008 = HISTORY.find((h) => h.year === 2008)!;
    expect(y2008.stocks).toBeLessThan(-0.3);
  });
});

describe('backtest', () => {
  const history = [
    { year: 2000, stocks: 0.1, bonds: 0.03, inflation: 0 },
    { year: 2001, stocks: -0.5, bonds: 0.03, inflation: 0 },
    { year: 2002, stocks: 0.1, bonds: 0.03, inflation: 0 },
    { year: 2003, stocks: 0.1, bonds: 0.03, inflation: 0 },
  ];

  it('runs one path per full window and replays the sequence', () => {
    const input = makeInput({
      startAge: 60,
      horizonAge: 62,
      liquid: [{ assetClass: 'us_equity', currency: 'TWD', value: 1_000_000 }],
      fiSpending: 1e12,
      retireAtAge: 100,
    });
    const r = runBacktest(input, history);
    expect(r.runs).toBe(3);
    expect(r.wrapped).toBe(false);
    expect([r.firstYear, r.lastYear]).toEqual([2000, 2002]);
    // Starts 2000 and 2001 meet the −50% year; 2002 gets +10% twice.
    expect(r.p10[2]).toBeCloseTo(550_000);
    expect(r.p50[2]).toBeCloseTo(550_000);
    expect(Math.max(...r.worst.map((w) => w.balanceAtHorizon))).toBeCloseTo(1_210_000);
  });

  it('flags failures and lists the worst starting years first', () => {
    const input = makeInput({
      startAge: 60,
      horizonAge: 63,
      liquid: [{ assetClass: 'us_equity', currency: 'TWD', value: 1_000_000 }],
      fiSpending: 400_000,
      allocation: [0, 0, 1, 0, 0, 0, 0],
      swr: 0.4,
    });
    const r = runBacktest(input, history);
    expect(r.successRate).toBeLessThan(1);
    // Starting into the −50% year runs out a year earlier than starting the year before.
    expect(r.worst[0].success).toBe(false);
    expect(r.worst[0].startYear).toBe(2001);
    expect(r.worst[0].depletionAge).toBe(61);
  });

  it('wraps around when the horizon is longer than the data', () => {
    const r = runBacktest(makeInput({ startAge: 40, horizonAge: 50 }), history);
    expect(r.wrapped).toBe(true);
    expect(r.runs).toBe(4);
  });

  it('keeps classes without history at their real expected return', () => {
    const input = withReturn(
      makeInput({ startAge: 60, horizonAge: 61, fiSpending: 1e12, inflation: 0.02 }),
      'cash',
      0.0302,
    );
    const r = runBacktest(input, [{ year: 1, stocks: 0, bonds: 0, inflation: 0.05 }, ...history]);
    // Real cash return (1.0302 / 1.02 − 1 = 1%) applies whatever the year's inflation.
    expect(r.p50[1]).toBeCloseTo(1_010_000, 0);
  });
});
