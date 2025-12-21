import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

export function hashPassword(plain: string): string {
  if (!plain) {
    throw new Error('Password must not be empty');
  }
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = scryptSync(plain, salt, KEY_LENGTH);
  return `${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

export function verifyPassword(plain: string, hashed: string | null | undefined): boolean {
  if (!plain || !hashed) {
    return false;
  }
  const parts = hashed.split(':');
  if (parts.length !== 2) {
    return false;
  }
  const [saltHex, keyHex] = parts;
  if (!saltHex || !keyHex) {
    return false;
  }
  const salt = Buffer.from(saltHex, 'hex');
  const derivedKey = scryptSync(plain, salt, KEY_LENGTH);
  const storedKey = Buffer.from(keyHex, 'hex');
  if (storedKey.length !== derivedKey.length) {
    return false;
  }
  return timingSafeEqual(storedKey, derivedKey);
}
