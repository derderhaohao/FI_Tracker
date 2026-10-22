import type { TaiwanSettings } from '../entities';

/**
 * Starting values from the PRD (section "Taiwan-specific requirements").
 * They come from general knowledge and must be checked against current rules;
 * the Settings screen shows the as-of date.
 */
export function defaultTaiwanSettings(): TaiwanSettings {
  return {
    asOf: '2026-10-22',
    marginalTaxRate: 0.12,
    laborPension: {
      employerRate: 0.06,
      voluntaryRate: 0,
      maxVoluntaryRate: 0.06,
      accessAge: 60,
      minYearsForMonthly: 15,
      monthlyInsuredWageMinor: 0,
      wageCapMinor: 150_000_00,
    },
    laborInsurance: {
      enabled: true,
      claimAge: 65,
      maxYearsEarly: 5,
      maxYearsDelay: 5,
      adjustmentPerYear: 0.04,
      insuredYearsToDate: 0,
      minYearsForAnnuity: 15,
      avgMonthlyInsuredSalaryMinor: 0,
      salaryCapMinor: 45_800_00,
      rateA: 0.00775,
      flatAMinor: 3_000_00,
      rateB: 0.0155,
      haircut: 0,
    },
    nhi: {
      supplementaryRate: 0.0211,
      supplementaryThresholdMinor: 20_000_00,
      dividendPaymentsPerYear: 4,
    },
    dividendTax: {
      mode: 'best',
      creditRate: 0.085,
      creditCapMinor: 80_000_00,
      separateRate: 0.28,
    },
    usWithholdingRate: 0.3,
    amtOverseasThresholdMinor: 1_000_000_00,
  };
}
