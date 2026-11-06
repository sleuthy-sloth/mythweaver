import { z } from 'zod';

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
    isProduction: value.NODE_ENV === 'production',
    isTest: value.NODE_ENV === 'test',
  };
}
