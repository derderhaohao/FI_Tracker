import { z } from 'zod';
import { t } from '@/i18n';

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

/** Where an account's money is invested (PRD playback, DM-3). */
export const REGIONS = ['TW', 'US', 'JP', 'EU', 'EM', 'Global'] as const;
export type Region = (typeof REGIONS)[number];
export const REGION_LABELS: Record<Region, string> = {
  TW: t('Taiwan'),
  US: 'US',
  JP: t('Japan'),
  EU: t('Europe'),
  EM: t('China/EM'),
  Global: t('Global'),
};
export const regionSchema = z.enum(REGIONS);

/** Property location (DM-5). */
export const LOCATIONS = ['taipei', 'taichung', 'kaohsiung', 'other_tw', 'tokyo', 'other_jp', 'us'] as const;
export type PropertyLocation = (typeof LOCATIONS)[number];
export const LOCATION_LABELS: Record<PropertyLocation, string> = {
  taipei: t('Taipei / New Taipei'),
  taichung: t('Taichung'),
  kaohsiung: t('Kaohsiung'),
  other_tw: t('Other Taiwan'),
  tokyo: t('Tokyo'),
  other_jp: t('Other Japan'),
  us: 'US',
};
export const locationSchema = z.enum(LOCATIONS);

/** A fund's split by region, as shares summing to 1 (DM-4). */
export const exposureSchema = z.partialRecord(
  z.enum(['TW', 'US', 'JP', 'EU', 'EM', 'Other']),
  z.number().min(0).max(1),
);
export type Exposure = z.infer<typeof exposureSchema>;
export const accountTypeSchema = z.enum(ACCOUNT_TYPES);
export type AssetClass = z.infer<typeof assetClassSchema>;
export type AccountType = z.infer<typeof accountTypeSchema>;

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  cash: t('Cash'),
  tw_equity: t('TW equity'),
  us_equity: t('US equity'),
  global_equity: t('Global equity'),
  bond: t('Bonds'),
  property: t('Property'),
  other: t('Other'),
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: t('Cash'),
  brokerage: t('Brokerage'),
  pension: t('Pension'),
  insurance: t('Insurance'),
  property: t('Property'),
  liability: t('Liability'),
};

const idSchema = z.string().min(1);
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t('Use YYYY-MM-DD'));
export const monthSchema = z.string().regex(/^\d{4}-\d{2}$/, t('Use YYYY-MM'));
export const currencySchema = z.string().regex(/^[A-Z]{3}$/, t('Use a 3-letter currency code'));
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

// ---------- Projection playback ----------

export const severitySchema = z.enum(['mild', 'typical', 'severe']);
export type Severity = z.infer<typeof severitySchema>;

export const playbackSettingsSchema = z.object({
  /** 勞退 fund mix for stories (DM-7), shares summing to 1. */
  pensionMix: z.object({ tw_equity: z.number(), global_equity: z.number(), bond: z.number() }),
  /** 勞退 guaranteed minimum yearly return, applied to the balance when it unlocks. */
  pensionFloor: z.number().min(0).max(0.1),
  /** Pause for 3 seconds at each event start. */
  autoPause: z.boolean(),
  /** Pause when an event is fired live. */
  pauseOnFire: z.boolean(),
  /** Up to 6 pinned palette events. */
  favourites: z.array(z.string()).max(6),
});
export type PlaybackSettings = z.infer<typeof playbackSettingsSchema>;

export const storyEventSchema = z.object({
  uid: z.string(),
  eventId: z.string(),
  /** Months from the start of the projection. */
  start: z.number().int().min(0).max(1500),
  severity: severitySchema,
  source: z.enum(['scheduled', 'live']),
  /** Overrides an event's amount (lump sums, TWD) or pay change (multiplier). */
  amount: z.number().optional(),
});
export type StoryEvent = z.infer<typeof storyEventSchema>;

export const behaviourSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('keep') }),
  z.object({ kind: z.literal('pause') }),
  z.object({ kind: z.literal('sell'), fall: z.number().min(0.05).max(0.9) }),
]);
export type Behaviour = z.infer<typeof behaviourSchema>;

export const storySchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(80),
  backdrop: z.string(),
  events: z.array(storyEventSchema).max(50),
  behaviour: behaviourSchema,
  /** Seed for market noise; no noise when absent. */
  noiseSeed: z.number().int().optional(),
});
export type Story = z.infer<typeof storySchema>;

export const levelShockSchema = z.object({
  factor: z.string(),
  d: z.number().min(-5).max(0.95),
  a: z.number().min(0).max(600),
  h: z.number().min(0).max(600),
  r: z.number().min(0).max(1200),
  p: z.number().min(0).max(1),
});

export const customEventSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(60),
  story: z.string().max(200),
  shocks: z.array(levelShockSchema).min(1).max(12),
});
export type CustomEvent = z.infer<typeof customEventSchema>;

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
  /** A backup prompt is waiting: after setup or after a review (cleared by a backup or "later"). */
  backupPrompt: z.enum(['setup', 'review']).optional(),
  /** Monthly totals per category (default) or individual dated transactions (ENG-2). */
  cashFlowMode: z.enum(['monthly', 'transactions']),
  /** Projection playback preferences. */
  playback: playbackSettingsSchema.optional(),
  /** Saved playback stories (SC-8, LE-12). */
  stories: z.array(storySchema).max(100).optional(),
  /** Custom events from the event builder (SC-9). */
  customEvents: z.array(customEventSchema).max(50).optional(),
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
  /** Region for playback stories; derived from class and currency when absent. */
  region: regionSchema.optional(),
  /** Region split for global funds; a preset when absent. */
  exposure: exposureSchema.optional(),
  /** Property location; derived from currency when absent. */
  location: locationSchema.optional(),
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
  /** Floating rate: follows rate shocks in playback stories (DM-6). */
  floating: z.boolean().optional(),
  /** The property this loan is secured on. */
  propertyAccountId: idSchema.optional(),
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
  /** Set for individual transactions (transaction mode, CSV import); absent for monthly totals. */
  date: isoDateSchema.optional(),
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
  baristaIncome: z
    .object({
      annualMinor: minorSchema.min(0),
      untilAge: ageSchema,
      /** False: don't count it towards reaching the target (stop no earlier because of it). */
      inTarget: z.boolean().optional(),
    })
    .optional(),
  /** When stopping at FI: keep working this many years after first reaching the target. */
  workExtraYears: z.number().int().min(0).max(30).optional(),
  /** Size the money-needed target on this yearly spending instead of FI spending. */
  targetSpendingMinor: minorSchema.min(0).optional(),
  laborPensionVoluntaryRate: z.number().min(0).max(0.06).optional(),
  laborInsuranceClaimAge: ageSchema.optional(),
  laborInsuranceHaircut: z.number().min(0).max(1).optional(),
  swr: z.number().min(0.01).max(0.1).optional(),
  /** Added to every asset class's expected return (sensitivity). */
  returnShift: z.number().min(-0.2).max(0.2).optional(),
  /** World events from the playback library, injected into every simulated future (EN-8). */
  stressEvents: z
    .array(
      z.object({
        eventId: z.string(),
        timing: z.enum(['afterStop', 'year']),
        /** Years from now when timing is 'year'. */
        years: z.number().int().min(0).max(80).optional(),
        severity: severitySchema,
      }),
    )
    .max(5)
    .optional(),
  /** Stress test: equities fall by `drop` in total over the first `years` years after stopping work. */
  crash: z.object({ drop: z.number().min(0).max(0.9), years: z.number().int().min(1).max(5) }).optional(),
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

// ---------- Goal history (DST-7) ----------

/** The goal as it stood on a day; one record per day, the latest change wins. */
export const goalSnapshotSchema = z.object({
  id: idSchema,
  date: isoDateSchema,
  fiTier: fiTierSchema,
  /** Annual FI spending for the plan tier, TWD minor units. */
  fiSpendingMinor: minorSchema.min(0),
  guaranteedIncomeMinor: minorSchema.min(0),
  swr: z.number().min(0).max(1),
  fiNumberMinor: minorSchema.min(0),
  targetFiAge: ageSchema.optional(),
  ...audit,
});
export type GoalSnapshot = z.infer<typeof goalSnapshotSchema>;

/** Strips audit fields, for inputs where the repository stamps them. */
export type Draft<T> = Omit<T, 'createdAt' | 'updatedAt'>;
