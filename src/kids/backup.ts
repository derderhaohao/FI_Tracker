import { z } from 'zod';
import { kidsDb, MAX_PROFILES, type KidsDatabase } from './db';

// Beginner mode's data in files (KD-11, KD-13): one child's progress from the grown-ups corner,
// and an optional `kids` section in the main FI Tracker backup.

const split = z.object({ spend: z.number(), save: z.number(), grow: z.number() });
const profile = z.object({
  id: z.string(),
  nickname: z.string().max(40),
  avatar: z.number().int(),
  age: z.number().int(),
  split,
  createdAt: z.string(),
});
const entry = z.object({
  id: z.string(),
  profileId: z.string(),
  date: z.string(),
  jar: z.enum(['spend', 'save', 'grow']),
  amount: z.number().int(),
  source: z.enum(['allowance', 'chores', 'redEnvelope', 'gift', 'other']).optional(),
  category: z.enum(['snack', 'toy', 'book', 'game', 'giftForSomeone', 'other', 'goal']).optional(),
  need: z.boolean().optional(),
});
const goal = z.object({
  id: z.string(),
  profileId: z.string(),
  picture: z.enum(['bike', 'game', 'book', 'trip', 'gift']),
  price: z.number().int(),
  createdAt: z.string(),
  reachedAt: z.string().optional(),
});
const progress = z.object({
  profileId: z.string(),
  lessonId: z.number().int(),
  score: z.number().int(),
  badgeAt: z.string(),
});
const setting = z.object({ key: z.string(), value: z.unknown() });

/** The `kids` section of the main backup (KD-13). The PIN is left out on purpose. */
export const kidsBackupSchema = z.object({
  profiles: z.array(profile).max(MAX_PROFILES),
  entries: z.array(entry),
  goals: z.array(goal),
  progress: z.array(progress),
  settings: z.array(setting),
});
export type KidsBackup = z.infer<typeof kidsBackupSchema>;

/** Settings that stay on the device: the child lock and its tries. */
const LOCAL_ONLY = new Set(['pin', 'pinTries']);

export async function exportKids(database: KidsDatabase = kidsDb): Promise<KidsBackup | undefined> {
  const profiles = await database.profiles.toArray();
  if (profiles.length === 0) return undefined;
  return {
    profiles,
    entries: await database.entries.toArray(),
    goals: await database.goals.toArray(),
    progress: await database.progress.toArray(),
    settings: (await database.settings.toArray()).filter((s) => !LOCAL_ONLY.has(s.key)),
  };
}

/** Replaces Beginner mode's data with a backup's `kids` section, keeping this device's PIN. */
export async function importKids(data: KidsBackup, database: KidsDatabase = kidsDb): Promise<void> {
  const tables = [database.profiles, database.entries, database.goals, database.progress, database.settings];
  await database.transaction('rw', tables, async () => {
    const keep = (await database.settings.toArray()).filter((s) => LOCAL_ONLY.has(s.key));
    for (const table of tables) await table.clear();
    await database.profiles.bulkPut(data.profiles);
    await database.entries.bulkPut(data.entries);
    await database.goals.bulkPut(data.goals);
    await database.progress.bulkPut(data.progress);
    await database.settings.bulkPut([...data.settings.filter((s) => !LOCAL_ONLY.has(s.key)), ...keep]);
  });
}

/** One child's progress as a file (KD-11). */
export const childFileSchema = z.object({
  app: z.literal('fi-tracker-kids'),
  version: z.literal(1),
  profile,
  entries: z.array(entry),
  goals: z.array(goal),
  progress: z.array(progress),
});
export type ChildFile = z.infer<typeof childFileSchema>;

export async function exportChild(profileId: string, database: KidsDatabase = kidsDb): Promise<ChildFile> {
  const p = await database.profiles.get(profileId);
  if (!p) throw new Error('No such profile');
  return {
    app: 'fi-tracker-kids',
    version: 1,
    profile: p,
    entries: await database.entries.where('profileId').equals(profileId).toArray(),
    goals: await database.goals.where('profileId').equals(profileId).toArray(),
    progress: await database.progress.where('profileId').equals(profileId).toArray(),
  };
}

/**
 * Loads one child's progress: the same child is replaced, a new one is added when there is room.
 * Returns false when the file is not a child's progress or there are already four children.
 */
export async function importChild(raw: unknown, database: KidsDatabase = kidsDb): Promise<boolean> {
  const parsed = childFileSchema.safeParse(raw);
  if (!parsed.success) return false;
  const f = parsed.data;
  const exists = await database.profiles.get(f.profile.id);
  if (!exists && (await database.profiles.count()) >= MAX_PROFILES) return false;
  const id = f.profile.id;
  await database.transaction(
    'rw',
    [database.profiles, database.entries, database.goals, database.progress],
    async () => {
      await database.entries.where('profileId').equals(id).delete();
      await database.goals.where('profileId').equals(id).delete();
      await database.progress.where('profileId').equals(id).delete();
      await database.profiles.put(f.profile);
      await database.entries.bulkPut(f.entries.filter((e) => e.profileId === id));
      await database.goals.bulkPut(f.goals.filter((g) => g.profileId === id));
      await database.progress.bulkPut(f.progress.filter((p) => p.profileId === id));
    },
  );
  return true;
}

/** Clears one child's coins, goals and badges but keeps the child (KD-11). */
export async function resetChild(profileId: string, database: KidsDatabase = kidsDb): Promise<void> {
  await database.transaction('rw', [database.entries, database.goals, database.progress], async () => {
    await database.entries.where('profileId').equals(profileId).delete();
    await database.goals.where('profileId').equals(profileId).delete();
    await database.progress.where('profileId').equals(profileId).delete();
  });
}
