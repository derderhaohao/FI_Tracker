import { z } from 'zod';
import {
  accountSchema,
  assumptionSetSchema,
  cashFlowSchema,
  categorySchema,
  fxRateSchema,
  holdingSchema,
  incomeStreamSchema,
  liabilitySchema,
  reviewSchema,
  goalSnapshotSchema,
  scenarioSchema,
  settingsSchema,
  snapshotSchema,
} from '@/domain/entities';
import { today } from '@/domain/dates';
import { db, SCHEMA_VERSION, STORE_NAMES, type FiDatabase, type StoreName } from '@/db/db';
import { migrateBackup } from './migrations';
import { exportKids, importKids, kidsBackupSchema } from '@/kids/backup';
import { kidsDb, type KidsDatabase } from '@/kids/db';
import { t } from '@/i18n';

/** Zod schema of the current backup file: `{ schemaVersion, exportedAt, data: { …all stores } }`. */
export const backupDataSchema = z.object({
  settings: z.array(settingsSchema).max(1),
  accounts: z.array(accountSchema),
  snapshots: z.array(snapshotSchema),
  fxRates: z.array(fxRateSchema),
  holdings: z.array(holdingSchema),
  liabilities: z.array(liabilitySchema),
  cashFlows: z.array(cashFlowSchema),
  categories: z.array(categorySchema),
  incomeStreams: z.array(incomeStreamSchema),
  assumptionSets: z.array(assumptionSetSchema),
  scenarios: z.array(scenarioSchema),
  reviews: z.array(reviewSchema),
  goalHistory: z.array(goalSnapshotSchema),
});
export type BackupData = z.infer<typeof backupDataSchema>;

export const backupFileSchema = z.object({
  app: z.literal('fi-tracker').optional(),
  schemaVersion: z.literal(SCHEMA_VERSION),
  exportedAt: z.string(),
  data: backupDataSchema,
  /** Beginner mode's data (KD-13); older backups simply lack it. */
  kids: kidsBackupSchema.optional(),
});
export type BackupFile = z.infer<typeof backupFileSchema>;

export function backupFileName(date = today()): string {
  return `fi-tracker-${date}.fi.json`;
}

export async function exportBackup(
  database: FiDatabase = db,
  kids: KidsDatabase | null = kidsDb,
): Promise<BackupFile> {
  const data = {} as Record<StoreName, unknown[]>;
  await database.transaction('r', database.allTables(), async () => {
    for (const name of STORE_NAMES) data[name] = await database.table(name).toArray();
  });
  const kidsData = kids ? await exportKids(kids) : undefined;
  return {
    app: 'fi-tracker',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: data as BackupData,
    ...(kidsData ? { kids: kidsData } : {}),
  };
}

export type ParseResult = { ok: true; file: BackupFile } | { ok: false; error: string };

/** Migrates the file to the current schema version, then validates the whole file. */
export function parseBackup(raw: unknown): ParseResult {
  let migrated: unknown;
  try {
    migrated = migrateBackup(raw);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const result = backupFileSchema.safeParse(migrated);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    return { ok: false, error: t('The file is not a valid FI Tracker backup. {issues}', { issues }) };
  }
  return { ok: true, file: result.data };
}

export function parseBackupText(text: string): ParseResult {
  try {
    return parseBackup(JSON.parse(text));
  } catch {
    return { ok: false, error: t('The file is not valid JSON.') };
  }
}

/**
 * Replaces all plan data with the backup in one transaction. Beginner mode's data is replaced
 * only when the file has a `kids` section (KD-13).
 */
export async function importBackup(
  file: BackupFile,
  database: FiDatabase = db,
  kids: KidsDatabase | null = kidsDb,
): Promise<void> {
  await database.transaction('rw', database.allTables(), async () => {
    for (const name of STORE_NAMES) {
      const table = database.table(name);
      await table.clear();
      await table.bulkPut(file.data[name]);
    }
  });
  if (file.kids && kids) await importKids(file.kids, kids);
}

export async function clearAllData(database: FiDatabase = db): Promise<void> {
  await database.transaction('rw', database.allTables(), async () => {
    for (const t of database.allTables()) await t.clear();
  });
}

/** Marks the data as backed up now. */
export async function markBackedUp(database: FiDatabase = db): Promise<void> {
  const s = await database.settings.get('singleton');
  if (!s) return;
  const now = new Date().toISOString();
  await database.settings.put({
    ...s,
    lastBackupAt: now,
    snapshotSinceBackup: false,
    backupPrompt: undefined,
    updatedAt: now,
  });
}
