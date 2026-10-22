import type { TaiwanSettings } from '../entities';
import { fromMinor } from '../money';

export interface PensionContribution {
  /** Employer contribution per year (TWD). */
  employer: number;
  /** Voluntary contribution per year (TWD), deducted from take-home pay. */
  voluntary: number;
  /** Income tax saved per year on the voluntary part. */
  taxSaving: number;
}

/** 勞退 (new system) contributions per year at the given voluntary rate. */
export function laborPensionContribution(
  t: TaiwanSettings,
  voluntaryRate = t.laborPension.voluntaryRate,
): PensionContribution {
  const p = t.laborPension;
  const wage = Math.min(fromMinor(p.monthlyInsuredWageMinor), fromMinor(p.wageCapMinor));
  const rate = Math.min(Math.max(voluntaryRate, 0), p.maxVoluntaryRate);
  const voluntary = wage * rate * 12;
  return {
    employer: wage * p.employerRate * 12,
    voluntary,
    taxSaving: voluntary * t.marginalTaxRate,
  };
}

/** Monthly payout needs at least `minYearsForMonthly` years of contributions; otherwise a lump sum. */
export function laborPensionPayoutType(t: TaiwanSettings, yearsContributed: number): 'monthly' | 'lump_sum' {
  return yearsContributed >= t.laborPension.minYearsForMonthly ? 'monthly' : 'lump_sum';
}
