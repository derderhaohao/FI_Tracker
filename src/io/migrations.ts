/**
 * Backup-file migrations. `MIGRATIONS[n]` turns a version-n file into version n+1;
 * a file is migrated step by step to the current SCHEMA_VERSION before validation.
 * Each migration needs a unit test that loads a fixture from the previous version.
 */
import { SCHEMA_VERSION } from '@/db/db';

type RawFile = { schemaVersion: number; [key: string]: unknown };

export const MIGRATIONS: Record<number, (file: RawFile) => RawFile> = {
  // 1: (file) => ({ ...file, schemaVersion: 2, data: { ... } }),
};

export function migrateBackup(raw: unknown, target = SCHEMA_VERSION): unknown {
  if (typeof raw !== 'object' || raw === null || !('schemaVersion' in raw)) {
    throw new Error('The file has no schemaVersion; it is not an FI Tracker backup.');
  }
  let file = raw as RawFile;
  if (typeof file.schemaVersion !== 'number') throw new Error('schemaVersion must be a number.');
  if (file.schemaVersion > target) {
    throw new Error(
      `The file is from a newer version of the app (schema ${file.schemaVersion}). Update the app first.`,
    );
  }
  while (file.schemaVersion < target) {
    const step = MIGRATIONS[file.schemaVersion];
    if (!step) throw new Error(`No migration from schema ${file.schemaVersion}.`);
    file = step(file);
  }
  return file;
}
