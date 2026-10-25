import { FiDatabase } from '@/db/db';
import { ensureDefaults } from '@/db/defaults';
import { patch, save } from '@/db/repo';
import {
  clearAllData,
  exportBackup,
  importBackup,
  markBackedUp,
  parseBackup,
  parseBackupText,
  backupFileName,
} from './backup';
import { exportCsvFiles, parseCsv, toCsv } from './csv';
import { buildDemoBackup } from './demo';
import { migrateBackup } from './migrations';
import demoFile from '../../sample-data/demo.json';
import backupV1 from './fixtures/backup-v1.json';
import Dexie from 'dexie';
import { addMoney, createProfile, KidsDatabase } from '@/kids/db';

let n = 0;
function freshDb() {
  n += 1;
  return new FiDatabase(`test-${n}-${Date.now()}`);
}

describe('Beginner data in the main backup (KD-13)', () => {
  it('carries a kids section when there are children, and restores it', async () => {
    const plan = freshDb();
    await ensureDefaults(plan);
    const kids = new KidsDatabase(`kids-${Date.now()}`);
    const id = await createProfile({ nickname: 'Leo', avatar: 1, age: 8 }, kids);
    await addMoney((await kids.profiles.get(id))!, 50, 'gift', kids);
    const file = await exportBackup(plan, kids);
    expect(file.kids?.profiles).toHaveLength(1);
    const parsed = parseBackup(JSON.parse(JSON.stringify(file)));
    expect(parsed.ok).toBe(true);
    const target = new KidsDatabase(`kids-target-${Date.now()}`);
    await importBackup(parsed.ok ? parsed.file : file, freshDb(), target);
    expect(await target.entries.count()).toBe(3);
  });

  it('reads older backups without a kids section and leaves the children alone', async () => {
    const plan = freshDb();
    await ensureDefaults(plan);
    const file = await exportBackup(plan, null);
    expect(file.kids).toBeUndefined();
    const kids = new KidsDatabase(`kids-keep-${Date.now()}`);
    await createProfile({ nickname: 'Ada', avatar: 0, age: 10 }, kids);
    await importBackup(file, freshDb(), kids);
    expect(await kids.profiles.count()).toBe(1);
  });
});

describe('database and backup', () => {
  it('creates defaults once on first run', async () => {
    const db = freshDb();
    await ensureDefaults(db);
    await ensureDefaults(db);
    expect(await db.settings.count()).toBe(1);
    expect(await db.assumptionSets.count()).toBe(1);
    expect(await db.categories.count()).toBeGreaterThan(5);
    const s = await db.settings.get('singleton');
    expect(s?.activeAssumptionSetId).toBe((await db.assumptionSets.toArray())[0].id);
  });

  it('stamps and bumps audit fields', async () => {
    const db = freshDb();
    const a = await save(db.accounts, {
      id: 'a',
      nickname: 'Bank',
      institution: 'X',
      type: 'cash',
      assetClass: 'cash',
      currency: 'TWD',
      investable: true,
      archived: false,
    });
    expect(a.createdAt).toBe(a.updatedAt);
    await new Promise((r) => setTimeout(r, 5));
    await patch(db.accounts, 'a', { nickname: 'Main bank' });
    const b = await db.accounts.get('a');
    expect(b?.nickname).toBe('Main bank');
    expect(b?.createdAt).toBe(a.createdAt);
    expect(b!.updatedAt > a.updatedAt).toBe(true);
  });

  it('round-trips export → import with no data change', async () => {
    const source = freshDb();
    await importBackup(buildDemoBackup(), source);
    const exported = await exportBackup(source);
    const text = JSON.stringify(exported);
    const parsed = parseBackupText(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const target = freshDb();
    await ensureDefaults(target);
    await importBackup(parsed.file, target);
    const again = await exportBackup(target);
    expect(again.data).toEqual(exported.data);
  });

  it('marks backups and clears data', async () => {
    const db = freshDb();
    await ensureDefaults(db);
    await markBackedUp(db);
    expect((await db.settings.get('singleton'))?.lastBackupAt).toBeDefined();
    await clearAllData(db);
    expect(await db.settings.count()).toBe(0);
  });

  it('rejects invalid files with a readable error', () => {
    expect(parseBackupText('not json')).toEqual({ ok: false, error: 'The file is not valid JSON.' });
    const noVersion = parseBackup({ data: {} });
    expect(noVersion.ok).toBe(false);
    const newer = parseBackup({ schemaVersion: 99, data: {} });
    expect(!newer.ok && newer.error).toMatch(/newer version/);
    const demo = buildDemoBackup();
    const broken = structuredClone(demo);
    (broken.data.accounts[0] as { currency: string }).currency = 'usd';
    const bad = parseBackup(broken);
    expect(!bad.ok && bad.error).toMatch(/accounts\.0\.currency/);
    expect(backupFileName('2026-10-22')).toBe('fi-tracker-2026-10-22.fi.json');
  });

  it('migrates a v1 backup file to the current schema', () => {
    const parsed = parseBackup(backupV1);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.file.schemaVersion).toBe(2);
    expect(parsed.file.data.settings[0].cashFlowMode).toBe('monthly');
    expect(parsed.file.data.goalHistory).toEqual([]);
    expect(parsed.file.data.accounts).toEqual(backupV1.data.accounts);
  });

  it('fails on an unknown version', () => {
    expect(() => migrateBackup({ schemaVersion: 0 })).toThrow(/No migration/);
    expect(() => migrateBackup({ schemaVersion: '1' })).toThrow(/number/);
  });

  it('upgrades a v1 IndexedDB database in place', async () => {
    const name = `upgrade-${Date.now()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({ settings: 'id', cashFlows: 'id, month, categoryId, [month+categoryId]' });
    await v1.table('settings').put(backupV1.data.settings[0]);
    await v1.table('cashFlows').bulkPut(backupV1.data.cashFlows.slice(0, 3));
    v1.close();
    const upgraded = new FiDatabase(name);
    const s = await upgraded.settings.get('singleton');
    expect(s?.cashFlowMode).toBe('monthly');
    expect(s?.birthYear).toBe(backupV1.data.settings[0].birthYear);
    expect(await upgraded.cashFlows.count()).toBe(3);
    expect(await upgraded.goalHistory.count()).toBe(0);
  });
});

describe('demo data', () => {
  it('is valid and matches the committed sample file', () => {
    const demo = buildDemoBackup();
    expect(parseBackup(demo).ok).toBe(true);
    expect(demo.data.scenarios.filter((s) => s.isPlanOfRecord)).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(demo))).toEqual(demoFile);
  });
});

describe('csv', () => {
  it('escapes and parses fields', () => {
    const csv = toCsv([
      { a: 'x,y', b: 'say "hi"', c: { d: 1 } },
      { a: 'line\nbreak', b: undefined },
    ]);
    expect(parseCsv(csv)).toEqual([
      ['a', 'b', 'c'],
      ['x,y', 'say "hi"', '{"d":1}'],
      ['line\nbreak', '', ''],
    ]);
    expect(toCsv([])).toBe('');
    expect(parseCsv('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('exports one file per non-empty store', () => {
    const files = exportCsvFiles(buildDemoBackup().data);
    expect(files.map((f) => f.name)).toContain('fi-tracker-snapshots.csv');
    expect(files.map((f) => f.name)).not.toContain('fi-tracker-incomeStreams.csv');
  });
});
