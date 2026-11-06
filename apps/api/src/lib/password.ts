import { argon2id, argon2Verify } from 'hash-wasm';

/**
 * Argon2id, OWASP baseline for interactive logins (19 MiB, t=2, p=1).
 *
 * Implemented with `hash-wasm` rather than a native binding: native modules ship per-platform
 * `.node` files that cannot be bundled into the single-file server, which would drag a
 * `node_modules` tree into the runtime image and complicate the arm64 build. The WASM build is
 * the same algorithm and slows a login by tens of milliseconds, which is acceptable.
 *
 * The encoded output is a standard PHC string (`$argon2id$v=19$m=19456,t=2,p=1$...`), so
 * hashes remain verifiable by any other Argon2 implementation.
 */
const PARAMS = {
  parallelism: 1,
  iterations: 2,
  memorySize: 19_456,
  hashLength: 32,
} as const;

const SALT_BYTES = 16;

export async function hashPassword(password: string): Promise<string> {
  // A per-password random salt is embedded in the encoded hash; never a global constant.
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  return argon2id({ password, salt, ...PARAMS, outputType: 'encoded' });
}

/**
 * Returns false instead of throwing on a malformed hash, so a corrupted row cannot turn a
 * failed login into a 500 that reveals which accounts exist.
 */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await argon2Verify({ password, hash: passwordHash });
  } catch {
    return false;
  }
}

let dummyHashPromise: Promise<string> | null = null;

/**
 * Used when no account matches, so a failed login costs the same whether or not the email
 * exists. Without it, response timing is a user-enumeration oracle.
 */
export function dummyPasswordHash(): Promise<string> {
  dummyHashPromise ??= hashPassword('mythweaver-dummy-password-for-timing');
  return dummyHashPromise;
}
