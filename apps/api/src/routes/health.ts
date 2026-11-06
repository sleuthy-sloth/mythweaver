import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { HealthLiveSchema, HealthReadySchema } from '@mythweaver/contracts';

export type HealthOptions = {
  version: string;
  /** Returns query latency in ms, or throws if Postgres is unreachable. */
  checkDatabase?: () => Promise<number>;
};

const READY_TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`readiness check exceeded ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export const healthRoutes: FastifyPluginAsyncZod<HealthOptions> = async (app, opts) => {
  const startedAt = performance.now();

  /**
   * Liveness answers "is this process alive?" and nothing else. It must never depend on
   * Postgres, or an orchestrator will restart a healthy API during a database blip.
   */
  app.get(
    '/health/live',
    {
      schema: {
        tags: ['health'],
        summary: 'Process liveness',
        response: { 200: HealthLiveSchema },
      },
    },
    async () => ({
      status: 'ok' as const,
      service: 'mythweaver-api' as const,
      version: opts.version,
      uptimeSeconds: Math.round((performance.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    }),
  );

  /**
   * Readiness answers "can this process serve real traffic?" A 503 here is the signal to
   * keep the container out of the load balancer, not to kill it.
   */
  app.get(
    '/health/ready',
    {
      schema: {
        tags: ['health'],
        summary: 'Dependency readiness',
        response: { 200: HealthReadySchema, 503: HealthReadySchema },
      },
    },
    async (_request, reply) => {
      const timestamp = new Date().toISOString();

      if (!opts.checkDatabase) {
        return reply.status(503).send({
          status: 'fail' as const,
          checks: { database: { status: 'fail' as const, detail: 'not configured' } },
          timestamp,
        });
      }

      try {
        const latencyMs = await withTimeout(opts.checkDatabase(), READY_TIMEOUT_MS);
        return reply.status(200).send({
          status: 'ok' as const,
          checks: { database: { status: 'ok' as const, latencyMs } },
          timestamp,
        });
      } catch {
        // The reason stays in the logs; the response must not leak hostnames or credentials.
        reply.log.warn('readiness check failed');
        return reply.status(503).send({
          status: 'degraded' as const,
          checks: { database: { status: 'fail' as const, detail: 'unreachable' } },
          timestamp,
        });
      }
    },
  );
};
