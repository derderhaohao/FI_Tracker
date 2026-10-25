import { describe, expect, it } from 'vitest';
import { KidsDatabase } from './db';
import { checkPin, hasPin, removePin, setPin, waitLeft, WAIT_MS } from './pin';

describe('parent PIN (KD-10)', () => {
  it('stores a salted hash, not the PIN', async () => {
    const db = new KidsDatabase('pin-hash');
    expect(await hasPin(db)).toBe(false);
    expect(await checkPin('0000', db)).toBe('ok');
    await setPin('1234', db);
    const stored = JSON.stringify(await db.settings.get('pin'));
    expect(stored).not.toContain('1234');
    expect(await checkPin('1234', db)).toBe('ok');
    await expect(setPin('12a4', db)).rejects.toThrow();
  });

  it('three wrong tries mean a 30-second wait, even for the right PIN', async () => {
    const db = new KidsDatabase('pin-wait');
    await setPin('4321', db);
    const now = 1_000_000;
    expect(await checkPin('0000', db, now)).toBe('wrong');
    expect(await checkPin('1111', db, now)).toBe('wrong');
    expect(await checkPin('2222', db, now)).toBe('wait');
    expect(await waitLeft(db, now + 1000)).toBe(WAIT_MS - 1000);
    expect(await checkPin('4321', db, now + 1000)).toBe('wait');
    expect(await checkPin('4321', db, now + WAIT_MS + 1)).toBe('ok');
    await removePin(db);
    expect(await hasPin(db)).toBe(false);
  });
});
