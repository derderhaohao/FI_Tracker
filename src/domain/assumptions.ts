import {
  ASSET_CLASSES,
  type AssetAssumption,
  type AssetClass,
  type AssumptionSet,
  type Draft,
} from './entities';
import { defaultTaiwanSettings } from './taiwan/defaults';
import { t } from '@/i18n';

/** Correlation key with the two classes in ASSET_CLASSES order. */
export function correlationKey(a: AssetClass, b: AssetClass): string {
  const ia = ASSET_CLASSES.indexOf(a);
  const ib = ASSET_CLASSES.indexOf(b);
  return ia <= ib ? `${a}|${b}` : `${b}|${a}`;
}

export function correlationMatrix(set: Pick<AssumptionSet, 'correlations'>): number[][] {
  return ASSET_CLASSES.map((a) =>
    ASSET_CLASSES.map((b) => (a === b ? 1 : (set.correlations[correlationKey(a, b)] ?? 0))),
  );
}

const ZERO: Omit<AssetAssumption, 'assetClass'> = {
  expectedReturn: 0,
  volatility: 0,
  fee: 0,
  dividendYield: 0,
};

/** Assumptions for every class in ASSET_CLASSES order; missing classes get zeros. */
export function assetAssumptionList(set: Pick<AssumptionSet, 'assets'>): AssetAssumption[] {
  return ASSET_CLASSES.map((c) => set.assets.find((a) => a.assetClass === c) ?? { assetClass: c, ...ZERO });
}

/** Starting assumptions: nominal, before fees; edit them in Settings. */
export function defaultAssumptionSet(id: string): Draft<AssumptionSet> {
  const assets: AssetAssumption[] = [
    { assetClass: 'cash', expectedReturn: 0.012, volatility: 0.005, fee: 0, dividendYield: 0 },
    { assetClass: 'tw_equity', expectedReturn: 0.07, volatility: 0.2, fee: 0.003, dividendYield: 0.035 },
    { assetClass: 'us_equity', expectedReturn: 0.07, volatility: 0.17, fee: 0.001, dividendYield: 0.015 },
    { assetClass: 'global_equity', expectedReturn: 0.065, volatility: 0.16, fee: 0.002, dividendYield: 0.02 },
    { assetClass: 'bond', expectedReturn: 0.03, volatility: 0.06, fee: 0.001, dividendYield: 0.03 },
    { assetClass: 'property', expectedReturn: 0.03, volatility: 0.08, fee: 0, dividendYield: 0 },
    { assetClass: 'other', expectedReturn: 0.02, volatility: 0.03, fee: 0, dividendYield: 0 },
  ];
  const correlations: Record<string, number> = {
    [correlationKey('tw_equity', 'us_equity')]: 0.6,
    [correlationKey('tw_equity', 'global_equity')]: 0.65,
    [correlationKey('us_equity', 'global_equity')]: 0.9,
    [correlationKey('tw_equity', 'bond')]: 0.1,
    [correlationKey('us_equity', 'bond')]: 0.1,
    [correlationKey('global_equity', 'bond')]: 0.1,
    [correlationKey('tw_equity', 'property')]: 0.3,
    [correlationKey('us_equity', 'property')]: 0.2,
    [correlationKey('global_equity', 'property')]: 0.25,
  };
  return {
    id,
    name: t('Base case'),
    assets,
    correlations,
    inflation: 0.02,
    inflationVolatility: 0.01,
    salaryGrowth: 0.025,
    fxDrift: 0,
    fxVolatility: 0.06,
    taiwan: defaultTaiwanSettings(),
  };
}

/** Currency new money goes into for a class when there is no existing holding. */
export function defaultCurrencyFor(assetClass: AssetClass): string {
  return assetClass === 'us_equity' ? 'USD' : 'TWD';
}
