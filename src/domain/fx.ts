import type { FxRate } from './entities';

export const BASE_CURRENCY = 'TWD';

/**
 * TWD per unit of `currency` on `date`: the latest rate on or before the date,
 * falling back to the earliest rate after it. Undefined when no rate exists.
 */
export function rateFor(rates: readonly FxRate[], currency: string, date: string): number | undefined {
  if (currency === BASE_CURRENCY) return 1;
  let best: FxRate | undefined;
  let earliestAfter: FxRate | undefined;
  for (const r of rates) {
    if (r.currency !== currency) continue;
    if (r.date <= date) {
      if (!best || r.date > best.date) best = r;
    } else if (!earliestAfter || r.date < earliestAfter.date) {
      earliestAfter = r;
    }
  }
  return (best ?? earliestAfter)?.twdPerUnit;
}

/** Exact rate stored for that date, without fallback. */
export function exactRate(rates: readonly FxRate[], currency: string, date: string): number | undefined {
  if (currency === BASE_CURRENCY) return 1;
  return rates.find((r) => r.currency === currency && r.date === date)?.twdPerUnit;
}

export interface Converted {
  twd: number;
  missingRate: boolean;
}

/** Converts a major-unit amount to TWD; a missing rate converts to 0 and is flagged. */
export function toTwd(amount: number, currency: string, date: string, rates: readonly FxRate[]): Converted {
  const rate = rateFor(rates, currency, date);
  if (rate === undefined) return { twd: 0, missingRate: true };
  return { twd: amount * rate, missingRate: false };
}
