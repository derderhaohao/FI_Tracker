import type { Account, GoalSnapshot, Snapshot } from './entities';
import { buildDemoBackup } from '../io/demo';
import { fiDateMove } from './fiDateMove';
import { stamp } from './testFixtures';

/**
 * "Why did my FI date move?" on cases beyond the steady demo month: the parts must always add
 * up to the total, and nothing may be invented when the date cannot be worked out.
 */

const raw = buildDemoBackup().data;
const base = { ...raw, settings: raw.settings[0] };
const assumptions = raw.assumptionSets[0];
const latest = '2026-09-30';
const next = '2026-10-31';

/** The demo with one more month: every balance copied, then `change` applied. */
function withNextMonth(change: (s: Snapshot) => Snapshot = (s) => s) {
  const copied = base.snapshots
    .filter((s) => s.date === latest)
    .map((s) => change({ ...s, id: `${s.id}-next`, date: next }));
  return { ...base, snapshots: [...base.snapshots, ...copied] };
}

const sumOf = (parts: { months: number }[]) => parts.reduce((s, p) => s + p.months, 0);

describe('why did my FI date move: harder months', () => {
  it('splits an unchanged month into time alone, and the parts still add up', () => {
    const move = fiDateMove(withNextMonth(), assumptions)!;
    expect(move.fromDate).toBe(latest);
    expect(move.toDate).toBe(next);
    expect(sumOf(move.parts!)).toBeCloseTo(move.totalMonths!, 9);
    const by = Object.fromEntries(move.parts!.map((p) => [p.key, p.months]));
    // No balance moved, so saving, markets and FX explain nothing.
    expect(by.saving).toBeCloseTo(0, 9);
    expect(by.market).toBeCloseTo(0, 9);
    expect(by.fx).toBeCloseTo(0, 9);
    expect(by.time).toBeGreaterThan(0);
  });

  it('handles an account that only exists on the later date, and a loan paid off', () => {
    const loan = base.accounts.find((a) => a.type === 'liability')!;
    const fresh: Account = {
      ...base.accounts.find((a) => a.assetClass === 'cash')!,
      id: 'new-gold',
      nickname: 'Gold',
      assetClass: 'other',
      ...stamp,
    };
    const data = withNextMonth((s) => (s.accountId === loan.id ? { ...s, balanceMinor: 0 } : s));
    data.accounts = [...data.accounts, fresh];
    data.snapshots = [
      ...data.snapshots,
      { id: 'gold-next', accountId: fresh.id, date: next, balanceMinor: 50_000_000, ...stamp },
    ];
    const move = fiDateMove(data, assumptions)!;
    expect(move.parts).toHaveLength(6);
    expect(sumOf(move.parts!)).toBeCloseTo(move.totalMonths!, 9);
    // NT$500,000 more and a cleared loan bring FI earlier overall.
    expect(move.totalMonths!).toBeLessThan(1);
  });

  it('counts a changed goal as its own part', () => {
    const goal = (date: string, fiSpendingMinor: number): GoalSnapshot => ({
      id: `g-${date}`,
      date,
      fiTier: 'full',
      fiSpendingMinor,
      guaranteedIncomeMinor: 0,
      swr: 0.04,
      fiNumberMinor: Math.round(fiSpendingMinor / 0.04),
      ...stamp,
    });
    // The goal recorded at the earlier date was much smaller than today's budget.
    const move = fiDateMove(withNextMonth(), assumptions, [goal(latest, 30_000_000)])!;
    const goalPart = move.parts!.find((p) => p.key === 'goal')!;
    expect(goalPart.months).toBeGreaterThan(0);
    expect(sumOf(move.parts!)).toBeCloseTo(move.totalMonths!, 9);
    // A goal recorded after the earlier date is not used for it.
    const later = fiDateMove(withNextMonth(), assumptions, [goal('2026-10-15', 30_000_000)])!;
    expect(later.parts!.find((p) => p.key === 'goal')!.months).toBeCloseTo(0, 9);
  });

  it('gives the dates but no parts when FI is out of reach', () => {
    // An FI budget no one could reach: neither date has an FI age.
    const huge = base.categories.map((c) =>
      c.kind === 'expense' && c.fiAnnualMinor !== undefined ? { ...c, fiAnnualMinor: 10_000_000_000 } : c,
    );
    const move = fiDateMove({ ...withNextMonth(), categories: huge }, assumptions)!;
    expect(move).toMatchObject({ fromDate: latest, toDate: next });
    expect(move.fromFi).toBeUndefined();
    expect(move.totalMonths).toBeUndefined();
    expect(move.parts).toBeUndefined();
  });
});
