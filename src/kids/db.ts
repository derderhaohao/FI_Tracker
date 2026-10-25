import Dexie, { type EntityTable } from 'dexie';
import { DEFAULT_GROWTH, DEFAULT_SPLIT, splitAmount, type Jar, type Split } from './math';

// Beginner mode's own database (PRD Part D, KD-2): `fi-tracker-kids`, never the plan's. Jar
// balances are worked out from the entries, never stored.

export const KIDS_DB_NAME = 'fi-tracker-kids';
export const MAX_PROFILES = 4;
export const MAX_GOALS = 3;

export interface Profile {
  id: string;
  /** A nickname only: no real names, photos or birth dates (KD-3). */
  nickname: string;
  avatar: number;
  /** A number only. */
  age: number;
  split: Split;
  createdAt: string;
}

export type Source = 'allowance' | 'chores' | 'redEnvelope' | 'gift' | 'other';
export type Category = 'snack' | 'toy' | 'book' | 'game' | 'giftForSomeone' | 'other' | 'goal';

export interface Entry {
  id: string;
  profileId: string;
  /** ISO timestamp. */
  date: string;
  jar: Jar;
  /** Whole coins: positive in, negative out. */
  amount: number;
  source?: Source;
  category?: Category;
  need?: boolean;
}

export type GoalPicture = 'bike' | 'game' | 'book' | 'trip' | 'gift';

export interface Goal {
  id: string;
  profileId: string;
  picture: GoalPicture;
  price: number;
  createdAt: string;
  reachedAt?: string;
}

export interface Progress {
  profileId: string;
  lessonId: number;
  score: number;
  badgeAt: string;
}

export interface KidSetting {
  key: string;
  value: unknown;
}

export class KidsDatabase extends Dexie {
  profiles!: EntityTable<Profile, 'id'>;
  entries!: EntityTable<Entry, 'id'>;
  goals!: EntityTable<Goal, 'id'>;
  progress!: Dexie.Table<Progress, [string, number]>;
  settings!: EntityTable<KidSetting, 'key'>;

  constructor(name = KIDS_DB_NAME) {
    super(name);
    this.version(1).stores({
      profiles: 'id, createdAt',
      entries: 'id, profileId, [profileId+date]',
      goals: 'id, profileId',
      progress: '[profileId+lessonId], profileId',
      settings: 'key',
    });
  }
}

export const kidsDb = new KidsDatabase();

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** Parent settings with their defaults (KD-11 makes them editable). */
export interface Growth {
  bank: number;
  tree: number;
}

export async function getSetting<T>(key: string, fallback: T, database: KidsDatabase = kidsDb): Promise<T> {
  const row = await database.settings.get(key);
  return row ? (row.value as T) : fallback;
}

export function setSetting(key: string, value: unknown, database: KidsDatabase = kidsDb) {
  return database.settings.put({ key, value });
}

export const defaultGrowth = (): Growth => ({ bank: DEFAULT_GROWTH.bank, tree: DEFAULT_GROWTH.tree });

export async function createProfile(
  p: Pick<Profile, 'nickname' | 'avatar' | 'age'>,
  database: KidsDatabase = kidsDb,
): Promise<string> {
  if ((await database.profiles.count()) >= MAX_PROFILES) throw new Error('Up to 4 profiles');
  const id = newId();
  await database.profiles.add({
    ...p,
    nickname: p.nickname.trim().slice(0, 20),
    id,
    split: { ...(await getSetting<Split>('defaultSplit', DEFAULT_SPLIT, database)) },
    createdAt: new Date().toISOString(),
  });
  await setSetting('activeProfile', id, database);
  return id;
}

/** Deletes a profile and everything it owns (the parent can remove a child completely). */
export async function deleteProfile(id: string, database: KidsDatabase = kidsDb) {
  await database.transaction(
    'rw',
    [database.profiles, database.entries, database.goals, database.progress],
    async () => {
      await database.entries.where('profileId').equals(id).delete();
      await database.goals.where('profileId').equals(id).delete();
      await database.progress.where('profileId').equals(id).delete();
      await database.profiles.delete(id);
    },
  );
  if ((await getSetting<string | undefined>('activeProfile', undefined, database)) === id) {
    const next = await database.profiles.toCollection().first();
    await setSetting('activeProfile', next?.id, database);
  }
}

/** Money in (KD-5): split across the jars by the child's split. */
export async function addMoney(
  profile: Profile,
  amount: number,
  source: Source,
  database: KidsDatabase = kidsDb,
) {
  const parts = splitAmount(amount, profile.split);
  const date = new Date().toISOString();
  await database.entries.bulkAdd(
    (Object.keys(parts) as Jar[])
      .filter((jar) => parts[jar] > 0)
      .map((jar) => ({ id: newId(), profileId: profile.id, date, jar, amount: parts[jar], source })),
  );
}

/** Money out of a jar (or from Spend, then Save when the child agreed). */
export async function spendMoney(
  profileId: string,
  parts: Partial<Record<Jar, number>>,
  category: Category,
  need: boolean | undefined,
  database: KidsDatabase = kidsDb,
) {
  const date = new Date().toISOString();
  await database.entries.bulkAdd(
    (Object.keys(parts) as Jar[])
      .filter((jar) => (parts[jar] ?? 0) > 0)
      .map((jar) => ({ id: newId(), profileId, date, jar, amount: -(parts[jar] ?? 0), category, need })),
  );
}

export function balances(entries: readonly Entry[]): Record<Jar, number> {
  const out: Record<Jar, number> = { spend: 0, save: 0, grow: 0 };
  for (const e of entries) out[e.jar] += e.amount;
  return out;
}

/** Average coins a week going into Save over the last 8 weeks (at least one week counted). */
export function weeklySavePace(entries: readonly Entry[], now = Date.now()): number {
  const since = now - 8 * 7 * 86_400_000;
  const recent = entries.filter((e) => e.jar === 'save' && e.amount > 0 && Date.parse(e.date) >= since);
  if (recent.length === 0) return 0;
  const first = Math.min(...recent.map((e) => Date.parse(e.date)));
  const weeks = Math.max(1, Math.ceil((now - first) / (7 * 86_400_000)));
  return Math.round(recent.reduce((a, e) => a + e.amount, 0) / weeks);
}

/** The saving pace for goals: recent coins into Savings, else the allowance's Savings share. */
export function savePace(
  entries: readonly Entry[],
  allowance: number,
  split: Split,
  now = Date.now(),
): number {
  const recent = weeklySavePace(entries, now);
  return recent > 0 ? recent : Math.floor((allowance * split.save) / 100);
}
