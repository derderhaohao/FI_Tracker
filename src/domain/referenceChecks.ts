import { ASSET_CLASSES } from './entities';
import { withoutVolatility } from './baseline';
import { runBacktest, HISTORY, type HistoricalYear } from './backtest';
import { runMonteCarlo } from './montecarlo/runner';
import { runProjection, type ProjectionInput } from './projection';
import { defaultTaiwanSettings } from './taiwan/defaults';
import { t } from '@/i18n';

/**
 * Built-in reference tests shown in the Strategy Lab (PRD R10), so users can see the
 * engine reproduce known answers.
 */

export interface ReferenceCheck {
  name: string;
  pass: boolean;
  detail: string;
}

/** With no volatility, every simulated future is the typical path. */
export function zeroVolatilityCheck(input: ProjectionInput): ReferenceCheck {
  const flat = withoutVolatility(input);
  const typical = runProjection(flat).investable;
  const mc = runMonteCarlo(flat, { runs: 20, seed: 1 });
  let maxDiff = 0;
  mc.p50.forEach((v, k) => (maxDiff = Math.max(maxDiff, Math.abs(v - typical[k]))));
  return {
    name: t('Zero-volatility simulations equal the typical path'),
    pass: maxDiff < 1,
    detail:
      maxDiff < 1
        ? t('With all randomness removed, every simulated future matches the typical path to the dollar.')
        : t('Largest gap: NT${toLocaleString}.', { toLocaleString: Math.round(maxDiff).toLocaleString() }),
  };
}

/**
 * The classic case (Bengen 1994; Trinity study 1998): spend 4% of a 60/40 stock/bond
 * portfolio in the first year, the same real amount after that, for 30 years.
 */
export function classicInput(): ProjectionInput {
  const taiwan = defaultTaiwanSettings();
  taiwan.laborInsurance.enabled = false;
  const weights: Record<string, number> = { us_equity: 0.6, bond: 0.4 };
  return {
    startYear: 2026,
    startAge: 65,
    horizonAge: 95,
    liquid: [
      { assetClass: 'us_equity', currency: 'TWD', value: 600_000 },
      { assetClass: 'bond', currency: 'TWD', value: 400_000 },
    ],
    locked: [],
    nonInvestable: [],
    liabilities: [],
    annualIncome: 0,
    incomeChanges: [],
    currentSpending: 0,
    fiSpending: 40_000,
    streams: [],
    pension: { employer: 0, voluntary: 0, liquidDelta: 0, accessAge: 60 },
    swr: 0.04,
    withdrawalRule: { kind: 'fixed_swr' },
    retireAtAge: 65,
    allocation: ASSET_CLASSES.map((c) => weights[c] ?? 0),
    rebalance: true,
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
  };
}

/** Published success for 4%, 60/40, 30 years over long US history is about 95%. */
export const CLASSIC_RANGE: [number, number] = [0.9, 0.99];

export function classicWithdrawalCheck(history: readonly HistoricalYear[] = HISTORY): ReferenceCheck {
  const b = runBacktest(classicInput(), history);
  const pass = b.successRate >= CLASSIC_RANGE[0] && b.successRate <= CLASSIC_RANGE[1];
  return {
    name: t('Classic 4% rule over 30 years matches published results'),
    pass,
    detail: t(
      '60/40 stocks/bonds, 4% of the start value each year after inflation, 30 years: money lasts in {round}% of {runs} start years ({firstYear}–{lastYear}). Published studies (Bengen 1994, the Trinity study 1998) report about 95%.',
      { round: Math.round(b.successRate * 100), runs: b.runs, firstYear: b.firstYear, lastYear: b.lastYear },
    ),
  };
}

export function referenceChecks(input: ProjectionInput): ReferenceCheck[] {
  return [zeroVolatilityCheck(input), classicWithdrawalCheck()];
}
