import {
  ASSET_CLASSES,
  type Account,
  type AssumptionSet,
  type CashFlow,
  type Category,
  type FxRate,
  type IncomeStream,
  type Liability,
  type Scenario,
  type ScenarioEvent,
  type ScenarioLevers,
  type Settings,
  type Snapshot,
  type WithdrawalRule,
} from './entities';
import { assetAssumptionList, correlationMatrix } from './assumptions';
import { monthlyTotals, trailing12, type TrailingTotals } from './cashflow';
import { ageAt, today, yearOf } from './dates';
import { fiSpendingByTier, type FiSpending } from './fiNumber';
import { fromMinor } from './money';
import { netWorthAt, snapshotDates, type NetWorth } from './networth';
import type { Bucket, LockedBucket, ProjectionInput, ProjectionLiability } from './projection';
import { laborPensionContribution } from './taiwan/laborPension';
import { clampClaimAge } from './taiwan/laborInsurance';

/** Everything the projection reads from the database. */
export interface PlanData {
  settings: Settings;
  accounts: Account[];
  snapshots: Snapshot[];
  fxRates: FxRate[];
  liabilities: Liability[];
  categories: Category[];
  cashFlows: CashFlow[];
  incomeStreams: IncomeStream[];
}

export type ScenarioSpec = Pick<Scenario, 'overrides' | 'events' | 'withdrawalRule'>;

export const BASELINE_SPEC: ScenarioSpec = {
  overrides: {},
  events: [],
  withdrawalRule: { kind: 'fixed_swr' },
};

export interface BaselineContext {
  asOfDate: string;
  startAge: number;
  netWorth: NetWorth;
  t12: TrailingTotals;
  tiers: FiSpending;
  /** True when no FI budget is set and trailing-12-month spending is used instead. */
  fiSpendingFromT12: boolean;
  warnings: string[];
}

export function normaliseAllocation(
  allocation: Partial<Record<string, number>>,
  fallback?: NetWorth,
): number[] {
  let weights = ASSET_CLASSES.map((c) => Math.max(0, allocation[c] ?? 0));
  let sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 && fallback) {
    weights = ASSET_CLASSES.map((c) =>
      Math.max(
        0,
        fallback.balances
          .filter((b) => b.bucket === 'liquid' && b.account.assetClass === c)
          .reduce((s, b) => s + b.twd, 0),
      ),
    );
    sum = weights.reduce((a, b) => a + b, 0);
  }
  if (sum <= 0) return ASSET_CLASSES.map((c) => (c === 'cash' ? 1 : 0));
  return weights.map((w) => w / sum);
}

/** State of the plan as of the latest snapshot: net worth, trailing cash flow and FI budget. */
export function baselineContext(data: PlanData): BaselineContext {
  const dates = snapshotDates(data.snapshots);
  const asOfDate = dates.at(-1) ?? today();
  const startAge = ageAt(data.settings.birthYear, asOfDate);
  const netWorth = netWorthAt(asOfDate, data.accounts, data.snapshots, data.fxRates, data.settings.birthYear);
  const totals = monthlyTotals(data.cashFlows, data.categories, data.fxRates);
  const t12 = trailing12(totals);
  const tiers = fiSpendingByTier(data.categories, data.settings.destination);
  const fiSpendingFromT12 = tiers.full - tiers.postEmployment <= 0;
  const warnings: string[] = [];
  if (dates.length === 0) warnings.push('No snapshot yet: the projection starts from zero.');
  if (netWorth.missingFx.length) warnings.push(`Missing FX rate for ${netWorth.missingFx.join(', ')}.`);
  if (t12.monthsWithData === 0)
    warnings.push('No cash flow yet: income and spending are zero unless a scenario sets them.');
  if (fiSpendingFromT12) warnings.push('No FI budget set: FI spending uses trailing-12-month spending.');
  return { asOfDate, startAge, netWorth, t12, tiers, fiSpendingFromT12, warnings };
}

function eventsToProjection(events: readonly ScenarioEvent[]) {
  return events.map((e) => ({
    year: yearOf(e.date),
    amount: fromMinor(e.amountMinor),
    description: e.description,
  }));
}

/**
 * Builds the projection input for a scenario: the baseline from the latest data,
 * with the scenario's overrides applied (LAB-1).
 */
export function buildProjectionInput(
  data: PlanData,
  assumptions: AssumptionSet,
  spec: ScenarioSpec = BASELINE_SPEC,
  ctx: BaselineContext = baselineContext(data),
): ProjectionInput {
  const o: ScenarioLevers = spec.overrides;
  const s = data.settings;
  const tw = assumptions.taiwan;
  const { netWorth, t12, tiers, startAge } = ctx;
  const multiplier = o.spendingMultiplier ?? 1;

  const liquid: Bucket[] = [];
  const locked: LockedBucket[] = [];
  const nonInvestable: Bucket[] = [];
  const liabilities: ProjectionLiability[] = [];
  for (const b of netWorth.balances) {
    const a = b.account;
    if (b.bucket === 'liability') {
      const terms = data.liabilities.find((l) => l.accountId === a.id);
      liabilities.push({
        balance: b.twd,
        rate: terms?.interestRate ?? 0,
        annualPayment: terms ? fromMinor(terms.monthlyPaymentMinor) * 12 : 0,
      });
      continue;
    }
    const bucket = { assetClass: a.assetClass, currency: a.currency, value: b.twd };
    if (b.bucket === 'liquid') {
      const existing = liquid.find((x) => x.assetClass === a.assetClass && x.currency === a.currency);
      if (existing) existing.value += b.twd;
      else liquid.push(bucket);
    } else if (b.bucket === 'locked') {
      locked.push({
        ...bucket,
        unlockAge: a.accessAge ?? startAge,
        pension: a.type === 'pension' && !locked.some((l) => l.pension),
      });
    } else {
      nonInvestable.push(bucket);
    }
  }

  const annualIncome = o.annualIncomeMinor !== undefined ? fromMinor(o.annualIncomeMinor) : t12.annualIncome;
  const currentSpending =
    (o.currentSpendingMinor !== undefined ? fromMinor(o.currentSpendingMinor) : t12.annualExpense) *
    multiplier;
  const tier = o.fiTier ?? s.destination.fiTier;
  const baseFiSpending = ctx.fiSpendingFromT12 ? t12.annualExpense + tiers.postEmployment : tiers[tier];
  const fiSpending =
    (o.fiSpendingMinor !== undefined ? fromMinor(o.fiSpendingMinor) : baseFiSpending) * multiplier;

  const basePension = laborPensionContribution(tw);
  const pension = laborPensionContribution(tw, o.laborPensionVoluntaryRate ?? tw.laborPension.voluntaryRate);
  // Net income already reflects the current voluntary rate; only a change moves take-home savings.
  const liquidDelta =
    -(pension.voluntary - basePension.voluntary) + (pension.taxSaving - basePension.taxSaving);

  const li = tw.laborInsurance;
  return {
    startYear: yearOf(ctx.asOfDate),
    startAge,
    horizonAge: Math.max(s.horizonAge, startAge + 1),
    liquid,
    locked,
    nonInvestable,
    liabilities,
    annualIncome,
    incomeChanges: (o.incomeChanges ?? []).map((c) => ({
      fromAge: c.fromAge,
      toAge: c.toAge,
      annualIncome: fromMinor(c.annualIncomeMinor),
    })),
    currentSpending,
    savingsRate: o.savingsRate,
    fiSpending,
    streams: data.incomeStreams.map((st) => ({
      name: st.name,
      startAge: st.startAge,
      endAge: st.endAge,
      annual: fromMinor(st.annualMinor),
      inflationLinked: st.inflationLinked,
    })),
    barista: o.baristaIncome
      ? { annual: fromMinor(o.baristaIncome.annualMinor), untilAge: o.baristaIncome.untilAge }
      : undefined,
    laborInsurance: li.enabled
      ? {
          settings: li,
          claimAge: clampClaimAge(li, o.laborInsuranceClaimAge ?? li.claimAge),
          haircut: o.laborInsuranceHaircut ?? li.haircut,
        }
      : undefined,
    pension: {
      employer: pension.employer,
      voluntary: pension.voluntary,
      liquidDelta,
      accessAge: tw.laborPension.accessAge,
    },
    swr: o.swr ?? s.defaultSwr,
    withdrawalRule: spec.withdrawalRule as WithdrawalRule,
    retireAtAge: o.targetFiAge,
    allocation: normaliseAllocation(o.allocation ?? s.targetAllocation, netWorth),
    rebalance: o.allocation !== undefined,
    assets: assetAssumptionList(assumptions),
    returnShift: o.returnShift ?? 0,
    correlations: correlationMatrix(assumptions),
    inflation: assumptions.inflation,
    inflationVolatility: assumptions.inflationVolatility,
    salaryGrowth: assumptions.salaryGrowth,
    fxDrift: assumptions.fxDrift,
    fxVolatility: assumptions.fxVolatility,
    events: eventsToProjection(spec.events),
    taiwan: tw,
  };
}

/** Same input with all volatility removed: Monte Carlo then equals the deterministic projection. */
export function withoutVolatility(input: ProjectionInput): ProjectionInput {
  return {
    ...input,
    assets: input.assets.map((a) => ({ ...a, volatility: 0 })),
    inflationVolatility: 0,
    fxVolatility: 0,
  };
}
