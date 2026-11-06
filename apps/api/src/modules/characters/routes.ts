import {
  CharacterListResponseSchema,
  CharacterSchema,
  CreateCharacterRequestSchema,
  UpdateCharacterRequestSchema,
} from '@mythweaver/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '../../db/client';
import { requireUser } from '../auth/session';
import {
  createCharacter,
  getCharacter,
  listCharacters,
  toCharacterDto,
  updateCharacter,
} from './service';

export type CharacterRoutesOptions = { db: Database };

const CampaignParams = z.object({ campaignId: z.string().uuid() });
const CharacterParams = CampaignParams.extend({ characterId: z.string().uuid() });

export const characterRoutes: FastifyPluginAsyncZod<CharacterRoutesOptions> = async (app, opts) => {
  const { db } = opts;

  app.get(
    '/campaigns/:campaignId/characters',
    {
      schema: {
        tags: ['characters'],
        summary: 'Characters in a campaign',
        params: CampaignParams,
        response: { 200: CharacterListResponseSchema },
      },
    },
    async (request) => {
      const user = requireUser(request);
      return { characters: await listCharacters(db, user.id, request.params.campaignId) };
    },
  );

  app.post(
    '/campaigns/:campaignId/characters',
    {
      schema: {
        tags: ['characters'],
        summary: 'Create a character sheet',
        params: CampaignParams,
        body: CreateCharacterRequestSchema,
        response: { 201: CharacterSchema },
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const character = await createCharacter(db, user.id, request.params.campaignId, request.body);
      return reply.status(201).send(character);
    },
  );

  app.get(
    '/campaigns/:campaignId/characters/:characterId',
    {
      schema: {
        tags: ['characters'],
        summary: 'One character sheet',
        params: CharacterParams,
        response: { 200: CharacterSchema },
      },
    },
    async (request) => {
      const user = requireUser(request);
      const row = await getCharacter(
        db,
        user.id,
        request.params.campaignId,
        request.params.characterId,
      );
      return toCharacterDto(row);
    },
  );

  app.patch(
    '/campaigns/:campaignId/characters/:characterId',
    {
      schema: {
        tags: ['characters'],
        summary: 'Update stats, meters, momentum, debilities or notes',
        params: CharacterParams,
        body: UpdateCharacterRequestSchema,
        response: { 200: CharacterSchema },
      },
    },
    async (request) => {
      const user = requireUser(request);
      return updateCharacter(
        db,
        user.id,
        request.params.campaignId,
        request.params.characterId,
        request.body,
      );
    },
  );
};
