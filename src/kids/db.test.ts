import { describe, expect, it } from 'vitest';
import {
  addMoney,
  balances,
  createProfile,
  deleteProfile,
  getSetting,
  KidsDatabase,
  MAX_PROFILES,
  newId,
  savePace,
  setSetting,
  spendMoney,
  weeklySavePace,
  type Entry,
} from './db';
import { DEFAULT_SPLIT } from './math';

let n = 0;
const fresh = () => new KidsDatabase(`kids-db-test-${++n}`);

const WEEK = 7 * 86_400_000;
const NOW = Date.parse('2026-10-25T12:00:00Z');
const entry = (jar: Entry['jar'], amount: number, weeksAgo: number): Entry => ({
  id: newId(),
  profileId: 'p',
  date: new Date(NOW - weeksAgo * WEEK).toISOString(),
  jar,
  amount,
});

describe('kids profiles', () => {
  it('creates a profile with a trimmed nickname, the default split, and makes it active', async () => {
    const db = fresh();
    const id = await createProfile(
      { nickname: '  A very long nickname for a child  ', avatar: 1, age: 8 },
      db,
    );
    const p = (await db.profiles.get(id))!;
    expect(p.nickname).toBe('A very long nickname');
    expect(p.split).toEqual(DEFAULT_SPLIT);
    expect(await getSetting('activeProfile', undefined, db)).toBe(id);
  });

  it('uses the parent’s default split for new profiles', async () => {
    const db = fresh();
    await setSetting('defaultSplit', { spend: 40, save: 40, grow: 20 }, db);
    const id = await createProfile({ nickname: 'Bo', avatar: 2, age: 10 }, db);
    expect((await db.profiles.get(id))!.split).toEqual({ spend: 40, save: 40, grow: 20 });
  });

  it('allows up to four profiles', async () => {
    const db = fresh();
    for (let i = 0; i < MAX_PROFILES; i++) await createProfile({ nickname: `K${i}`, avatar: i, age: 7 }, db);
    await expect(createProfile({ nickname: 'Fifth', avatar: 5, age: 7 }, db)).rejects.toThrow();
    expect(await db.profiles.count()).toBe(MAX_PROFILES);
  });

  it('deletes a profile with everything it owns and picks another active profile', async () => {
    const db = fresh();
    const a = await createProfile({ nickname: 'A', avatar: 1, age: 7 }, db);
    const b = await createProfile({ nickname: 'B', avatar: 2, age: 9 }, db);
    const pb = (await db.profiles.get(b))!;
    await addMoney(pb, 100, 'gift', db);
    await db.goals.add({ id: newId(), profileId: b, picture: 'bike', price: 500, createdAt: '2026-10-01' });
    await db.progress.put({ profileId: b, lessonId: 1, score: 3, badgeAt: '2026-10-01' });
    await addMoney((await db.profiles.get(a))!, 50, 'chores', db);
    expect(await getSetting('activeProfile', undefined, db)).toBe(b);

    await deleteProfile(b, db);
    expect(await db.profiles.get(b)).toBeUndefined();
    expect(await db.entries.where('profileId').equals(b).count()).toBe(0);
    expect(await db.goals.count()).toBe(0);
    expect(await db.progress.count()).toBe(0);
    expect(await db.entries.where('profileId').equals(a).count()).toBeGreaterThan(0);
    expect(await getSetting('activeProfile', undefined, db)).toBe(a);
  });

  it('returns the fallback for a missing setting', async () => {
    const db = fresh();
    expect(await getSetting('allowance', 50, db)).toBe(50);
    await setSetting('allowance', 80, db);
    expect(await getSetting('allowance', 50, db)).toBe(80);
  });
});

describe('jars', () => {
  it('splits money in across the jars and derives the balances', async () => {
    const db = fresh();
    const id = await createProfile({ nickname: 'C', avatar: 3, age: 8 }, db);
    await addMoney((await db.profiles.get(id))!, 100, 'allowance', db);
    const entries = await db.entries.toArray();
    expect(entries.every((e) => e.source === 'allowance')).toBe(true);
    expect(balances(entries)).toEqual({ spend: 50, save: 30, grow: 20 });
  });

  it('records spending as negative entries, skipping empty parts', async () => {
    const db = fresh();
    const id = await createProfile({ nickname: 'D', avatar: 4, age: 11 }, db);
    await addMoney((await db.profiles.get(id))!, 200, 'gift', db);
    await spendMoney(id, { spend: 80, save: 20, grow: 0 }, 'toy', false, db);
    const entries = await db.entries.toArray();
    const out = entries.filter((e) => e.amount < 0);
    expect(out).toHaveLength(2);
    expect(out.every((e) => e.category === 'toy' && e.need === false)).toBe(true);
    expect(balances(entries)).toEqual({ spend: 20, save: 40, grow: 40 });
  });

  it('starts every jar at zero', () => {
    expect(balances([])).toEqual({ spend: 0, save: 0, grow: 0 });
  });
});

describe('saving pace', () => {
  it('averages coins into Savings per week over the last eight weeks', () => {
    const entries = [entry('save', 30, 4), entry('save', 30, 2), entry('save', 30, 0), entry('spend', 99, 1)];
    // 90 coins since four weeks ago.
    expect(weeklySavePace(entries, NOW)).toBe(Math.round(90 / 4));
  });

  it('ignores spending, other jars and anything older than eight weeks', () => {
    expect(weeklySavePace([entry('save', 100, 9), entry('save', -10, 1), entry('grow', 50, 1)], NOW)).toBe(0);
  });

  it('counts at least one week', () => {
    expect(weeklySavePace([entry('save', 40, 0)], NOW)).toBe(40);
  });

  it('falls back to the allowance’s Savings share when nothing was saved lately', () => {
    expect(savePace([], 100, { spend: 50, save: 30, grow: 20 }, NOW)).toBe(30);
    expect(savePace([], 75, { spend: 50, save: 30, grow: 20 }, NOW)).toBe(22);
    expect(savePace([entry('save', 60, 1)], 100, DEFAULT_SPLIT, NOW)).toBe(60);
  });
});
