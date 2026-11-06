import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import { API_PREFIX, CONTRACT_VERSION, type ApiErrorCode } from '@mythweaver/contracts';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { ZodError } from 'zod';
import type { AppConfig } from './config';
import { healthRoutes } from './routes/health';

export type AppDeps = {
  config: AppConfig;
  /** Injected so tests never need a live database. */
  checkDatabase?: () => Promise<number>;
};

const STATUS_TO_CODE: Record<number, ApiErrorCode> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  429: 'rate_limited',
};

export async function buildApp({ config, checkDatabase }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.isTest
      ? false
      : {
          level: config.logLevel,
          // Never let a password, session cookie or bearer token reach the log sink.
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
              'req.body.password',
              'req.body.currentPassword',
              'req.body.newPassword',
            ],
            censor: '[redacted]',
          },
        },
    trustProxy: true,
    bodyLimit: 1_048_576,
    requestIdHeader: 'x-request-id',
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet, {
    contentSecurityPolicy: false, // JSON API; the web container owns the page CSP.
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

  // No CORS plugin at all when nothing is configured: same-origin only is the safe default.
  if (config.corsOrigins.length > 0) {
    await app.register(cors, { origin: config.corsOrigins, credentials: true });
  }

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Mythweaver API',
        description: 'Contract for the Mythweaver self-hosted solo RPG platform.',
        version: CONTRACT_VERSION,
      },
      tags: [{ name: 'health', description: 'Liveness and readiness probes' }],
    },
    transform: jsonSchemaTransform,
  });

  /**
   * The spec is served as JSON. `@fastify/swagger-ui` ships HTML and assets that resolve
   * relative to `__dirname`, which does not survive bundling into a single file; rather
   * than copy vendor assets into the image, the machine-readable contract is the deliverable
   * and any OpenAPI viewer can consume it.
   */
  app.get(`${API_PREFIX}/openapi.json`, { schema: { hide: true } }, async () => app.swagger());

  app.setErrorHandler((error: unknown, request, reply) => {
    const requestId = request.id;

    if (error instanceof ZodError) {
      const details: Record<string, string[]> = {};
      for (const issue of error.issues) {
        const key = issue.path.join('.') || '_';
        (details[key] ??= []).push(issue.message);
      }
      return reply.status(400).send({
        error: { code: 'bad_request', message: 'Request validation failed', requestId, details },
      });
    }

    // Fastify throws FastifyError, but dependencies can throw anything; narrow before reading.
    const candidate = error as { statusCode?: unknown; message?: unknown };
    const statusCode = typeof candidate.statusCode === 'number' ? candidate.statusCode : 500;
    const status = statusCode >= 400 && statusCode <= 599 ? statusCode : 500;
    const message = typeof candidate.message === 'string' ? candidate.message : 'Request failed';
    const code = STATUS_TO_CODE[status] ?? 'internal_error';

    if (status >= 500) {
      request.log.error({ err: error }, 'unhandled request error');
      return reply.status(status).send({
        error: { code, message: 'Internal server error', requestId },
      });
    }

    return reply.status(status).send({
      error: { code, message, requestId },
    });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: {
        code: 'not_found',
        message: `No route for ${request.method} ${request.url}`,
        requestId: request.id,
      },
    }),
  );

  await app.register(healthRoutes, {
    prefix: API_PREFIX,
    version: config.version,
    ...(checkDatabase ? { checkDatabase } : {}),
  });

  return app;
}
