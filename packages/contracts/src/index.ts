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
    /** Revision the client edited from; a mismatch is a 409 instead of a silent overwrite. */
    baseRevision: z.number().int().min(1).optional(),
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

// ---------------------------------------------------------------------------
// Characters and rolls (Ironsworn sheet model)
// ---------------------------------------------------------------------------

export const StatSchema = z.enum(['edge', 'heart', 'iron', 'shadow', 'wits']);
export type Stat = z.infer<typeof StatSchema>;

export const DebilitySchema = z.enum(['wounded', 'shaken', 'unprepared']);
export type Debility = z.infer<typeof DebilitySchema>;

export const StatsSchema = z.object({
  edge: z.number().int().min(0).max(5),
  heart: z.number().int().min(0).max(5),
  iron: z.number().int().min(0).max(5),
  shadow: z.number().int().min(0).max(5),
  wits: z.number().int().min(0).max(5),
});
export type Stats = z.infer<typeof StatsSchema>;

export const CharacterSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  name: z.string(),
  stats: StatsSchema,
  /** Meters, 0..5 on the sheet. */
  health: z.number().int().min(0).max(5),
  spirit: z.number().int().min(0).max(5),
  supply: z.number().int().min(0).max(5),
  /** -6..10; the effective maximum drops with marked debilities. */
  momentum: z.number().int().min(-6).max(10),
  debilities: z.array(DebilitySchema),
  xp: z.number().int().min(0),
  notes: z.string().nullable(),
  revision: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Character = z.infer<typeof CharacterSchema>;

/**
 * Defaults are a starting build, not a validated one: a player assigns +3/+2/+2/+1/+1 in the
 * book, and the sheet is fully editable. Build legality is not enforced yet (see rules coverage).
 */
export const CreateCharacterRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  stats: StatsSchema.default({ edge: 2, heart: 1, iron: 3, shadow: 2, wits: 1 }),
  health: z.number().int().min(0).max(5).default(5),
  spirit: z.number().int().min(0).max(5).default(5),
  supply: z.number().int().min(0).max(5).default(5),
  momentum: z.number().int().min(-6).max(10).default(2),
  notes: z.string().trim().max(4000).optional(),
});
export type CreateCharacterRequest = z.infer<typeof CreateCharacterRequestSchema>;

export const UpdateCharacterRequestSchema = z
  .object({
    /** Revision the client edited from; a mismatch is a 409 instead of a silent overwrite. */
    baseRevision: z.number().int().min(1).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    stats: StatsSchema.optional(),
    health: z.number().int().min(0).max(5).optional(),
    spirit: z.number().int().min(0).max(5).optional(),
    supply: z.number().int().min(0).max(5).optional(),
    momentum: z.number().int().min(-6).max(10).optional(),
    debilities: z.array(DebilitySchema).max(3).optional(),
    xp: z.number().int().min(0).max(999).optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });
export type UpdateCharacterRequest = z.infer<typeof UpdateCharacterRequestSchema>;

export const OutcomeSchema = z.enum(['strong_hit', 'weak_hit', 'miss']);
export type RollOutcome = z.infer<typeof OutcomeSchema>;

export const RollRequestSchema = z.object({
  characterId: z.string().uuid(),
  stat: StatSchema,
  /** Flat adds from assets or move text, applied to stat before the action die. */
  adds: z.number().int().min(-5).max(10).default(0),
  /** Spend positive momentum: cancels challenge dice below it, then resets momentum. */
  burnMomentum: z.boolean().default(false),
  /** Optional move id for the journal; moves themselves are data, not server logic. */
  moveId: z.string().trim().max(64).optional(),
  /**
   * Dice rolled offline by the client. The server re-derives the outcome from them with the same
   * engine rather than trusting a stated result. Omitted means "roll on the server".
   */
  dice: z
    .object({
      actionDie: z.number().int().min(1).max(6),
      challenge: z.tuple([z.number().int().min(1).max(10), z.number().int().min(1).max(10)]),
    })
    .optional(),
});
export type RollRequest = z.infer<typeof RollRequestSchema>;

export const RollSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  characterId: z.string().uuid().nullable(),
  moveId: z.string().nullable(),
  stat: StatSchema,
  adds: z.number().int(),
  actionDie: z.number().int(),
  /** A burned die is stored as 0 so the record shows why it counted as beaten. */
  challenge: z.tuple([z.number().int(), z.number().int()]),
  actionScore: z.number().int(),
  outcome: OutcomeSchema,
  match: z.boolean(),
  burned: z.boolean(),
  /** `server` when the API rolled, `client` when offline dice were submitted. */
  source: z.enum(['server', 'client']),
  momentumBefore: z.number().int().nullable(),
  momentumAfter: z.number().int().nullable(),
  createdAt: z.string().datetime(),
});
export type Roll = z.infer<typeof RollSchema>;

export const RollListResponseSchema = z.object({
  rolls: z.array(RollSchema),
});
export type RollListResponse = z.infer<typeof RollListResponseSchema>;

export const CharacterListResponseSchema = z.object({
  characters: z.array(CharacterSchema),
});
export type CharacterListResponse = z.infer<typeof CharacterListResponseSchema>;

// ---------------------------------------------------------------------------
// World: NPCs, factions, locations, relationships, journal
// ---------------------------------------------------------------------------

export const WorldKindSchema = z.enum(['npc', 'faction', 'location']);
export type WorldKind = z.infer<typeof WorldKindSchema>;

/** Fields every world entity shares. */
const worldBase = {
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  tags: z.array(z.string()),
  revision: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
};

export const NpcSchema = z.object({
  ...worldBase,
  role: z.string().nullable(),
  /** The faction this NPC belongs to, if any. A dangling id is cleared on faction delete. */
  factionId: z.string().uuid().nullable(),
});
export type Npc = z.infer<typeof NpcSchema>;

export const FactionSchema = z.object(worldBase);
export type Faction = z.infer<typeof FactionSchema>;

export const LocationKindSchema = z.enum(['settlement', 'site', 'wilds', 'other']);
export const LocationSchema = z.object({
  ...worldBase,
  kind: LocationKindSchema,
});
export type WorldLocation = z.infer<typeof LocationSchema>;

const TagsSchema = z.array(z.string().trim().min(1).max(32)).max(12).default([]);

export const CreateNpcRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().max(60).optional(),
  description: z.string().trim().max(4000).optional(),
  factionId: z.string().uuid().nullable().optional(),
  tags: TagsSchema,
});
export type CreateNpcRequest = z.infer<typeof CreateNpcRequestSchema>;

export const UpdateNpcRequestSchema = z
  .object({
    baseRevision: z.number().int().min(1).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    role: z.string().trim().max(60).nullable().optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    factionId: z.string().uuid().nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(32)).max(12).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field' });

export const CreateFactionRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(4000).optional(),
  tags: TagsSchema,
});

export const UpdateFactionRequestSchema = z
  .object({
    baseRevision: z.number().int().min(1).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(32)).max(12).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field' });

export const CreateLocationRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: LocationKindSchema.default('other'),
  description: z.string().trim().max(4000).optional(),
  tags: TagsSchema,
});

export const UpdateLocationRequestSchema = z
  .object({
    baseRevision: z.number().int().min(1).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    kind: LocationKindSchema.optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(32)).max(12).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field' });

export const NpcListResponseSchema = z.object({ npcs: z.array(NpcSchema) });
export const FactionListResponseSchema = z.object({ factions: z.array(FactionSchema) });
export const LocationListResponseSchema = z.object({ locations: z.array(LocationSchema) });

/** Edges are plain pairs; both ends are resolved and checked in the service. */
export const RelationshipTypeSchema = z.enum(['npc', 'faction', 'location', 'character']);
export type RelationshipType = z.infer<typeof RelationshipTypeSchema>;

export const RelationshipSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  sourceType: RelationshipTypeSchema,
  sourceId: z.string().uuid(),
  targetType: RelationshipTypeSchema,
  targetId: z.string().uuid(),
  kind: z.string(),
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type Relationship = z.infer<typeof RelationshipSchema>;

export const CreateRelationshipRequestSchema = z
  .object({
    sourceType: RelationshipTypeSchema,
    sourceId: z.string().uuid(),
    targetType: RelationshipTypeSchema,
    targetId: z.string().uuid(),
    kind: z.string().trim().min(1).max(40),
    note: z.string().trim().max(500).optional(),
  })
  .refine(
    (value) => !(value.sourceType === value.targetType && value.sourceId === value.targetId),
    {
      message: 'An entity cannot be related to itself',
    },
  );

export const RelationshipListResponseSchema = z.object({
  relationships: z.array(RelationshipSchema),
});

export const JournalLinkSchema = z.object({
  type: RelationshipTypeSchema,
  id: z.string().uuid(),
  label: z.string().max(120),
});
export type JournalLink = z.infer<typeof JournalLinkSchema>;

export const JournalEntrySchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  title: z.string(),
  body: z.string(),
  tags: z.array(z.string()),
  links: z.array(JournalLinkSchema),
  /** Set when the entry was created from a roll. */
  rollId: z.string().uuid().nullable(),
  revision: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type JournalEntry = z.infer<typeof JournalEntrySchema>;

export const CreateJournalRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().max(20000).default(''),
  tags: TagsSchema,
  links: z.array(JournalLinkSchema).max(20).default([]),
  rollId: z.string().uuid().optional(),
});

export const UpdateJournalRequestSchema = z
  .object({
    baseRevision: z.number().int().min(1).optional(),
    title: z.string().trim().min(1).max(160).optional(),
    body: z.string().trim().max(20000).optional(),
    tags: z.array(z.string().trim().min(1).max(32)).max(12).optional(),
    links: z.array(JournalLinkSchema).max(20).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field' });

export const JournalListResponseSchema = z.object({ entries: z.array(JournalEntrySchema) });

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

export const EXPORT_FORMAT = 'mythweaver.campaign';
export const EXPORT_VERSION = 2;

/**
 * A campaign leaves the server as one self-contained JSON document. Identifiers inside are the
 * ones from the export; an import remaps them, so two bundles never collide.
 */
export const ExportCampaignSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  rulesetId: z.string(),
  rulesetVersion: z.string().nullable(),
});

export const ExportCharacterSchema = CharacterSchema.omit({
  campaignId: true,
  createdAt: true,
  updatedAt: true,
});
export const ExportNpcSchema = NpcSchema.omit({
  campaignId: true,
  createdAt: true,
  updatedAt: true,
});
export const ExportFactionSchema = FactionSchema.omit({
  campaignId: true,
  createdAt: true,
  updatedAt: true,
});
export const ExportLocationSchema = LocationSchema.omit({
  campaignId: true,
  createdAt: true,
  updatedAt: true,
});
export const ExportRelationshipSchema = RelationshipSchema.omit({
  campaignId: true,
  createdAt: true,
});
export const ExportJournalSchema = JournalEntrySchema.omit({
  campaignId: true,
  createdAt: true,
  updatedAt: true,
});
export const ExportRollSchema = RollSchema.omit({ campaignId: true, createdAt: true });

export const CampaignBundleSchema = z
  .object({
    format: z.literal(EXPORT_FORMAT),
    version: z.literal(EXPORT_VERSION),
    /** One map per campaign in v2; null when the campaign has none. */
    exportedAt: z.string().datetime(),
    campaign: ExportCampaignSchema,
    characters: z.array(ExportCharacterSchema),
    npcs: z.array(ExportNpcSchema),
    factions: z.array(ExportFactionSchema),
    locations: z.array(ExportLocationSchema),
    relationships: z.array(ExportRelationshipSchema),
    journal: z.array(ExportJournalSchema),
    rolls: z.array(ExportRollSchema),
    map: z.lazy(() => ExportMapSchema).nullable(),
  })
  .strict();

/** A v1 file as it was written: same shape, no map, checksum at the top. */
export const CampaignBundleV1Schema = z
  .object({
    format: z.literal(EXPORT_FORMAT),
    version: z.literal(1),
    exportedAt: z.string().datetime(),
    campaign: ExportCampaignSchema,
    characters: z.array(ExportCharacterSchema),
    npcs: z.array(ExportNpcSchema),
    factions: z.array(ExportFactionSchema),
    locations: z.array(ExportLocationSchema),
    relationships: z.array(ExportRelationshipSchema),
    journal: z.array(ExportJournalSchema),
    rolls: z.array(ExportRollSchema),
  })
  .strict();

export const CampaignExportSchema = CampaignBundleSchema.extend({
  /** sha256 over the canonical JSON of every other field, so a hand-edited file is noticeable. */
  checksum: z.string().regex(/^sha256:[0-9a-f]{64}$/),
});
export type CampaignExport = z.infer<typeof CampaignExportSchema>;
export type CampaignBundle = z.infer<typeof CampaignBundleSchema>;

export const ImportPreviewSchema = z.object({
  campaignName: z.string(),
  counts: z.object({
    characters: z.number().int(),
    npcs: z.number().int(),
    factions: z.number().int(),
    locations: z.number().int(),
    relationships: z.number().int(),
    journal: z.number().int(),
    rolls: z.number().int(),
  }),
  warnings: z.array(z.string()),
});

export type ImportPreview = z.infer<typeof ImportPreviewSchema>;

export const ImportResultSchema = ImportPreviewSchema.extend({
  campaignId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Maps
// ---------------------------------------------------------------------------

export const MAP_MIME_TYPES = ['image/png', 'image/jpeg'] as const;
export const MapMimeSchema = z.enum(MAP_MIME_TYPES);
export type MapMime = z.infer<typeof MapMimeSchema>;

export const MapMarkerSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  /** Normalized 0..1 so a marker lands on the same spot at any display size. */
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  label: z.string(),
  locationId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});
export type MapMarker = z.infer<typeof MapMarkerSchema>;

export const CampaignMapSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  name: z.string(),
  mimeType: MapMimeSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** Who made the image, and under what licence. Empty for a picture the player drew. */
  attribution: z.string().nullable(),
  revision: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CampaignMap = z.infer<typeof CampaignMapSchema>;

export const MapResponseSchema = z.object({
  map: CampaignMapSchema.nullable(),
  markers: z.array(MapMarkerSchema),
});

export const UpdateMapRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    attribution: z.string().trim().max(400).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field' });

export const CreateMarkerRequestSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  label: z.string().trim().min(1).max(120),
  locationId: z.string().uuid().nullable().optional(),
});

export const UpdateMarkerRequestSchema = z
  .object({
    x: z.number().min(0).max(1).optional(),
    y: z.number().min(0).max(1).optional(),
    label: z.string().trim().min(1).max(120).optional(),
    locationId: z.string().uuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field' });

/** 2 MB of image; base64 grows it by a third, which the import cap accounts for. */
export const MAX_MAP_BYTES = 2 * 1024 * 1024;

export const ExportMapSchema = z.object({
  name: z.string(),
  mimeType: MapMimeSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  attribution: z.string().nullable(),
  /** Base64 of the original bytes, so the file stays a single readable document. */
  dataBase64: z.string().max(Math.ceil(MAX_MAP_BYTES * 1.4)),
  markers: z.array(
    z.object({
      id: z.string().uuid(),
      x: z.number(),
      y: z.number(),
      label: z.string(),
      locationId: z.string().uuid().nullable(),
    }),
  ),
});
