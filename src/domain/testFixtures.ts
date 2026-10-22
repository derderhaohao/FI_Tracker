import { ASSET_CLASSES, type Account, type AssumptionSet, type Settings } from './entities';
import { defaultAssumptionSet } from './assumptions';
import type { ProjectionInput } from './projection';
import { defaultTaiwanSettings } from './taiwan/defaults';

const stamp = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };

/** A plain projection input: one TWD cash bucket, no Taiwan frictions, no streams. */
export function makeInput(patch: Partial<ProjectionInput> = {}): ProjectionInput {
  const taiwan = defaultTaiwanSettings();
  taiwan.laborInsurance.enabled = false;
  return {
    startYear: 2026,
    startAge: 40,
    horizonAge: 95,
    liquid: [{ assetClass: 'cash', currency: 'TWD', value: 1_000_000 }],
    locked: [],
    nonInvestable: [],
    liabilities: [],
    annualIncome: 0,
    incomeChanges: [],
    currentSpending: 0,
    fiSpending: 400_000,
    streams: [],
    pension: { employer: 0, voluntary: 0, liquidDelta: 0, accessAge: 60 },
    swr: 0.04,
    withdrawalRule: { kind: 'fixed_swr' },
    allocation: ASSET_CLASSES.map((c) => (c === 'cash' ? 1 : 0)),
    rebalance: false,
    assets: ASSET_CLASSES.map((c) => ({
      assetClass: c,
      expectedReturn: 0,
      volatility: 0,
      fee: 0,
      dividendYield: 0,
    })),
    returnShift: 0,
    correlations: ASSET_CLASSES.map((_, i) => ASSET_CLASSES.map((__, j) => (i === j ? 1 : 0))),
    inflation: 0,
    inflationVolatility: 0,
    salaryGrowth: 0,
    fxDrift: 0,
    fxVolatility: 0,
    events: [],
    taiwan,
    ...patch,
  };
}

/** Sets the expected nominal return of one class. */
export function withReturn(
  input: ProjectionInput,
  assetClass: string,
  expectedReturn: number,
  volatility = 0,
): ProjectionInput {
  return {
    ...input,
    assets: input.assets.map((a) => (a.assetClass === assetClass ? { ...a, expectedReturn, volatility } : a)),
  };
}

export function makeSettings(patch: Partial<Settings> = {}): Settings {
  return {
    id: 'singleton',
    baseCurrency: 'TWD',
    birthYear: 1990,
    horizonAge: 95,
    defaultSwr: 0.04,
    snapshotCadence: 'monthly',
    targetAllocation: { cash: 0.1, tw_equity: 0.3, us_equity: 0.4, global_equity: 0.1, bond: 0.1 },
    destination: {
      fiTier: 'full',
      fatMultiplier: 1.3,
      nhiMonthlyMinor: 0,
      privateInsuranceAnnualMinor: 0,
      healthcareReserveAnnualMinor: 0,
    },
    alerts: { targetSavingsRate: 0.3, allocationDriftThreshold: 0.1, emergencyFundMonths: 6 },
    snapshotSinceBackup: false,
    ...stamp,
    ...patch,
  };
}

export function makeAccount(patch: Partial<Account> & Pick<Account, 'id'>): Account {
  return {
    nickname: patch.id,
    institution: 'Bank',
    type: 'cash',
    assetClass: 'cash',
    currency: 'TWD',
    investable: true,
    archived: false,
    ...stamp,
    ...patch,
  };
}

export function makeAssumptions(): AssumptionSet {
  return { ...defaultAssumptionSet('as-1'), ...stamp };
}

export { stamp };
