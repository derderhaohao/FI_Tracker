import { z } from 'zod';

/**
 * Zod schemas for the twelve PRD entities. They are shared by the database layer,
 * the forms, the JSON backup import and the migrations.
 *
 * Conventions: money is stored as integer minor units (×100) next to a currency code,
 * percentages as decimals (0.04 = 4%), months as `YYYY-MM` and days as `YYYY-MM-DD`.
 */

export const ASSET_CLASSES = [
  'cash',
  'tw_equity',
  'us_equity',
  'global_equity',
  'bond',
  'property',
  'other',
] as const;
export const ACCOUNT_TYPES = ['cash', 'brokerage', 'pension', 'insurance', 'property', 'liability'] as const;

export const assetClassSchema = z.enum(ASSET_CLASSES);
export const accountTypeSchema = z.enum(ACCOUNT_TYPES);
export type AssetClass = z.infer<typeof assetClassSchema>;
export type AccountType = z.infer<typeof accountTypeSchema>;

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  cash: 'Cash',
  tw_equity: 'TW equity',
  us_equity: 'US equity',
  global_equity: 'Global equity',
  bond: 'Bonds',
  property: 'Property',
  other: 'Other',
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Cash',
  brokerage: 'Brokerage',
  pension: 'Pension',
  insurance: 'Insurance',
  property: 'Property',
  liability: 'Liability',
};

const idSchema = z.string().min(1);
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const monthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM');
export const currencySchema = z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code');
const minorSchema = z.number().int();
const rateSchema = z.number().min(-1).max(10);
const ageSchema = z.number().int().min(0).max(120);

const audit = {
  createdAt: z.string(),
  updatedAt: z.string(),
};

export type Currency = string;

// ---------- Settings ----------

export const allocationSchema = z.partialRecord(assetClassSchema, z.number().min(0).max(1));
export type Allocation = Partial<Record<AssetClass, number>>;

export const fiTierSchema = z.enum(['lean', 'full', 'fat']);
export type FiTier = z.infer<typeof fiTierSchema>;

export const destinationSettingsSchema = z.object({
  fiTier: fiTierSchema,
  fatMultiplier: z.number().min(1).max(5),
  targetFiAge: ageSchema.optional(),
  /** Self-paid NHI premium once no longer employed (DST-5). */
  nhiMonthlyMinor: minorSchema.min(0),
  privateInsuranceAnnualMinor: minorSchema.min(0),
  healthcareReserveAnnualMinor: minorSchema.min(0),
});
export type DestinationSettings = z.infer<typeof destinationSettingsSchema>;

export const alertSettingsSchema = z.object({
  targetSavingsRate: z.number().min(0).max(1),
  allocationDriftThreshold: z.number().min(0).max(1),
  emergencyFundMonths: z.number().min(0).max(60),
});
export type AlertSettings = z.infer<typeof alertSettingsSchema>;

export const settingsSchema = z.object({
  id: z.literal('singleton'),
  baseCurrency: z.literal('TWD'),
  birthYear: z.number().int().min(1900).max(2100),
  horizonAge: z.number().int().min(50).max(120),
  defaultSwr: z.number().min(0.025).max(0.05),
  snapshotCadence: z.enum(['monthly', 'quarterly']),
  activeAssumptionSetId: z.string().optional(),
  /** Target allocation for new savings and the allocation-drift alert. */
  targetAllocation: allocationSchema,
  destination: destinationSettingsSchema,
  alerts: alertSettingsSchema,
  lastBackupAt: z.string().optional(),
  /** True after a snapshot is saved and before the next backup. */
  snapshotSinceBackup: z.boolean(),
  ...audit,
});
export type Settings = z.infer<typeof settingsSchema>;

// ---------- Position ----------

export const accountSchema = z.object({
  id: idSchema,
  nickname: z.string().min(1).max(80),
  institution: z.string().max(80),
  type: accountTypeSchema,
  assetClass: assetClassSchema,
  currency: currencySchema,
  investable: z.boolean(),
  accessAge: ageSchema.optional(),
  archived: z.boolean(),
  ...audit,
});
export type Account = z.infer<typeof accountSchema>;

export const snapshotSchema = z.object({
  id: idSchema,
  date: isoDateSchema,
  accountId: idSchema,
  /** Native currency; for liability accounts this is the amount owed (positive). */
  balanceMinor: minorSchema,
  note: z.string().max(500).optional(),
  ...audit,
});
export type Snapshot = z.infer<typeof snapshotSchema>;

export const fxRateSchema = z.object({
  id: idSchema,
  date: isoDateSchema,
  currency: currencySchema,
  /** TWD per 1 unit of the foreign currency. */
  twdPerUnit: z.number().positive(),
  ...audit,
});
export type FxRate = z.infer<typeof fxRateSchema>;

export const holdingSchema = z.object({
  id: idSchema,
  date: isoDateSchema,
  accountId: idSchema,
  ticker: z.string().min(1).max(20),
  units: z.number().min(0),
  priceMinor: minorSchema.min(0),
  currency: currencySchema,
  ...audit,
});
export type Holding = z.infer<typeof holdingSchema>;

export const liabilitySchema = z.object({
  accountId: idSchema,
  interestRate: z.number().min(0).max(1),
  monthlyPaymentMinor: minorSchema.min(0),
  remainingMonths: z.number().int().min(0).max(1200),
  ...audit,
});
export type Liability = z.infer<typeof liabilitySchema>;

// ---------- Engine ----------

export const categorySchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(80),
  kind: z.enum(['income', 'expense']),
  essential: z.boolean(),
  /** Annual FI-phase spending for this category, in TWD minor units (expense only). */
  fiAnnualMinor: minorSchema.min(0).optional(),
  ...audit,
});
export type Category = z.infer<typeof categorySchema>;

export const cashFlowSchema = z.object({
  id: idSchema,
  month: monthSchema,
  categoryId: idSchema,
  /** Always positive; the category kind says whether it is income or expense. */
  amountMinor: minorSchema.min(0),
  currency: currencySchema,
  lumpSum: z.boolean(),
  note: z.string().max(500).optional(),
  ...audit,
});
export type CashFlow = z.infer<typeof cashFlowSchema>;

// ---------- Destination ----------

export const incomeStreamSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(80),
  startAge: ageSchema,
  endAge: ageSchema.optional(),
  /** Annual amount in today's TWD (minor units). */
  annualMinor: minorSchema.min(0),
  inflationLinked: z.boolean(),
  ...audit,
});
export type IncomeStream = z.infer<typeof incomeStreamSchema>;

// ---------- Assumptions ----------

export const taiwanSettingsSchema = z.object({
  /** Date the values below were last checked against current rules. */
  asOf: isoDateSchema,
  /** Marginal income tax rate: tax saving on voluntary 勞退 and combined dividend taxation. */
  marginalTaxRate: z.number().min(0).max(0.6),
  laborPension: z.object({
    employerRate: z.number().min(0).max(0.2),
    voluntaryRate: z.number().min(0).max(0.06),
    maxVoluntaryRate: z.number().min(0).max(0.2),
    accessAge: ageSchema,
    minYearsForMonthly: z.number().int().min(0).max(50),
    monthlyInsuredWageMinor: minorSchema.min(0),
    wageCapMinor: minorSchema.min(0),
  }),
  laborInsurance: z.object({
    enabled: z.boolean(),
    claimAge: ageSchema,
    maxYearsEarly: z.number().int().min(0).max(10),
    maxYearsDelay: z.number().int().min(0).max(10),
    adjustmentPerYear: z.number().min(0).max(0.2),
    insuredYearsToDate: z.number().min(0).max(60),
    minYearsForAnnuity: z.number().int().min(0).max(50),
    avgMonthlyInsuredSalaryMinor: minorSchema.min(0),
    salaryCapMinor: minorSchema.min(0),
    /** Formula A: salary × years × rateA + flatA; formula B: salary × years × rateB. */
    rateA: z.number().min(0).max(0.1),
    flatAMinor: minorSchema.min(0),
    rateB: z.number().min(0).max(0.1),
    /** Haircut for a fund-solvency scenario (0.2 = 20% lower annuity). */
    haircut: z.number().min(0).max(1),
  }),
  nhi: z.object({
    supplementaryRate: z.number().min(0).max(0.2),
    supplementaryThresholdMinor: minorSchema.min(0),
    dividendPaymentsPerYear: z.number().int().min(1).max(12),
  }),
  dividendTax: z.object({
    mode: z.enum(['combined', 'separate', 'best']),
    creditRate: z.number().min(0).max(1),
    creditCapMinor: minorSchema.min(0),
    separateRate: z.number().min(0).max(1),
  }),
  usWithholdingRate: z.number().min(0).max(1),
  amtOverseasThresholdMinor: minorSchema.min(0),
});
export type TaiwanSettings = z.infer<typeof taiwanSettingsSchema>;

export const assetAssumptionSchema = z.object({
  assetClass: assetClassSchema,
  /** Nominal expected annual return, before fees. */
  expectedReturn: rateSchema,
  volatility: z.number().min(0).max(2),
  fee: z.number().min(0).max(0.2),
  dividendYield: z.number().min(0).max(0.5),
});
export type AssetAssumption = z.infer<typeof assetAssumptionSchema>;

export const assumptionSetSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(80),
  assets: z.array(assetAssumptionSchema),
  /** Keyed by `a|b` with the two asset classes in ASSET_CLASSES order. */
  correlations: z.record(z.string(), z.number().min(-1).max(1)),
  inflation: rateSchema,
  inflationVolatility: z.number().min(0).max(1),
  /** Nominal annual salary growth. */
  salaryGrowth: rateSchema,
  /** Annual change of TWD per unit of foreign currency (negative = TWD strengthens). */
  fxDrift: rateSchema,
  fxVolatility: z.number().min(0).max(1),
  taiwan: taiwanSettingsSchema,
  ...audit,
});
export type AssumptionSet = z.infer<typeof assumptionSetSchema>;

// ---------- Strategy Lab ----------

export const incomeChangeSchema = z.object({
  label: z.string().max(80),
  fromAge: ageSchema,
  toAge: ageSchema.optional(),
  /** Net annual income in today's TWD during the period (0 = career break). */
  annualIncomeMinor: minorSchema.min(0),
});
export type IncomeChange = z.infer<typeof incomeChangeSchema>;

export const scenarioLeversSchema = z.object({
  annualIncomeMinor: minorSchema.min(0).optional(),
  currentSpendingMinor: minorSchema.min(0).optional(),
  savingsRate: z.number().min(-1).max(1).optional(),
  fiTier: fiTierSchema.optional(),
  fiSpendingMinor: minorSchema.min(0).optional(),
  /** Multiplies current and FI spending (1.1 = +10%). */
  spendingMultiplier: z.number().min(0).max(5).optional(),
  incomeChanges: z.array(incomeChangeSchema).optional(),
  allocation: allocationSchema.optional(),
  /** Stop working at this age, whether or not FI has been reached. */
  targetFiAge: ageSchema.optional(),
  baristaIncome: z.object({ annualMinor: minorSchema.min(0), untilAge: ageSchema }).optional(),
  laborPensionVoluntaryRate: z.number().min(0).max(0.06).optional(),
  laborInsuranceClaimAge: ageSchema.optional(),
  laborInsuranceHaircut: z.number().min(0).max(1).optional(),
  swr: z.number().min(0.01).max(0.1).optional(),
  /** Added to every asset class's expected return (sensitivity). */
  returnShift: z.number().min(-0.2).max(0.2).optional(),
});
export type ScenarioLevers = z.infer<typeof scenarioLeversSchema>;

export const scenarioEventSchema = z.object({
  date: isoDateSchema,
  /** Positive = money in (inheritance), negative = money out (home down payment). */
  amountMinor: minorSchema,
  description: z.string().max(200),
});
export type ScenarioEvent = z.infer<typeof scenarioEventSchema>;

export const withdrawalRuleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fixed_swr') }),
  z.object({
    kind: z.literal('guardrails'),
    band: z.number().min(0).max(1),
    step: z.number().min(0).max(1),
  }),
  z.object({ kind: z.literal('fixed_percentage'), rate: z.number().min(0).max(0.2) }),
  z.object({ kind: z.literal('dividend') }),
]);
export type WithdrawalRule = z.infer<typeof withdrawalRuleSchema>;

export const lockedPlanPointSchema = z.object({
  year: z.number().int(),
  age: z.number().int(),
  investable: z.number(),
  savings: z.number(),
  spending: z.number(),
});
export type LockedPlanPoint = z.infer<typeof lockedPlanPointSchema>;

export const scenarioSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(80),
  assumptionSetId: idSchema,
  overrides: scenarioLeversSchema,
  events: z.array(scenarioEventSchema),
  withdrawalRule: withdrawalRuleSchema,
  isPlanOfRecord: z.boolean(),
  /** Monte Carlo seed, so reruns are reproducible. */
  seed: z.number().int(),
  notes: z.string().max(2000).optional(),
  /** Set when the scenario is locked as plan of record (FBK-3). */
  lockedAt: z.string().optional(),
  lockedProjection: z.array(lockedPlanPointSchema).optional(),
  ...audit,
});
export type Scenario = z.infer<typeof scenarioSchema>;

// ---------- Feedback loop ----------

export const reviewTypeSchema = z.enum(['monthly', 'quarterly', 'annual']);
export type ReviewType = z.infer<typeof reviewTypeSchema>;

export const reviewSchema = z.object({
  id: idSchema,
  date: isoDateSchema,
  type: reviewTypeSchema,
  planOfRecordId: z.string().optional(),
  notes: z.string().max(10000),
  decisions: z.array(z.string().max(500)),
  checklist: z.record(z.string(), z.boolean()),
  ...audit,
});
export type Review = z.infer<typeof reviewSchema>;

/** Strips audit fields, for inputs where the repository stamps them. */
export type Draft<T> = Omit<T, 'createdAt' | 'updatedAt'>;
