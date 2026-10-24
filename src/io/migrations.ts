/**
 * Backup-file migrations. `MIGRATIONS[n]` turns a version-n file into version n+1;
 * a file is migrated step by step to the current SCHEMA_VERSION before validation.
 * Each migration needs a unit test that loads a fixture from the previous version.
 */
import { SCHEMA_VERSION } from '@/db/db';
import { t } from '@/i18n';

type RawFile = { schemaVersion: number; [key: string]: unknown };

type RawData = Record<string, unknown[] | undefined>;

export const MIGRATIONS: Record<number, (file: RawFile) => RawFile> = {
  // v1 → v2: cash-flow mode setting (default monthly totals) and an empty goal history.
  1: (file) => {
    const data = { ...(file.data as RawData) };
    data.settings = (data.settings ?? []).map((s) => ({ cashFlowMode: 'monthly', ...(s as object) }));
    data.goalHistory = data.goalHistory ?? [];
    return { ...file, schemaVersion: 2, data };
  },
};

export function migrateBackup(raw: unknown, target = SCHEMA_VERSION): unknown {
  if (typeof raw !== 'object' || raw === null || !('schemaVersion' in raw)) {
    throw new Error(t('The file has no schemaVersion; it is not an FI Tracker backup.'));
  }
  let file = raw as RawFile;
  if (typeof file.schemaVersion !== 'number') throw new Error(t('schemaVersion must be a number.'));
  if (file.schemaVersion > target) {
    throw new Error(
      t('The file is from a newer version of the app (schema {schemaVersion}). Update the app first.', {
        schemaVersion: file.schemaVersion,
      }),
    );
  }
  while (file.schemaVersion < target) {
    const step = MIGRATIONS[file.schemaVersion];
    if (!step)
      throw new Error(t('No migration from schema {schemaVersion}.', { schemaVersion: file.schemaVersion }));
    file = step(file);
  }
  return file;
}
