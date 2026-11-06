import { z } from 'zod';

const boolFromString = (defaultValue: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(defaultValue)
    .transform((value) => value === 'true');

/**
 * Environment is parsed once, at boot, and the process refuses to start on bad input.
 * A server that starts with a missing DATABASE_URL only fails later, in front of a user.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  API_HOST: z.string().min(1).default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CORS_ORIGINS: z.string().default(''),
  APP_VERSION: z.string().default('0.1.0'),

  /**
   * Closed by default. A self-hosted server that accepts anonymous sign-ups the moment it is
   * exposed is an abuse vector, and the operator can always flip this on deliberately.
   * Bootstrap the first operator with `pnpm admin:bootstrap`.
   */
  REGISTRATION_OPEN: boolFromString('false'),

  /** Session lifetime. Long enough for a phone PWA, short enough that a stolen cookie ages out. */
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),

  /**
   * Cookies get `Secure` in production. A local HTTP development server would drop them, so
   * the default follows NODE_ENV and can be overridden for a TLS-terminating proxy setup.
   */
  COOKIE_SECURE: z.enum(['true', 'false', 'auto']).default('auto'),

  RATE_LIMIT_ENABLED: boolFromString('true'),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_REGISTER_MAX: z.coerce.number().int().min(1).default(5),
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  host: string;
  logLevel: string;
  databaseUrl: string;
  corsOrigins: string[];
  version: string;
  isProduction: boolean;
  isTest: boolean;
  registrationOpen: boolean;
  sessionTtlDays: number;
  cookieSecure: boolean;
  rateLimitEnabled: boolean;
  rateLimitLoginMax: number;
  rateLimitRegisterMax: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }

  const value = parsed.data;
  const isProduction = value.NODE_ENV === 'production';

  return {
    nodeEnv: value.NODE_ENV,
    port: value.API_PORT,
    host: value.API_HOST,
    logLevel: value.LOG_LEVEL,
    databaseUrl: value.DATABASE_URL,
    corsOrigins: value.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    version: value.APP_VERSION,
    isProduction,
    isTest: value.NODE_ENV === 'test',
    registrationOpen: value.REGISTRATION_OPEN,
    sessionTtlDays: value.SESSION_TTL_DAYS,
    cookieSecure: value.COOKIE_SECURE === 'auto' ? isProduction : value.COOKIE_SECURE === 'true',
    rateLimitEnabled: value.RATE_LIMIT_ENABLED,
    rateLimitLoginMax: value.RATE_LIMIT_LOGIN_MAX,
    rateLimitRegisterMax: value.RATE_LIMIT_REGISTER_MAX,
  };
}
