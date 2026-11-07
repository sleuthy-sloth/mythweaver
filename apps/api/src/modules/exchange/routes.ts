import { ImportPreviewSchema, ImportResultSchema } from '@mythweaver/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '../../db/client';
import { requireUser } from '../auth/session';
import { exportCampaign, importCampaign, previewImport } from './service';

export type ExchangeRoutesOptions = { db: Database };

const CampaignParams = z.object({ campaignId: z.string().uuid() });

/**
 * Imports are capped at 5 MB by the service. Fastify's global body limit is 1 MB, so these two
 * routes raise it locally rather than loosening it for every endpoint.
 */
const BIG_BODY = 6 * 1024 * 1024;

export const exchangeRoutes: FastifyPluginAsyncZod<ExchangeRoutesOptions> = async (app, opts) => {
  const { db } = opts;

  app.get(
    '/campaigns/:campaignId/export',
    {
      schema: {
        tags: ['exchange'],
        summary: 'Export one campaign as a versioned JSON document',
        params: CampaignParams,
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const { document, filename } = await exportCampaign(db, user.id, request.params.campaignId);
      return reply
        .header('content-type', 'application/json; charset=utf-8')
        .header('content-disposition', `attachment; filename="${filename}"`)
        .send(JSON.stringify(document, null, 2));
    },
  );

  // The body is validated by the service, not by a declared schema: an operator uploading last
  // year's file should get "this is not a Mythweaver export, here is why", not a generic 400.
  app.post(
    '/imports/preview',
    {
      bodyLimit: BIG_BODY,
      schema: {
        tags: ['exchange'],
        summary: 'Check an export file without writing anything',
        response: { 200: ImportPreviewSchema },
      },
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request) => {
      requireUser(request);
      return previewImport(request.body);
    },
  );

  app.post(
    '/imports',
    {
      bodyLimit: BIG_BODY,
      schema: {
        tags: ['exchange'],
        summary: 'Import an export file into a new campaign',
        response: { 201: ImportResultSchema },
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const result = await importCampaign(db, user.id, request.body);
      return reply.status(201).send({ ...result.preview, campaignId: result.campaignId });
    },
  );
};
