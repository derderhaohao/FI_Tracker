import Dexie, { type EntityTable } from 'dexie';
import type {
  Account,
  AssumptionSet,
  CashFlow,
  Category,
  FxRate,
  Holding,
  IncomeStream,
  Liability,
  Review,
  Scenario,
  Settings,
  Snapshot,
} from '@/domain/entities';

/** Current IndexedDB schema version; also written into every backup file. */
export const SCHEMA_VERSION = 1;

export const STORE_NAMES = [
  'settings',
  'accounts',
  'snapshots',
  'fxRates',
  'holdings',
  'liabilities',
  'cashFlows',
  'categories',
  'incomeStreams',
  'assumptionSets',
  'scenarios',
  'reviews',
] as const;
export type StoreName = (typeof STORE_NAMES)[number];

export class FiDatabase extends Dexie {
  settings!: EntityTable<Settings, 'id'>;
  accounts!: EntityTable<Account, 'id'>;
  snapshots!: EntityTable<Snapshot, 'id'>;
  fxRates!: EntityTable<FxRate, 'id'>;
  holdings!: EntityTable<Holding, 'id'>;
  liabilities!: EntityTable<Liability, 'accountId'>;
  cashFlows!: EntityTable<CashFlow, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  incomeStreams!: EntityTable<IncomeStream, 'id'>;
  assumptionSets!: EntityTable<AssumptionSet, 'id'>;
  scenarios!: EntityTable<Scenario, 'id'>;
  reviews!: EntityTable<Review, 'id'>;

  constructor(name = 'fi-tracker') {
    super(name);
    // Each schema change adds a new version with an upgrade(); old versions are never edited.
    this.version(1).stores({
      settings: 'id',
      accounts: 'id, type, archived',
      snapshots: 'id, date, accountId, [accountId+date]',
      fxRates: 'id, [currency+date]',
      holdings: 'id, [accountId+date]',
      liabilities: 'accountId',
      cashFlows: 'id, month, categoryId, [month+categoryId]',
      categories: 'id, kind',
      incomeStreams: 'id',
      assumptionSets: 'id',
      scenarios: 'id, isPlanOfRecord',
      reviews: 'id, date',
    });
  }

  allTables() {
    return STORE_NAMES.map((n) => this.table(n));
  }
}

export const db = new FiDatabase();
