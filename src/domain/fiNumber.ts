import type { Category, DestinationSettings, FiTier } from './entities';
import { fromMinor } from './money';

export interface FiSpending {
  /** Essentials only. */
  lean: number;
  /** Current lifestyle: all FI-phase categories. */
  full: number;
  /** Full × fat multiplier. */
  fat: number;
  /** Post-employment costs added to every tier (NHI, private insurance, healthcare reserve). */
  postEmployment: number;
}

/** Post-employment costs per year (DST-5), in TWD. */
export function postEmploymentCosts(d: DestinationSettings): number {
  return (
    fromMinor(d.nhiMonthlyMinor) * 12 +
    fromMinor(d.privateInsuranceAnnualMinor) +
    fromMinor(d.healthcareReserveAnnualMinor)
  );
}

/** Annual FI-phase spending S per tier (DST-1, DST-2), each including post-employment costs. */
export function fiSpendingByTier(categories: readonly Category[], d: DestinationSettings): FiSpending {
  let essential = 0;
  let all = 0;
  for (const c of categories) {
    if (c.kind !== 'expense' || c.fiAnnualMinor === undefined) continue;
    const v = fromMinor(c.fiAnnualMinor);
    all += v;
    if (c.essential) essential += v;
  }
  const post = postEmploymentCosts(d);
  return {
    lean: essential + post,
    full: all + post,
    fat: all * d.fatMultiplier + post,
    postEmployment: post,
  };
}

export function spendingForTier(s: FiSpending, tier: FiTier): number {
  return s[tier];
}

/** FI number = (S − G) ÷ SWR, never negative. */
export function fiNumber(annualSpending: number, guaranteedIncome: number, swr: number): number {
  if (swr <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, (annualSpending - guaranteedIncome) / swr);
}

/** Real return from nominal n and inflation π: (1 + n) / (1 + π) − 1. */
export function realReturn(nominal: number, inflation: number): number {
  return (1 + nominal) / (1 + inflation) - 1;
}

/**
 * Years to FI with current investable P, annual savings s, target T and real return r:
 * n = ln((T·r + s) / (P·r + s)) / ln(1 + r). Infinity when the target is never reached.
 */
export function yearsToFi(P: number, s: number, T: number, r: number): number {
  if (P >= T) return 0;
  if (Math.abs(r) < 1e-12) return s > 0 ? (T - P) / s : Number.POSITIVE_INFINITY;
  const num = T * r + s;
  const den = P * r + s;
  if (num <= 0 || den <= 0 || num / den <= 0) return Number.POSITIVE_INFINITY;
  const n = Math.log(num / den) / Math.log(1 + r);
  return Number.isFinite(n) && n >= 0 ? n : Number.POSITIVE_INFINITY;
}

/** Coast FI: amount invested today that grows to T by the target age with no more contributions. */
export function coastFi(T: number, r: number, years: number): number {
  if (years <= 0) return T;
  return T / Math.pow(1 + r, years);
}

/**
 * Annual savings needed to grow P to T in `years` at real return r (DST-6).
 * Zero when P already gets there on its own.
 */
export function requiredAnnualSavings(P: number, T: number, r: number, years: number): number {
  if (years <= 0) return Math.max(0, T - P);
  if (Math.abs(r) < 1e-12) return Math.max(0, (T - P) / years);
  const growth = Math.pow(1 + r, years);
  const gap = T - P * growth;
  if (gap <= 0) return 0;
  return (gap * r) / (growth - 1);
}

export interface GuaranteedStream {
  startAge: number;
  endAge?: number;
  /** Real annual amount once it starts. */
  annual: number;
}

/**
 * Guaranteed income G counted in the FI number: streams that start at some point and
 * run to the horizon. Temporary streams are handled by `bridgeAdjustment`.
 */
export function permanentIncome(streams: readonly GuaranteedStream[], horizonAge: number): number {
  return streams
    .filter((s) => s.endAge === undefined || s.endAge >= horizonAge)
    .reduce((a, s) => a + s.annual, 0);
}

/** Real income from all streams active at `age`. */
export function activeIncome(streams: readonly GuaranteedStream[], age: number): number {
  let sum = 0;
  for (const s of streams) {
    if (age >= s.startAge && (s.endAge === undefined || age < s.endAge)) sum += s.annual;
  }
  return sum;
}

/**
 * Bridge fund on top of the FI number when retiring at `fiAge` (PRD: calculations):
 * for each year from `fiAge` to the horizon, the guaranteed income G that has not
 * started yet must come from the portfolio; income above G (e.g. part-time work)
 * lowers the need. Undiscounted, so it is slightly conservative.
 */
export function bridgeAdjustment(
  streams: readonly GuaranteedStream[],
  fiAge: number,
  horizonAge: number,
): number {
  const G = permanentIncome(streams, horizonAge);
  let total = 0;
  for (let age = fiAge; age < horizonAge; age++) {
    total += G - activeIncome(streams, age);
  }
  return total;
}

/** FI target when retiring at `fiAge`: FI number plus bridge fund, never negative. */
export function fiTarget(
  spending: number,
  streams: readonly GuaranteedStream[],
  swr: number,
  fiAge: number,
  horizonAge: number,
): number {
  const G = permanentIncome(streams, horizonAge);
  return Math.max(0, fiNumber(spending, G, swr) + bridgeAdjustment(streams, fiAge, horizonAge));
}
