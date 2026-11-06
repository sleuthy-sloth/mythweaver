import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { EmailSchema, DisplayNameSchema, PasswordSchema } from '@mythweaver/contracts';
import { loadConfig } from '../config';
import { createDatabase } from '../db/client';
import { users } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { hashPassword } from '../lib/password';

/**
 * Operator bootstrap for a fresh installation.
 *
 * There are no default credentials anywhere: the account is created here, by someone with
 * shell access, with a password typed at the prompt. Closing registration does not lock the
 * operator out of their own server because this path does not consult that setting.
 *
 *   pnpm admin:bootstrap --email you@example.com --name "Your Name"
 *   pnpm admin:bootstrap --email you@example.com --name "Your Name" --password-stdin
 *   pnpm admin:bootstrap --email you@example.com --promote   # existing account -> operator
 */

type Args = {
  email?: string;
  name?: string;
  promote: boolean;
  passwordStdin: boolean;
  generate: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { promote: false, passwordStdin: false, generate: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--email':
        args.email = argv[++index];
        break;
      case '--name':
        args.name = argv[++index];
        break;
      case '--promote':
        args.promote = true;
        break;
      case '--password-stdin':
        args.passwordStdin = true;
        break;
      case '--generate-password':
        args.generate = true;
        break;
      default:
        if (arg?.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

/** Reads a line from stdin with echo disabled, so a password never lands in scrollback. */
async function promptHidden(question: string): Promise<string> {
  const mutableOutput = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const rl = createInterface({
    input: process.stdin,
    output: mutableOutput,
    terminal: true,
  });

  try {
    const answer = await rl.question(question);
    process.stdout.write('\n');
    return answer;
  } finally {
    rl.close();
  }
}

async function readStdinLine(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8').split('\n')[0] ?? '';
}

function generatedPassword(): string {
  // 24 bytes -> 32 base64url characters. Printed once; the operator must store it.
  return Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64url');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const { sql: client, db } = createDatabase(config.databaseUrl);

  try {
    if (!args.email) throw new Error('--email is required');
    const email = EmailSchema.parse(args.email);

    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (existing) {
      if (!args.promote) {
        throw new Error(
          `${email} already exists. Re-run with --promote to grant the operator role.`,
        );
      }
      await db
        .update(users)
        .set({ role: 'operator', updatedAt: new Date() })
        .where(eq(users.id, existing.id));
      console.log(`${email} is now an operator.`);
      return;
    }

    const displayName = DisplayNameSchema.parse(args.name ?? email.split('@')[0] ?? 'Operator');

    const password = args.generate
      ? generatedPassword()
      : args.passwordStdin
        ? await readStdinLine()
        : process.stdin.isTTY
          ? await promptHidden('Password (12+ characters, input hidden): ')
          : (() => {
              throw new Error(
                'No TTY for a password prompt: use --password-stdin or --generate-password',
              );
            })();

    PasswordSchema.parse(password);
    const passwordHash = await hashPassword(password);

    await db.insert(users).values({
      email,
      displayName,
      passwordHash,
      role: 'operator',
    });

    console.log(`Operator created: ${email}`);
    if (args.generate) {
      console.log(`Password (shown once, store it now): ${password}`);
    }
    const [operatorCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.role, 'operator'));
    console.log(`Operators on this server: ${operatorCount?.count ?? 0}`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error('bootstrap failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
