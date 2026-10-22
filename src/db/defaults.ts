import type { Category, Draft, Settings } from '@/domain/entities';
import { defaultAssumptionSet } from '@/domain/assumptions';
import { db, type FiDatabase } from './db';
import { newId, save, saveMany } from './repo';

export function defaultSettings(assumptionSetId: string): Draft<Settings> {
  return {
    id: 'singleton',
    baseCurrency: 'TWD',
    birthYear: 1990,
    horizonAge: 95,
    defaultSwr: 0.04,
    snapshotCadence: 'monthly',
    activeAssumptionSetId: assumptionSetId,
    targetAllocation: { cash: 0.1, tw_equity: 0.3, us_equity: 0.4, global_equity: 0.1, bond: 0.1 },
    destination: {
      fiTier: 'full',
      fatMultiplier: 1.3,
      // NHI category 6 (地區人口) self-paid premium, 2026.
      nhiMonthlyMinor: 826_00,
      privateInsuranceAnnualMinor: 0,
      healthcareReserveAnnualMinor: 0,
    },
    alerts: { targetSavingsRate: 0.3, allocationDriftThreshold: 0.1, emergencyFundMonths: 6 },
    snapshotSinceBackup: false,
  };
}

export const DEFAULT_CATEGORIES: Omit<Draft<Category>, 'id'>[] = [
  { name: 'Salary', kind: 'income', essential: false },
  { name: 'Bonus', kind: 'income', essential: false },
  { name: 'Dividends', kind: 'income', essential: false },
  { name: 'Other income', kind: 'income', essential: false },
  { name: 'Housing', kind: 'expense', essential: true },
  { name: 'Food', kind: 'expense', essential: true },
  { name: 'Transport', kind: 'expense', essential: true },
  { name: 'Utilities & phone', kind: 'expense', essential: true },
  { name: 'Insurance & health', kind: 'expense', essential: true },
  { name: 'Family', kind: 'expense', essential: true },
  { name: 'Travel', kind: 'expense', essential: false },
  { name: 'Leisure & shopping', kind: 'expense', essential: false },
  { name: 'Other', kind: 'expense', essential: false },
];

/** Creates settings, a base-case assumption set and starter categories on first run. */
export async function ensureDefaults(database: FiDatabase = db): Promise<void> {
  await database.transaction(
    'rw',
    database.settings,
    database.assumptionSets,
    database.categories,
    async () => {
      if (await database.settings.get('singleton')) return;
      const setId = newId();
      await save(database.assumptionSets, defaultAssumptionSet(setId));
      await save(database.settings, defaultSettings(setId));
      if ((await database.categories.count()) === 0) {
        await saveMany(
          database.categories,
          DEFAULT_CATEGORIES.map((c) => ({ ...c, id: newId() })),
        );
      }
    },
  );
}

/** Asks the browser not to evict the database under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
