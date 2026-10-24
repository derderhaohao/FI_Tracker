import type { Account, FxRate, Snapshot } from '@/domain/entities';
import { addMonths, lastDayOfMonth, monthOf } from '@/domain/dates';
import { BASE_CURRENCY, rateFor } from '@/domain/fx';

/**
 * The monthly update (product review, Next phase): one card per account, pre-filled with
 * last month, so a phone update takes under three minutes. Accounts whose balance has not
 * moved for three snapshots are grouped and confirmed together.
 */

export interface UpdateItem {
  account: Account;
  /** Latest balance before the update date, minor units in the account currency. */
  lastMinor?: number;
  lastDate?: string;
  /** Already saved for the update date (editing an update in progress). */
  savedMinor?: number;
}

export interface UpdatePlan {
  changing: UpdateItem[];
  steady: UpdateItem[];
  currencies: { currency: string; last?: number; saved?: number }[];
}

/** Month-end of last month: the date most people snapshot. */
export function defaultUpdateDate(todayDate: string): string {
  return lastDayOfMonth(addMonths(monthOf(todayDate), -1));
}

export function planUpdate(
  accounts: readonly Account[],
  snapshots: readonly Snapshot[],
  fxRates: readonly FxRate[],
  date: string,
): UpdatePlan {
  const changing: UpdateItem[] = [];
  const steady: UpdateItem[] = [];
  for (const account of accounts.filter((a) => !a.archived)) {
    const own = snapshots
      .filter((s) => s.accountId === account.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    const before = own.filter((s) => s.date < date);
    const item: UpdateItem = {
      account,
      lastMinor: before[0]?.balanceMinor,
      lastDate: before[0]?.date,
      savedMinor: own.find((s) => s.date === date)?.balanceMinor,
    };
    const recent = before.slice(0, 3);
    const unchanged = recent.length === 3 && recent.every((s) => s.balanceMinor === recent[0].balanceMinor);
    (unchanged ? steady : changing).push(item);
  }
  const currencies = [...new Set(accounts.filter((a) => !a.archived).map((a) => a.currency))]
    .filter((c) => c !== BASE_CURRENCY)
    .sort()
    .map((currency) => {
      const earlier = fxRates.filter((r) => r.currency === currency && r.date < date);
      return {
        currency,
        last: earlier.length ? rateFor(earlier, currency, date) : undefined,
        saved: fxRates.find((r) => r.currency === currency && r.date === date)?.twdPerUnit,
      };
    });
  return { changing, steady, currencies };
}

/** "1 min 40 s" */
export function durationText(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${s % 60} s` : `${s} s`;
}

const TIMES_KEY = 'fi-tracker-update-times';

/** Keeps the last 12 update durations on this device (success metric: under 3 minutes). */
export function recordUpdateTime(date: string, ms: number): void {
  try {
    const list = JSON.parse(localStorage.getItem(TIMES_KEY) ?? '[]') as { date: string; ms: number }[];
    list.push({ date, ms });
    localStorage.setItem(TIMES_KEY, JSON.stringify(list.slice(-12)));
  } catch {
    // Storage unavailable: nothing to record.
  }
}
