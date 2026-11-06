import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256 bits of entropy, URL-safe so it survives cookies and headers untouched. */
export function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Session tokens are stored hashed; a database dump must not be a set of usable cookies. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time comparison for secrets of equal length. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
