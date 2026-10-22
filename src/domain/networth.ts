import type { Account, AssetClass, FxRate, Snapshot } from './entities';
import { ageAt } from './dates';
import { BASE_CURRENCY, rateFor } from './fx';
import { fromMinor } from './money';

export interface AccountBalance {
  account: Account;
  /** Native currency, major units. */
  native: number;
  twd: number;
  /** Date of the snapshot used (may be earlier than the requested date). */
  snapshotDate: string;
  bucket: 'liquid' | 'locked' | 'nonInvestable' | 'liability';
}

export interface NetWorth {
  date: string;
  /** All assets minus all liabilities. */
  total: number;
  /** Investable assets usable now (excludes anything before its access age). */
  investable: number;
  /** Investable but locked until an access age (e.g. 勞退 before 60). */
  locked: number;
  nonInvestable: number;
  liabilities: number;
  byAssetClass: Partial<Record<AssetClass, number>>;
  byCurrency: Record<string, number>;
  balances: AccountBalance[];
  missingFx: string[];
}

/** The latest snapshot on or before `date` for each account. */
export function latestSnapshots(snapshots: readonly Snapshot[], date: string): Map<string, Snapshot> {
  const out = new Map<string, Snapshot>();
  for (const s of snapshots) {
    if (s.date > date) continue;
    const prev = out.get(s.accountId);
    if (!prev || s.date > prev.date) out.set(s.accountId, s);
  }
  return out;
}

export function bucketOf(account: Account, age: number): AccountBalance['bucket'] {
  if (account.type === 'liability') return 'liability';
  if (!account.investable) return 'nonInvestable';
  if (account.accessAge !== undefined && age < account.accessAge) return 'locked';
  return 'liquid';
}

/**
 * Net worth on `date`. Each account uses its latest snapshot on or before the date,
 * converted at the FX rate for the requested date.
 */
export function netWorthAt(
  date: string,
  accounts: readonly Account[],
  snapshots: readonly Snapshot[],
  fxRates: readonly FxRate[],
  birthYear: number,
): NetWorth {
  const latest = latestSnapshots(snapshots, date);
  const age = ageAt(birthYear, date);
  const result: NetWorth = {
    date,
    total: 0,
    investable: 0,
    locked: 0,
    nonInvestable: 0,
    liabilities: 0,
    byAssetClass: {},
    byCurrency: {},
    balances: [],
    missingFx: [],
  };
  for (const account of accounts) {
    const snap = latest.get(account.id);
    if (!snap) continue;
    const native = fromMinor(snap.balanceMinor);
    const rate = rateFor(fxRates, account.currency, date);
    if (rate === undefined && !result.missingFx.includes(account.currency)) {
      result.missingFx.push(account.currency);
    }
    const twd = native * (rate ?? 0);
    const bucket = bucketOf(account, age);
    result.balances.push({ account, native, twd, snapshotDate: snap.date, bucket });
    if (bucket === 'liability') {
      result.liabilities += twd;
      continue;
    }
    if (bucket === 'liquid') result.investable += twd;
    else if (bucket === 'locked') result.locked += twd;
    else result.nonInvestable += twd;
    result.byAssetClass[account.assetClass] = (result.byAssetClass[account.assetClass] ?? 0) + twd;
    result.byCurrency[account.currency] = (result.byCurrency[account.currency] ?? 0) + twd;
  }
  result.total = result.investable + result.locked + result.nonInvestable - result.liabilities;
  return result;
}

/** All distinct snapshot dates, ascending. */
export function snapshotDates(snapshots: readonly Snapshot[]): string[] {
  return [...new Set(snapshots.map((s) => s.date))].sort();
}

export function netWorthSeries(
  accounts: readonly Account[],
  snapshots: readonly Snapshot[],
  fxRates: readonly FxRate[],
  birthYear: number,
): NetWorth[] {
  return snapshotDates(snapshots).map((d) => netWorthAt(d, accounts, snapshots, fxRates, birthYear));
}

/** FI progress: investable net worth ÷ FI number. */
export function fiProgress(investable: number, fiNumber: number): number {
  if (fiNumber <= 0) return investable > 0 ? 1 : 0;
  return investable / fiNumber;
}

/**
 * Share of liquid investable assets by asset class: what can be rebalanced. Locked
 * (e.g. 勞退 before its access age) and non-investable assets are left out.
 */
export function allocationShares(nw: NetWorth): Partial<Record<AssetClass, number>> {
  const totals: Partial<Record<AssetClass, number>> = {};
  let sum = 0;
  for (const b of nw.balances) {
    if (b.bucket !== 'liquid') continue;
    totals[b.account.assetClass] = (totals[b.account.assetClass] ?? 0) + b.twd;
    sum += b.twd;
  }
  if (sum <= 0) return {};
  const out: Partial<Record<AssetClass, number>> = {};
  for (const [k, v] of Object.entries(totals) as [AssetClass, number][]) out[k] = v / sum;
  return out;
}

export interface ChangeAttribution {
  from: string;
  to: string;
  change: number;
  contributions: number;
  marketReturn: number;
  fxEffect: number;
}

/**
 * Explains a period's change in total net worth (POS-7):
 * ΔNW = contributions + market return + Σ prior foreign balance × (FX_t − FX_{t−1}).
 * Market return is the remainder.
 */
export function attributeChange(
  prev: NetWorth,
  curr: NetWorth,
  contributions: number,
  fxRates: readonly FxRate[],
): ChangeAttribution {
  let fxEffect = 0;
  for (const b of prev.balances) {
    if (b.account.currency === BASE_CURRENCY) continue;
    const r0 = rateFor(fxRates, b.account.currency, prev.date);
    const r1 = rateFor(fxRates, b.account.currency, curr.date);
    if (r0 === undefined || r1 === undefined) continue;
    const sign = b.bucket === 'liability' ? -1 : 1;
    fxEffect += sign * b.native * (r1 - r0);
  }
  const change = curr.total - prev.total;
  return {
    from: prev.date,
    to: curr.date,
    change,
    contributions,
    fxEffect,
    marketReturn: change - contributions - fxEffect,
  };
}
