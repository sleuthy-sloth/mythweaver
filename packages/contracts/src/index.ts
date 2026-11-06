/**
 * Shared API contracts.
 *
 * Every request and response shape the browser and the server agree on lives here.
 * The server validates with these schemas; the client types against them. One source,
 * no drifting copies.
 */
import { z } from 'zod';

export const API_PREFIX = '/api/v1';

/** Bumped when a breaking change lands in an existing endpoint. */
export const CONTRACT_VERSION = '1.0.0';

export const ServiceStatusSchema = z.enum(['ok', 'degraded', 'fail']);
export type ServiceStatus = z.infer<typeof ServiceStatusSchema>;

export const HealthLiveSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('mythweaver-api'),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string().datetime(),
});
export type HealthLive = z.infer<typeof HealthLiveSchema>;

export const DependencyCheckSchema = z.object({
  status: ServiceStatusSchema,
  latencyMs: z.number().nonnegative().optional(),
  detail: z.string().optional(),
});
export type DependencyCheck = z.infer<typeof DependencyCheckSchema>;

export const HealthReadySchema = z.object({
  status: ServiceStatusSchema,
  checks: z.object({
    database: DependencyCheckSchema,
  }),
  timestamp: z.string().datetime(),
});
export type HealthReady = z.infer<typeof HealthReadySchema>;

/** Stable machine-readable error codes. Never parse human-readable messages. */
export const ApiErrorCodeSchema = z.enum([
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'internal_error',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    requestId: z.string().optional(),
    /** Field-level details for form validation; safe to render. */
    details: z.record(z.array(z.string())).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
