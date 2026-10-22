/**
 * Encrypted backups (P2): AES-GCM with a key derived from a passphrase by PBKDF2
 * (SHA-256), using the browser's Web Crypto API. Nothing leaves the device.
 */

export const PBKDF2_ITERATIONS = 600_000;

export interface EncryptedBackup {
  app: 'fi-tracker';
  encrypted: true;
  format: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  /** Base64 ciphertext of the JSON backup file. */
  data: string;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function isEncryptedBackup(raw: unknown): raw is EncryptedBackup {
  return typeof raw === 'object' && raw !== null && (raw as { encrypted?: unknown }).encrypted === true;
}

export async function encryptBackup(
  file: unknown,
  passphrase: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<EncryptedBackup> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations);
  const plain = new TextEncoder().encode(JSON.stringify(file));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  return {
    app: 'fi-tracker',
    encrypted: true,
    format: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    data: toBase64(cipher),
  };
}

/** Decrypts to the parsed JSON backup. Throws a readable error for a wrong passphrase. */
export async function decryptBackup(file: EncryptedBackup, passphrase: string): Promise<unknown> {
  if (file.format !== 1 || file.kdf?.name !== 'PBKDF2' || file.cipher?.name !== 'AES-GCM') {
    throw new Error('Unsupported encrypted backup format.');
  }
  const key = await deriveKey(passphrase, fromBase64(file.kdf.salt), file.kdf.iterations);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(file.cipher.iv) },
      key,
      fromBase64(file.data),
    );
  } catch {
    throw new Error('Wrong passphrase, or the file is damaged.');
  }
  return JSON.parse(new TextDecoder().decode(plain));
}

export function encryptedBackupFileName(date: string): string {
  return `fi-tracker-${date}.encrypted.fi.json`;
}
