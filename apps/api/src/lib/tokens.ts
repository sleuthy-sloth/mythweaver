import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256 bits of entropy, URL-safe so it survives cookies and headers untouched. */
export function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 hex. Used for session tokens and for hashing idempotent request bodies. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Session tokens are stored hashed; a database dump must not be a set of usable cookies. */
export const hashToken = sha256Hex;

/** Constant-time comparison for secrets of equal length. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
