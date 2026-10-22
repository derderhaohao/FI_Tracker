import type { AlertSettings, AssetClass } from './entities';
import type { MonthTotals } from './cashflow';
import type { NetWorth } from './networth';
import { allocationShares } from './networth';
import { ASSET_CLASS_LABELS } from './entities';

export interface Alert {
  id: string;
  level: 'warning' | 'info';
  message: string;
}

/** FBK-5 alerts: low savings rate, allocation drift, thin emergency fund. */
export function computeAlerts(
  settings: AlertSettings,
  targetAllocation: Partial<Record<AssetClass, number>>,
  nw: NetWorth | undefined,
  totals: readonly MonthTotals[],
  monthlySpending: number,
): Alert[] {
  const alerts: Alert[] = [];
  const last = totals.at(-1);
  if (
    last &&
    Number.isFinite(last.regularSavingsRate) &&
    last.regularSavingsRate < settings.targetSavingsRate
  ) {
    alerts.push({
      id: 'savings-rate',
      level: 'warning',
      message: `Savings rate in ${last.month} was ${(last.regularSavingsRate * 100).toFixed(1)}%, below the ${(settings.targetSavingsRate * 100).toFixed(0)}% target.`,
    });
  }
  if (nw) {
    const shares = allocationShares(nw);
    const targetSum = Object.values(targetAllocation).reduce((a, b) => a + (b ?? 0), 0);
    if (targetSum > 0 && Object.keys(shares).length > 0) {
      const classes = new Set([...Object.keys(shares), ...Object.keys(targetAllocation)] as AssetClass[]);
      for (const c of classes) {
        const actual = shares[c] ?? 0;
        const target = (targetAllocation[c] ?? 0) / targetSum;
        if (Math.abs(actual - target) > settings.allocationDriftThreshold) {
          alerts.push({
            id: `drift-${c}`,
            level: 'warning',
            message: `${ASSET_CLASS_LABELS[c]} is ${(actual * 100).toFixed(0)}% of investable assets against a ${(target * 100).toFixed(0)}% target.`,
          });
        }
      }
    }
    const cash = nw.balances
      .filter((b) => b.bucket === 'liquid' && b.account.assetClass === 'cash')
      .reduce((s, b) => s + b.twd, 0);
    if (monthlySpending > 0 && cash / monthlySpending < settings.emergencyFundMonths) {
      alerts.push({
        id: 'emergency-fund',
        level: 'warning',
        message: `Cash covers ${(cash / monthlySpending).toFixed(1)} months of spending, below the ${settings.emergencyFundMonths}-month emergency fund.`,
      });
    }
  }
  return alerts;
}
