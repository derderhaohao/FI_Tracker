import { buildDemoBackup } from './demo';
import { decryptBackup, encryptBackup, encryptedBackupFileName, isEncryptedBackup } from './encryption';

describe('encrypted backup', () => {
  const file = buildDemoBackup();

  it('round-trips with the right passphrase', async () => {
    const enc = await encryptBackup(file, 'correct horse battery staple', 1000);
    expect(isEncryptedBackup(enc)).toBe(true);
    expect(isEncryptedBackup(file)).toBe(false);
    expect(JSON.stringify(enc)).not.toContain('Everyday account');
    expect(await decryptBackup(enc, 'correct horse battery staple')).toEqual(
      JSON.parse(JSON.stringify(file)),
    );
  });

  it('rejects a wrong passphrase and uses fresh salt each time', async () => {
    const a = await encryptBackup(file, 'secret', 1000);
    const b = await encryptBackup(file, 'secret', 1000);
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.data).not.toBe(b.data);
    await expect(decryptBackup(a, 'wrong')).rejects.toThrow(/Wrong passphrase/);
    await expect(decryptBackup({ ...a, format: 2 as 1 }, 'secret')).rejects.toThrow(/Unsupported/);
  });

  it('names files so .gitignore blocks them', () => {
    expect(encryptedBackupFileName('2026-10-22')).toMatch(/\.fi\.json$/);
  });
});
