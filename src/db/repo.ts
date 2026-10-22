import type { Table } from 'dexie';
import type { Draft } from '@/domain/entities';

export function newId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

type Audited = { createdAt: string; updatedAt: string };

/** Inserts or updates a record, stamping audit fields. */
export async function save<T extends Audited, K>(
  table: Table<T, K>,
  draft: Draft<T> & Partial<Audited>,
): Promise<T> {
  const now = nowIso();
  const record = { ...draft, createdAt: draft.createdAt ?? now, updatedAt: now } as T;
  await table.put(record);
  return record;
}

export async function saveMany<T extends Audited, K>(
  table: Table<T, K>,
  drafts: (Draft<T> & Partial<Audited>)[],
): Promise<void> {
  const now = nowIso();
  await table.bulkPut(drafts.map((d) => ({ ...d, createdAt: d.createdAt ?? now, updatedAt: now }) as T));
}

/** Applies a partial change to an existing record and bumps `updatedAt`. */
export async function patch<T extends Audited, K>(
  table: Table<T, K>,
  key: K,
  changes: Partial<Draft<T>>,
): Promise<void> {
  const existing = await table.get(key);
  if (!existing) throw new Error('Record not found');
  await table.put({ ...existing, ...changes, updatedAt: nowIso() });
}
