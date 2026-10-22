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
  GoalSnapshot,
  Review,
  Scenario,
  Settings,
  Snapshot,
} from '@/domain/entities';

/** Current IndexedDB schema version; also written into every backup file. */
export const SCHEMA_VERSION = 2;

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
  'goalHistory',
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
  goalHistory!: EntityTable<GoalSnapshot, 'id'>;

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
    // v2: dated transactions (ENG-2), cash-flow mode setting, goal history (DST-7).
    this.version(2)
      .stores({
        cashFlows: 'id, month, categoryId, [month+categoryId], date',
        goalHistory: 'id, date',
      })
      .upgrade(async (tx) => {
        await tx
          .table('settings')
          .toCollection()
          .modify((s: { cashFlowMode?: string }) => {
            s.cashFlowMode ??= 'monthly';
          });
      });
  }

  allTables() {
    return STORE_NAMES.map((n) => this.table(n));
  }
}

export const db = new FiDatabase();
