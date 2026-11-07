import {
  ApiErrorSchema,
  CharacterListResponseSchema,
  CharacterSchema,
  CampaignListResponseSchema,
  CampaignSchema,
  RollListResponseSchema,
  RollSchema,
  FactionListResponseSchema,
  FactionSchema,
  JournalEntrySchema,
  JournalListResponseSchema,
  LocationListResponseSchema,
  LocationSchema,
  NpcListResponseSchema,
  NpcSchema,
  RelationshipListResponseSchema,
  RelationshipSchema,
  SessionResponseSchema,
  type Campaign,
  type Character,
  type CreateCampaignRequestSchema,
  type CreateCharacterRequestSchema,
  type Roll,
  type RollRequest,
  type Faction,
  type JournalEntry,
  type JournalLink,
  type Npc,
  type Relationship,
  type UpdateCharacterRequest,
  type User,
  type WorldKind,
  type WorldLocation,
} from '@mythweaver/contracts';
import type { ZodType, z } from 'zod';

/** Request types are the *input* shape, so optional defaults stay optional for callers. */
type CreateCampaignInput = z.input<typeof CreateCampaignRequestSchema>;
type CreateCharacterInput = z.input<typeof CreateCharacterRequestSchema>;

export type WorldEntity = Npc | Faction | WorldLocation;
/** The list key differs per kind, so callers get one shape back. */
type CreateWorldInput = Record<string, unknown>;

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

  // --- world ---------------------------------------------------------------

  async listWorld(campaignId: string, kind: WorldKind, query = ''): Promise<WorldEntity[]> {
    const suffix = query ? `?q=${encodeURIComponent(query)}` : '';
    if (kind === 'npc') {
      return (await request(`/campaigns/${campaignId}/npcs${suffix}`, NpcListResponseSchema)).npcs;
    }
    if (kind === 'faction') {
      return (
        await request(`/campaigns/${campaignId}/factions${suffix}`, FactionListResponseSchema)
      ).factions;
    }
    return (
      await request(`/campaigns/${campaignId}/locations${suffix}`, LocationListResponseSchema)
    ).locations;
  },

  async createWorld(
    campaignId: string,
    kind: WorldKind,
    input: CreateWorldInput,
  ): Promise<WorldEntity> {
    if (kind === 'npc') {
      return request(`/campaigns/${campaignId}/npcs`, NpcSchema, { method: 'POST', body: input });
    }
    if (kind === 'faction') {
      return request(`/campaigns/${campaignId}/factions`, FactionSchema, {
        method: 'POST',
        body: input,
      });
    }
    return request(`/campaigns/${campaignId}/locations`, LocationSchema, {
      method: 'POST',
      body: input,
    });
  },

  async deleteWorld(campaignId: string, kind: WorldKind, entityId: string): Promise<void> {
    const path = kind === 'npc' ? 'npcs' : kind === 'faction' ? 'factions' : 'locations';
    await request<void>(`/campaigns/${campaignId}/${path}/${entityId}`, null, {
      method: 'DELETE',
    });
  },

  listRelationships: (campaignId: string) =>
    request(`/campaigns/${campaignId}/relationships`, RelationshipListResponseSchema),

  createRelationship: (
    campaignId: string,
    input: {
      sourceType: WorldKind | 'character';
      sourceId: string;
      targetType: WorldKind | 'character';
      targetId: string;
      kind: string;
    },
  ) =>
    request(`/campaigns/${campaignId}/relationships`, RelationshipSchema, {
      method: 'POST',
      body: input,
    }),

  deleteRelationship: (campaignId: string, relationshipId: string) =>
    request<void>(`/campaigns/${campaignId}/relationships/${relationshipId}`, null, {
      method: 'DELETE',
    }),

  listJournal: (campaignId: string, query = '') =>
    request(
      `/campaigns/${campaignId}/journal${query ? `?q=${encodeURIComponent(query)}` : ''}`,
      JournalListResponseSchema,
    ),

  createJournalEntry: (
    campaignId: string,
    input: { title: string; body?: string; tags?: string[]; links?: JournalLink[] },
  ) =>
    request(`/campaigns/${campaignId}/journal`, JournalEntrySchema, {
      method: 'POST',
      body: input,
    }),

  deleteJournalEntry: (campaignId: string, entryId: string) =>
    request<void>(`/campaigns/${campaignId}/journal/${entryId}`, null, { method: 'DELETE' }),
};

export type {
  Campaign,
  Character,
  Faction,
  JournalEntry,
  Npc,
  Relationship,
  Roll,
  User,
  WorldLocation,
};
