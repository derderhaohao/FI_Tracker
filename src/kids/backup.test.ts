import { describe, expect, it } from 'vitest';
import { exportChild, exportKids, importChild, importKids, kidsBackupSchema, resetChild } from './backup';
import { addMoney, createProfile, KidsDatabase, newId } from './db';
import { setPin } from './pin';

async function seed(name: string) {
  const db = new KidsDatabase(name);
  const id = await createProfile({ nickname: 'Mimi', avatar: 2, age: 9 }, db);
  const p = (await db.profiles.get(id))!;
  await addMoney(p, 100, 'allowance', db);
  await db.goals.add({ id: newId(), profileId: id, picture: 'bike', price: 200, createdAt: '2026-10-01' });
  await db.progress.put({ profileId: id, lessonId: 1, score: 3, badgeAt: '2026-10-02' });
  return { db, id };
}

describe('Beginner data in files (KD-11, KD-13)', () => {
  it('round-trips the kids section of the main backup, keeping this device’s PIN', async () => {
    const { db } = await seed('kids-a');
    await setPin('1234', db);
    const data = (await exportKids(db))!;
    expect(kidsBackupSchema.safeParse(JSON.parse(JSON.stringify(data))).success).toBe(true);
    expect(data.settings.some((s) => s.key === 'pin')).toBe(false);
    const other = new KidsDatabase('kids-b');
    await setPin('9999', other);
    await importKids(data, other);
    expect(await other.entries.count()).toBe(3);
    expect(await other.goals.count()).toBe(1);
    expect(await other.settings.get('pin')).toBeDefined();
    expect(await exportKids(new KidsDatabase('kids-empty'))).toBeUndefined();
  });

  it('saves and loads one child, and resets a child without removing them', async () => {
    const { db, id } = await seed('kids-c');
    const file = JSON.parse(JSON.stringify(await exportChild(id, db)));
    const other = new KidsDatabase('kids-d');
    expect(await importChild(file, other)).toBe(true);
    expect((await other.profiles.get(id))?.nickname).toBe('Mimi');
    expect(await other.entries.where('profileId').equals(id).count()).toBe(3);
    expect(await importChild({ app: 'something-else' }, other)).toBe(false);
    await resetChild(id, db);
    expect(await db.entries.count()).toBe(0);
    expect(await db.profiles.count()).toBe(1);
  });
});
