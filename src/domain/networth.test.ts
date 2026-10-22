import { makeAccount, stamp } from './testFixtures';
import { allocationShares, attributeChange, fiProgress, netWorthAt, netWorthSeries } from './networth';

const accounts = [
  makeAccount({ id: 'bank', type: 'cash', assetClass: 'cash' }),
  makeAccount({ id: 'ib', type: 'brokerage', assetClass: 'us_equity', currency: 'USD' }),
  makeAccount({ id: 'pension', type: 'pension', assetClass: 'other', accessAge: 60 }),
  makeAccount({ id: 'home', type: 'property', assetClass: 'property', investable: false }),
  makeAccount({ id: 'loan', type: 'liability', assetClass: 'other', investable: false }),
];
const snap = (id: string, date: string, accountId: string, major: number) => ({
  id,
  date,
  accountId,
  balanceMinor: major * 100,
  ...stamp,
});
const snapshots = [
  snap('1', '2026-01-31', 'bank', 500_000),
  snap('2', '2026-01-31', 'ib', 10_000),
  snap('3', '2026-01-31', 'pension', 800_000),
  snap('4', '2026-01-31', 'home', 10_000_000),
  snap('5', '2026-01-31', 'loan', 6_000_000),
  snap('6', '2026-02-28', 'bank', 520_000),
  snap('7', '2026-02-28', 'ib', 10_100),
];
const fx = [
  { id: 'a', date: '2026-01-31', currency: 'USD', twdPerUnit: 32, ...stamp },
  { id: 'b', date: '2026-02-28', currency: 'USD', twdPerUnit: 31, ...stamp },
];

describe('net worth', () => {
  it('splits investable, locked, non-investable and liabilities in TWD', () => {
    const nw = netWorthAt('2026-01-31', accounts, snapshots, fx, 1990);
    expect(nw.investable).toBe(500_000 + 320_000);
    expect(nw.locked).toBe(800_000);
    expect(nw.nonInvestable).toBe(10_000_000);
    expect(nw.liabilities).toBe(6_000_000);
    expect(nw.total).toBe(820_000 + 800_000 + 10_000_000 - 6_000_000);
    expect(nw.byCurrency.USD).toBe(320_000);
    expect(nw.missingFx).toEqual([]);
  });

  it('counts a pension as investable from its access age', () => {
    const nw = netWorthAt('2026-01-31', accounts, snapshots, fx, 1960);
    expect(nw.locked).toBe(0);
    expect(nw.investable).toBe(820_000 + 800_000);
  });

  it('carries forward the latest snapshot per account', () => {
    const nw = netWorthAt('2026-02-28', accounts, snapshots, fx, 1990);
    expect(nw.investable).toBe(520_000 + 10_100 * 31);
    expect(nw.locked).toBe(800_000);
  });

  it('builds a series and attributes each change to contributions, market and FX', () => {
    const series = netWorthSeries(accounts, snapshots, fx, 1990);
    expect(series.map((s) => s.date)).toEqual(['2026-01-31', '2026-02-28']);
    const a = attributeChange(series[0], series[1], 20_000, fx);
    expect(a.change).toBeCloseTo(20_000 + 10_100 * 31 - 320_000);
    expect(a.fxEffect).toBeCloseTo(10_000 * (31 - 32));
    expect(a.contributions + a.marketReturn + a.fxEffect).toBeCloseTo(a.change);
    expect(a.marketReturn).toBeCloseTo(100 * 31);
  });

  it('computes FI progress and allocation shares', () => {
    const nw = netWorthAt('2026-01-31', accounts, snapshots, fx, 1990);
    expect(fiProgress(nw.investable, 1_640_000)).toBeCloseTo(0.5);
    expect(fiProgress(10, 0)).toBe(1);
    const shares = allocationShares(nw);
    expect(shares.cash! + shares.us_equity!).toBeCloseTo(1);
    expect(shares.other).toBeUndefined();
  });

  it('flags a missing FX rate', () => {
    const nw = netWorthAt('2026-01-31', accounts, snapshots, [], 1990);
    expect(nw.missingFx).toEqual(['USD']);
  });
});
