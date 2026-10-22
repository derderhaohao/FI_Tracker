import { makeAccount, makeAssumptions, stamp } from './testFixtures';
import { attributeChange, netWorthAt } from './networth';
import { monthsBetween, reconcile } from './reconcile';

const accounts = [
  makeAccount({ id: 'etf', type: 'brokerage', assetClass: 'tw_equity' }),
  makeAccount({ id: 'cash' }),
];
const snap = (accountId: string, date: string, major: number) => ({
  id: accountId + date,
  accountId,
  date,
  balanceMinor: major * 100,
  ...stamp,
});
const assets = makeAssumptions().assets;

function check(etfAfter: number, cashAfter: number, contributions: number) {
  const snaps = [
    snap('etf', '2026-01-31', 1_000_000),
    snap('cash', '2026-01-31', 500_000),
    snap('etf', '2026-02-28', etfAfter),
    snap('cash', '2026-02-28', cashAfter),
  ];
  const prev = netWorthAt('2026-01-31', accounts, snaps, [], 1990);
  const curr = netWorthAt('2026-02-28', accounts, snaps, [], 1990);
  return reconcile(attributeChange(prev, curr, contributions, []), prev, assets);
}

describe('reconciliation flag', () => {
  it('accepts changes that savings and market moves explain', () => {
    expect(check(1_040_000, 530_000, 30_000).flagged).toBe(false);
    expect(check(900_000, 530_000, 30_000).flagged).toBe(false);
  });

  it('flags a change that savings and plausible returns cannot explain', () => {
    // Cash jumped by 400k with only 30k of recorded savings: a missing entry or typo.
    const r = check(1_000_000, 900_000, 30_000);
    expect(r.flagged).toBe(true);
    expect(r.expectedHigh).toBeLessThan(370_000);
    // Savings recorded but the balances did not move: also suspicious.
    expect(check(1_000_000, 500_000, 400_000).flagged).toBe(true);
  });

  it('counts months between dates', () => {
    expect(monthsBetween('2026-01-31', '2026-02-28')).toBe(1);
    expect(monthsBetween('2025-11-30', '2026-02-28')).toBe(3);
    expect(monthsBetween('2026-01-01', '2026-01-31')).toBe(1);
  });
});
