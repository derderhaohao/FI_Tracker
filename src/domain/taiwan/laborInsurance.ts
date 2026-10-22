import type { TaiwanSettings } from '../entities';
import { fromMinor } from '../money';

type LaborInsurance = TaiwanSettings['laborInsurance'];

/**
 * 勞保 old-age annuity per month at the normal claim age: the larger of
 * formula A (salary × years × rateA + flatA) and formula B (salary × years × rateB).
 * Zero when insured years are below the minimum for an annuity.
 */
export function laborInsuranceMonthly(li: LaborInsurance, insuredYears: number): number {
  if (insuredYears < li.minYearsForAnnuity) return 0;
  const salary = Math.min(fromMinor(li.avgMonthlyInsuredSalaryMinor), fromMinor(li.salaryCapMinor));
  if (salary <= 0) return 0;
  const a = salary * insuredYears * li.rateA + fromMinor(li.flatAMinor);
  const b = salary * insuredYears * li.rateB;
  return Math.max(a, b);
}

/** Clamps a requested claim age to the allowed early / delayed window. */
export function clampClaimAge(li: LaborInsurance, claimAge: number): number {
  return Math.min(Math.max(claimAge, li.claimAge - li.maxYearsEarly), li.claimAge + li.maxYearsDelay);
}

/** Multiplier for claiming early (−rate per year) or late (+rate per year). */
export function claimAdjustment(li: LaborInsurance, claimAge: number): number {
  const age = clampClaimAge(li, claimAge);
  return 1 + (age - li.claimAge) * li.adjustmentPerYear;
}

/** Annual annuity in today's TWD, after claim-age adjustment and solvency haircut. */
export function laborInsuranceAnnual(
  li: LaborInsurance,
  insuredYears: number,
  claimAge = li.claimAge,
  haircut = li.haircut,
): number {
  return laborInsuranceMonthly(li, insuredYears) * 12 * claimAdjustment(li, claimAge) * (1 - haircut);
}
