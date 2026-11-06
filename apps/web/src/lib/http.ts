import {
  ApiErrorSchema,
  CharacterListResponseSchema,
  CharacterSchema,
  CampaignListResponseSchema,
  CampaignSchema,
  RollListResponseSchema,
  RollSchema,
  SessionResponseSchema,
  type Campaign,
  type Character,
  type CreateCampaignRequestSchema,
  type CreateCharacterRequestSchema,
  type Roll,
  type RollRequest,
  type UpdateCharacterRequest,
  type User,
} from '@mythweaver/contracts';
import type { ZodType, z } from 'zod';

/** Request types are the *input* shape, so optional defaults stay optional for callers. */
type CreateCampaignInput = z.input<typeof CreateCampaignRequestSchema>;
type CreateCharacterInput = z.input<typeof CreateCharacterRequestSchema>;

const BASE = '/api/v1';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, string[]>;

  constructor(status: number, code: string, message: string, details?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }
}

function readCsrfToken(): string | null {
  // The API sets a readable cookie on every response; the double-submit header mirrors it.
  const entry = document.cookie.split('; ').find((part) => part.startsWith('mw_csrf='));
  return entry ? decodeURIComponent(entry.slice('mw_csrf='.length)) : null;
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Skip the CSRF header for the two endpoints that are exempt server-side. */
  anonymousMutation?: boolean;
  /** Replayed outbox writes send the operation id, so a duplicate delivery is collapsed. */
  idempotencyKey?: string;
};

/**
 * `schema` is null for 204 responses: there is no body to validate, and pretending otherwise
 * forces every caller to invent a schema for "nothing".
 */
async function request<T>(
  path: string,
  schema: ZodType<T> | null,
  options: RequestOptions = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  const csrf = readCsrfToken();
  if (method !== 'GET' && !options.anonymousMutation && csrf) {
    headers['x-csrf-token'] = csrf;
  }
  if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(payload);
    if (parsed.success) {
      throw new ApiError(
        response.status,
        parsed.data.error.code,
        parsed.data.error.message,
        parsed.data.error.details,
      );
    }
    throw new ApiError(response.status, 'internal_error', `Request failed (${response.status})`);
  }

  // Contract drift shows up here rather than as `undefined` three components later.
  if (!schema) return payload as T;
  return schema.parse(payload);
}

export const api = {
  me: () => request('/me', SessionResponseSchema),

  login: (email: string, password: string) =>
    request('/auth/login', SessionResponseSchema, {
      method: 'POST',
      body: { email, password },
      anonymousMutation: true,
    }),

  register: (email: string, displayName: string, password: string) =>
    request('/auth/register', SessionResponseSchema, {
      method: 'POST',
      body: { email, displayName, password },
      anonymousMutation: true,
    }),

  // Logout is idempotent server-side; a failure here should still clear local state.
  logout: () =>
    request<void>('/auth/logout', null, { method: 'POST', body: {} }).catch(() => undefined),

  listCampaigns: () => request('/campaigns', CampaignListResponseSchema),

  createCampaign: (input: CreateCampaignInput) =>
    request('/campaigns', CampaignSchema, { method: 'POST', body: input }),

  getCampaign: (id: string) => request(`/campaigns/${id}`, CampaignSchema),

  updateCampaign: (id: string, input: Partial<CreateCampaignInput> & { archived?: boolean }) =>
    request(`/campaigns/${id}`, CampaignSchema, { method: 'PATCH', body: input }),

  deleteCampaign: (id: string, confirmName: string) =>
    request<void>(`/campaigns/${id}`, null, { method: 'DELETE', body: { confirmName } }),

  listCharacters: (campaignId: string) =>
    request(`/campaigns/${campaignId}/characters`, CharacterListResponseSchema),

  createCharacter: (campaignId: string, input: CreateCharacterInput) =>
    request(`/campaigns/${campaignId}/characters`, CharacterSchema, {
      method: 'POST',
      body: input,
    }),

  updateCharacter: (
    campaignId: string,
    characterId: string,
    input: UpdateCharacterRequest,
    idempotencyKey?: string,
  ) =>
    request(`/campaigns/${campaignId}/characters/${characterId}`, CharacterSchema, {
      method: 'PATCH',
      body: input,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    }),

  roll: (campaignId: string, input: RollRequest, idempotencyKey?: string) =>
    request(`/campaigns/${campaignId}/rolls`, RollSchema, {
      method: 'POST',
      body: input,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    }),

  listRolls: (campaignId: string, limit = 20) =>
    request(`/campaigns/${campaignId}/rolls?limit=${limit}`, RollListResponseSchema),
};

export type { Campaign, Character, Roll, User };
