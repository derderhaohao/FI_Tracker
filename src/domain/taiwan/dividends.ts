import type { TaiwanSettings } from '../entities';
import { fromMinor } from '../money';

/**
 * Tax on domestic dividends D (TWD, nominal) for one year.
 * Combined: taxed at the marginal rate with a credit of creditRate × D, capped.
 * Separate: flat separateRate. 'best' picks the lower one.
 * The result can be negative under combined taxation (a refund).
 */
export function domesticDividendTax(D: number, t: TaiwanSettings): number {
  if (D <= 0) return 0;
  const credit = Math.min(D * t.dividendTax.creditRate, fromMinor(t.dividendTax.creditCapMinor));
  const combined = D * t.marginalTaxRate - credit;
  const separate = D * t.dividendTax.separateRate;
  switch (t.dividendTax.mode) {
    case 'combined':
      return combined;
    case 'separate':
      return separate;
    case 'best':
      return Math.min(combined, separate);
  }
}

/** NHI supplementary premium on dividends D, paid in `dividendPaymentsPerYear` equal instalments. */
export function nhiSupplementaryPremium(D: number, t: TaiwanSettings): number {
  if (D <= 0) return 0;
  const single = D / t.nhi.dividendPaymentsPerYear;
  if (single < fromMinor(t.nhi.supplementaryThresholdMinor)) return 0;
  return D * t.nhi.supplementaryRate;
}

/** US dividend withholding for Taiwan residents. */
export function usWithholding(D: number, t: TaiwanSettings): number {
  return Math.max(0, D) * t.usWithholdingRate;
}

/**
 * True when overseas income must be counted in basic income for the basic income tax (AMT):
 * once it reaches the threshold, all of it counts. Tax is due only if total basic income
 * also exceeds the basic exemption, so this is a flag, not a tax.
 */
export function amtFlag(overseasIncome: number, t: TaiwanSettings): boolean {
  return overseasIncome >= fromMinor(t.amtOverseasThresholdMinor);
}
