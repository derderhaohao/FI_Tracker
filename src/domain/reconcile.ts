import type { AssetAssumption, AssetClass, FxRate } from './entities';
import { savingsBetween, type MonthTotals } from './cashflow';
import { monthOf } from './dates';
import { attributeChange, type ChangeAttribution, type NetWorth } from './networth';

export interface Reconciliation {
  /** Market return implied by the data is outside the plausible range. */
  flagged: boolean;
  expectedLow: number;
  expectedHigh: number;
  months: number;
}

/** Whole months between two dates' months (at least 1). */
export function monthsBetween(from: string, to: string): number {
  const [y0, m0] = from.split('-').map(Number);
  const [y1, m1] = to.split('-').map(Number);
  return Math.max(1, (y1 - y0) * 12 + (m1 - m0));
}

/**
 * Reconciliation check (ENG-6): the market return left over after savings and FX
 * should fall within `sigmas` standard deviations of what the assets could earn
 * over the period. Volatilities are added as if fully correlated (a wide band), plus
 * a small tolerance, so only clear mismatches are flagged: a missing cash-flow
 * entry, a mistyped balance, or a transfer that was not recorded.
 */
export function reconcile(
  attribution: ChangeAttribution,
  prev: NetWorth,
  assets: readonly AssetAssumption[],
  sigmas = 3,
): Reconciliation {
  const months = monthsBetween(attribution.from, attribution.to);
  const t = months / 12;
  const byClass = new Map<AssetClass, AssetAssumption>(assets.map((a) => [a.assetClass, a]));
  let mean = 0;
  let sd = 0;
  let exposed = 0;
  for (const b of prev.balances) {
    if (b.bucket === 'liability' || b.twd <= 0) continue;
    const a = byClass.get(b.account.assetClass);
    exposed += b.twd;
    if (!a) continue;
    mean += b.twd * (a.expectedReturn - a.fee) * t;
    sd += b.twd * a.volatility * Math.sqrt(t);
  }
  const tolerance = Math.max(10_000, exposed * 0.005);
  const expectedLow = mean - sigmas * sd - tolerance;
  const expectedHigh = mean + sigmas * sd + tolerance;
  return {
    flagged: attribution.marketReturn < expectedLow || attribution.marketReturn > expectedHigh,
    expectedLow,
    expectedHigh,
    months,
  };
}

export interface PeriodChange extends ChangeAttribution {
  /** Undefined when the period has no cash-flow data to reconcile against. */
  check?: Reconciliation;
}

/** Change attribution and reconciliation for each pair of consecutive snapshots (POS-7, ENG-6). */
export function periodChanges(
  series: readonly NetWorth[],
  totals: readonly MonthTotals[],
  fxRates: readonly FxRate[],
  assets: readonly AssetAssumption[],
): PeriodChange[] {
  return series.slice(1).map((curr, i) => {
    const prev = series[i];
    const from = monthOf(prev.date);
    const to = monthOf(curr.date);
    const contributions = savingsBetween(totals, from, to);
    const attribution = attributeChange(prev, curr, contributions, fxRates);
    const hasCashFlow = totals.some((t) => t.month > from && t.month <= to);
    return { ...attribution, check: hasCashFlow ? reconcile(attribution, prev, assets) : undefined };
  });
}
