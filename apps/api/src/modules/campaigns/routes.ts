import {
  CampaignListResponseSchema,
  CampaignSchema,
  CreateCampaignRequestSchema,
  DeleteCampaignRequestSchema,
  UpdateCampaignRequestSchema,
} from '@mythweaver/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '../../db/client';
import { requireUser } from '../auth/session';
import {
  createCampaign,
  deleteCampaign,
  getCampaignForUser,
  listCampaigns,
  toCampaignDto,
  updateCampaign,
} from './service';

export type CampaignRoutesOptions = { db: Database };

const CampaignParamsSchema = z.object({ id: z.string().uuid('Expected a campaign id') });

export const campaignRoutes: FastifyPluginAsyncZod<CampaignRoutesOptions> = async (app, opts) => {
  const { db } = opts;

  app.get(
    '/campaigns',
    {
      schema: {
        tags: ['campaigns'],
        summary: 'Campaigns the caller can see',
        response: { 200: CampaignListResponseSchema },
      },
    },
    async (request) => {
      const user = requireUser(request);
      return { campaigns: await listCampaigns(db, user.id) };
    },
  );

  app.post(
    '/campaigns',
    {
      schema: {
        tags: ['campaigns'],
        summary: 'Create a private campaign',
        body: CreateCampaignRequestSchema,
        response: { 201: CampaignSchema },
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const campaign = await createCampaign(db, user.id, request.body);
      return reply.status(201).send(campaign);
    },
  );

  app.get(
    '/campaigns/:id',
    {
      schema: {
        tags: ['campaigns'],
        summary: 'One campaign',
        params: CampaignParamsSchema,
        response: { 200: CampaignSchema },
      },
    },
    async (request) => {
      const user = requireUser(request);
      const { campaign, role } = await getCampaignForUser(db, user.id, request.params.id);
      return toCampaignDto(campaign, role);
    },
  );

  app.patch(
    '/campaigns/:id',
    {
      schema: {
        tags: ['campaigns'],
        summary: 'Rename, re-describe, archive or unarchive',
        params: CampaignParamsSchema,
        body: UpdateCampaignRequestSchema,
        response: { 200: CampaignSchema },
      },
    },
    async (request) => {
      const user = requireUser(request);
      return updateCampaign(db, user.id, request.params.id, request.body);
    },
  );

  app.delete(
    '/campaigns/:id',
    {
      schema: {
        tags: ['campaigns'],
        summary: 'Soft-delete a campaign (requires its exact name)',
        params: CampaignParamsSchema,
        body: DeleteCampaignRequestSchema,
        response: { 204: {} },
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      await deleteCampaign(db, user.id, request.params.id, request.body.confirmName);
      return reply.status(204).send();
    },
  );
};
