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
export const CONTRACT_VERSION = '1.1.0';

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

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * Emails are normalised once, at the edge: trimmed and lowercased. The database also has a
 * unique index on `lower(email)`, so a routing bug cannot create two accounts for one address.
 */
export const EmailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .email('Enter a valid email address')
  .transform((value) => value.toLowerCase());

export const DisplayNameSchema = z.string().trim().min(1).max(80);

/**
 * Length over composition rules: a 12-character passphrase with no symbols beats
 * "Passw0rd!" and is easier to remember. 256 is a denial-of-service ceiling for the hasher.
 */
export const PasswordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(256, 'Use at most 256 characters');

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  displayName: z.string(),
  role: z.enum(['player', 'operator']),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof UserSchema>;

export const RegisterRequestSchema = z.object({
  email: EmailSchema,
  displayName: DisplayNameSchema,
  password: PasswordSchema,
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(256),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const SessionResponseSchema = z.object({
  user: UserSchema,
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export const CampaignRoleSchema = z.enum(['owner', 'editor', 'viewer']);
export type CampaignRole = z.infer<typeof CampaignRoleSchema>;

export const CampaignSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  rulesetId: z.string(),
  rulesetVersion: z.string().nullable(),
  /** The caller's role in this campaign; the UI needs it to decide what to show. */
  role: CampaignRoleSchema,
  archivedAt: z.string().datetime().nullable(),
  lastPlayedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  /** Monotonic per-campaign counter; the basis for sync conflict detection in Phase 3. */
  revision: z.number().int().nonnegative(),
});
export type Campaign = z.infer<typeof CampaignSchema>;

export const CampaignListResponseSchema = z.object({
  campaigns: z.array(CampaignSchema),
});
export type CampaignListResponse = z.infer<typeof CampaignListResponseSchema>;

export const CreateCampaignRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  rulesetId: z.string().trim().min(1).max(64).default('ironsworn'),
});
export type CreateCampaignRequest = z.infer<typeof CreateCampaignRequestSchema>;

/**
 * `description: null` clears it; omitting the field leaves it alone. `archived` toggles the
 * archive flag rather than exposing a raw timestamp, so the client cannot fake history.
 */
export const UpdateCampaignRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });
export type UpdateCampaignRequest = z.infer<typeof UpdateCampaignRequestSchema>;

/**
 * Deleting a campaign requires typing its name. It is a speed bump against a mis-tap, not a
 * security control; authorization still decides whether the delete happens at all.
 */
export const DeleteCampaignRequestSchema = z.object({
  confirmName: z.string().trim().min(1).max(120),
});
export type DeleteCampaignRequest = z.infer<typeof DeleteCampaignRequestSchema>;
