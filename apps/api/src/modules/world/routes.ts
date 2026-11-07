import {
  CreateFactionRequestSchema,
  CreateJournalRequestSchema,
  CreateLocationRequestSchema,
  CreateNpcRequestSchema,
  CreateRelationshipRequestSchema,
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
  UpdateFactionRequestSchema,
  UpdateJournalRequestSchema,
  UpdateLocationRequestSchema,
  UpdateNpcRequestSchema,
  type WorldKind,
} from '@mythweaver/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '../../db/client';
import { requireUser } from '../auth/session';
import {
  createJournalEntry,
  createRelationship,
  createWorldEntity,
  deleteJournalEntry,
  deleteRelationship,
  deleteWorldEntity,
  getWorldEntity,
  listJournal,
  listRelationships,
  listWorld,
  updateJournalEntry,
  updateWorldEntity,
} from './service';

export type WorldRoutesOptions = { db: Database };

const CampaignParams = z.object({ campaignId: z.string().uuid() });
const EntityParams = CampaignParams.extend({ entityId: z.string().uuid() });
const RelationshipParams = CampaignParams.extend({ relationshipId: z.string().uuid() });
const JournalParams = CampaignParams.extend({ entryId: z.string().uuid() });

/** The loop below registers the same shape for every kind, so one loose request type covers it. */
type WorldRequest = FastifyRequest<{
  Params: { campaignId: string; entityId?: string };
  Querystring: { q?: string };
  Body: Record<string, unknown>;
}>;

type KindConfig = {
  kind: WorldKind;
  path: string;
  listKey: string;
  create: z.ZodTypeAny;
  update: z.ZodTypeAny;
  item: z.ZodTypeAny;
  list: z.ZodTypeAny;
};

const KIND_CONFIG: KindConfig[] = [
  {
    kind: 'npc',
    path: 'npcs',
    listKey: 'npcs',
    create: CreateNpcRequestSchema,
    update: UpdateNpcRequestSchema,
    item: NpcSchema,
    list: NpcListResponseSchema,
  },
  {
    kind: 'faction',
    path: 'factions',
    listKey: 'factions',
    create: CreateFactionRequestSchema,
    update: UpdateFactionRequestSchema,
    item: FactionSchema,
    list: FactionListResponseSchema,
  },
  {
    kind: 'location',
    path: 'locations',
    listKey: 'locations',
    create: CreateLocationRequestSchema,
    update: UpdateLocationRequestSchema,
    item: LocationSchema,
    list: LocationListResponseSchema,
  },
];

/**
 * One set of routes per world entity type: they differ in their extra columns and DTO shape, not in
 * how they are authorized or addressed, so they are registered from one config. The `as never`
 * casts keep Fastify's generic route typing out of a loop over heterogeneous schemas; validation
 * is still the Zod schema at runtime.
 */
function registerWorldKind(app: FastifyInstance, db: Database, config: KindConfig): void {
  const base = `/campaigns/:campaignId/${config.path}`;
  const tags = [config.path];

  app.get(
    base,
    {
      schema: {
        tags,
        summary: `List ${config.path}`,
        params: CampaignParams,
        querystring: z.object({ q: z.string().trim().max(120).optional() }),
        response: { 200: config.list },
      },
    } as never,
    async (request: WorldRequest) => {
      const user = requireUser(request);
      const items = await listWorld(
        db,
        user.id,
        request.params.campaignId,
        config.kind,
        request.query.q ?? undefined,
      );
      return { [config.listKey]: items };
    },
  );

  app.post(
    base,
    {
      schema: {
        tags,
        summary: `Create a ${config.kind}`,
        params: CampaignParams,
        body: config.create,
        response: { 201: config.item },
      },
    } as never,
    async (request: WorldRequest, reply: FastifyReply) => {
      const user = requireUser(request);
      const entity = await createWorldEntity(
        db,
        user.id,
        request.params.campaignId,
        config.kind,
        request.body as Record<string, unknown>,
      );
      return reply.status(201).send(entity);
    },
  );

  app.get(
    `${base}/:entityId`,
    {
      schema: {
        tags,
        summary: `Read one ${config.kind}`,
        params: EntityParams,
        response: { 200: config.item },
      },
    } as never,
    async (request: WorldRequest) => {
      const user = requireUser(request);
      return getWorldEntity(
        db,
        user.id,
        request.params.campaignId,
        config.kind,
        String(request.params.entityId),
      );
    },
  );

  app.patch(
    `${base}/:entityId`,
    {
      schema: {
        tags,
        summary: `Update a ${config.kind}`,
        params: EntityParams,
        body: config.update,
        response: { 200: config.item },
      },
    } as never,
    async (request: WorldRequest) => {
      const user = requireUser(request);
      return updateWorldEntity(
        db,
        user.id,
        request.params.campaignId,
        config.kind,
        String(request.params.entityId),
        request.body as Record<string, unknown>,
      );
    },
  );

  app.delete(
    `${base}/:entityId`,
    {
      schema: {
        tags,
        summary: `Delete a ${config.kind}`,
        params: EntityParams,
      },
    } as never,
    async (request: WorldRequest, reply: FastifyReply) => {
      const user = requireUser(request);
      await deleteWorldEntity(
        db,
        user.id,
        request.params.campaignId,
        config.kind,
        String(request.params.entityId),
      );
      return reply.status(204).send();
    },
  );
}

export const worldRoutes: FastifyPluginAsyncZod<WorldRoutesOptions> = async (app, opts) => {
  const { db } = opts;

  for (const config of KIND_CONFIG) registerWorldKind(app, db, config);

  app.get(
    '/campaigns/:campaignId/relationships',
    {
      schema: {
        tags: ['relationships'],
        summary: 'Edges between entities in a campaign',
        params: CampaignParams,
        response: { 200: RelationshipListResponseSchema },
      },
    },
    async (request) => {
      const user = requireUser(request);
      return { relationships: await listRelationships(db, user.id, request.params.campaignId) };
    },
  );

  app.post(
    '/campaigns/:campaignId/relationships',
    {
      schema: {
        tags: ['relationships'],
        summary: 'Link two entities',
        params: CampaignParams,
        body: CreateRelationshipRequestSchema,
        response: { 201: RelationshipSchema },
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const link = await createRelationship(db, user.id, request.params.campaignId, request.body);
      return reply.status(201).send(link);
    },
  );

  app.delete(
    '/campaigns/:campaignId/relationships/:relationshipId',
    {
      schema: {
        tags: ['relationships'],
        summary: 'Remove a link',
        params: RelationshipParams,
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      await deleteRelationship(
        db,
        user.id,
        request.params.campaignId,
        request.params.relationshipId,
      );
      return reply.status(204).send();
    },
  );

  app.get(
    '/campaigns/:campaignId/journal',
    {
      schema: {
        tags: ['journal'],
        summary: 'Journal entries, newest first, with optional search',
        params: CampaignParams,
        querystring: z.object({
          q: z.string().trim().max(120).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        }),
        response: { 200: JournalListResponseSchema },
      },
    },
    async (request) => {
      const user = requireUser(request);
      return {
        entries: await listJournal(db, user.id, request.params.campaignId, {
          ...((request.query.q ?? undefined) ? { query: request.query.q ?? undefined } : {}),
          limit: request.query.limit,
        }),
      };
    },
  );

  app.post(
    '/campaigns/:campaignId/journal',
    {
      schema: {
        tags: ['journal'],
        summary: 'Write an entry, optionally linked to entities or a roll',
        params: CampaignParams,
        body: CreateJournalRequestSchema,
        response: { 201: JournalEntrySchema },
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const entry = await createJournalEntry(db, user.id, request.params.campaignId, request.body);
      return reply.status(201).send(entry);
    },
  );

  app.patch(
    '/campaigns/:campaignId/journal/:entryId',
    {
      schema: {
        tags: ['journal'],
        summary: 'Edit an entry',
        params: JournalParams,
        body: UpdateJournalRequestSchema,
        response: { 200: JournalEntrySchema },
      },
    },
    async (request) => {
      const user = requireUser(request);
      return updateJournalEntry(
        db,
        user.id,
        request.params.campaignId,
        request.params.entryId,
        request.body,
      );
    },
  );

  app.delete(
    '/campaigns/:campaignId/journal/:entryId',
    {
      schema: {
        tags: ['journal'],
        summary: 'Delete an entry',
        params: JournalParams,
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      await deleteJournalEntry(db, user.id, request.params.campaignId, request.params.entryId);
      return reply.status(204).send();
    },
  );
};
