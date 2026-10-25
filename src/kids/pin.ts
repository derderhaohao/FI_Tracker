import { getSetting, kidsDb, setSetting, type KidsDatabase } from './db';

// The optional parent PIN (KD-10): a child lock, not a security feature. Stored as a salted
// PBKDF2 hash on this device; three wrong tries mean a 30-second wait, which survives a reload.

export const MAX_TRIES = 3;
export const WAIT_MS = 30_000;

interface StoredPin {
  salt: string;
  hash: string;
}
interface Tries {
  count: number;
  lockedUntil?: number;
}

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pin: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 100_000, hash: 'SHA-256' },
    key,
    256,
  );
  return b64(bits);
}

export const isPinShape = (pin: string) => /^\d{4}$/.test(pin);

export async function hasPin(database: KidsDatabase = kidsDb): Promise<boolean> {
  return !!(await getSetting<StoredPin | undefined>('pin', undefined, database));
}

export async function setPin(pin: string, database: KidsDatabase = kidsDb): Promise<void> {
  if (!isPinShape(pin)) throw new Error('A PIN is 4 digits');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await setSetting('pin', { salt: b64(salt), hash: await derive(pin, salt) }, database);
  await setSetting('pinTries', { count: 0 }, database);
}

export async function removePin(database: KidsDatabase = kidsDb): Promise<void> {
  await database.settings.bulkDelete(['pin', 'pinTries']);
}

/** Milliseconds left to wait after too many wrong tries, or 0. */
export async function waitLeft(database: KidsDatabase = kidsDb, now = Date.now()): Promise<number> {
  const tries = await getSetting<Tries>('pinTries', { count: 0 }, database);
  return tries.lockedUntil && tries.lockedUntil > now ? tries.lockedUntil - now : 0;
}

/** Checks a PIN; wrong three times in a row starts the wait. No PIN set means open. */
export async function checkPin(
  pin: string,
  database: KidsDatabase = kidsDb,
  now = Date.now(),
): Promise<'ok' | 'wrong' | 'wait'> {
  const stored = await getSetting<StoredPin | undefined>('pin', undefined, database);
  if (!stored) return 'ok';
  if ((await waitLeft(database, now)) > 0) return 'wait';
  if ((await derive(pin, unb64(stored.salt))) === stored.hash) {
    await setSetting('pinTries', { count: 0 }, database);
    return 'ok';
  }
  const tries = await getSetting<Tries>('pinTries', { count: 0 }, database);
  const count = tries.count + 1;
  if (count >= MAX_TRIES) {
    await setSetting('pinTries', { count: 0, lockedUntil: now + WAIT_MS }, database);
    return 'wait';
  }
  await setSetting('pinTries', { count }, database);
  return 'wrong';
}
