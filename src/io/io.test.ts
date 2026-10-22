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

let n = 0;
function freshDb() {
  n += 1;
  return new FiDatabase(`test-${n}-${Date.now()}`);
}

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

  it('migrates step by step and fails on an unknown version', () => {
    expect(migrateBackup({ schemaVersion: 1, data: {} })).toEqual({ schemaVersion: 1, data: {} });
    expect(() => migrateBackup({ schemaVersion: 0 })).toThrow(/No migration/);
    expect(() => migrateBackup({ schemaVersion: '1' })).toThrow(/number/);
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
