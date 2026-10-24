import type { AlertSettings, AssetClass } from './entities';
import type { MonthTotals } from './cashflow';
import type { NetWorth } from './networth';
import { allocationShares } from './networth';
import { ASSET_CLASS_LABELS } from './entities';
import { t } from '@/i18n';

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
      message: t('Savings rate in {month} was {toFixed}%, below the {toFixed2}% target.', {
        month: last.month,
        toFixed: (last.regularSavingsRate * 100).toFixed(1),
        toFixed2: (settings.targetSavingsRate * 100).toFixed(0),
      }),
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
            message: t(
              '{ASSET_CLASS_LABELS} is {toFixed}% of investable assets against a {toFixed2}% target.',
              {
                ASSET_CLASS_LABELS: ASSET_CLASS_LABELS[c],
                toFixed: (actual * 100).toFixed(0),
                toFixed2: (target * 100).toFixed(0),
              },
            ),
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
        message: t(
          'Cash covers {toFixed} months of spending, below the {emergencyFundMonths}-month emergency fund.',
          { toFixed: (cash / monthlySpending).toFixed(1), emergencyFundMonths: settings.emergencyFundMonths },
        ),
      });
    }
  }
  return alerts;
}
