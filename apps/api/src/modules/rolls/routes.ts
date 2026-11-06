import { RollListResponseSchema, RollRequestSchema, RollSchema } from '@mythweaver/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '../../db/client';
import { requireUser } from '../auth/session';
import { listRolls, recordRoll } from './service';

export type RollRoutesOptions = { db: Database };

const CampaignParams = z.object({ campaignId: z.string().uuid() });
const ListQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });

export const rollRoutes: FastifyPluginAsyncZod<RollRoutesOptions> = async (app, opts) => {
  const { db } = opts;

  app.post(
    '/campaigns/:campaignId/rolls',
    {
      schema: {
        tags: ['rolls'],
        summary: 'Roll an action move and record the result',
        params: CampaignParams,
        body: RollRequestSchema,
        response: { 201: RollSchema },
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const roll = await recordRoll(db, user.id, request.params.campaignId, request.body);
      return reply.status(201).send(roll);
    },
  );

  app.get(
    '/campaigns/:campaignId/rolls',
    {
      schema: {
        tags: ['rolls'],
        summary: 'Recent rolls, newest first',
        params: CampaignParams,
        querystring: ListQuery,
        response: { 200: RollListResponseSchema },
      },
    },
    async (request) => {
      const user = requireUser(request);
      return {
        rolls: await listRolls(db, user.id, request.params.campaignId, request.query.limit),
      };
    },
  );
};
