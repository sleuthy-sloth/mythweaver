import {
  CampaignMapSchema,
  CreateMarkerRequestSchema,
  MapMarkerSchema,
  MapResponseSchema,
  UpdateMapRequestSchema,
  UpdateMarkerRequestSchema,
} from '@mythweaver/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '../../db/client';
import { badRequest } from '../../lib/errors';
import { requireUser } from '../auth/session';
import {
  createMarker,
  deleteMap,
  deleteMarker,
  getMap,
  MAX_MAP_BYTES,
  putMap,
  readMapImage,
  updateMap,
  updateMarker,
} from './service';

export type MapRoutesOptions = { db: Database };

const CampaignParams = z.object({ campaignId: z.string().uuid() });
const MarkerParams = CampaignParams.extend({ markerId: z.string().uuid() });

const IMAGE_TYPES = ['image/png', 'image/jpeg'];

export const mapRoutes: FastifyPluginAsyncZod<MapRoutesOptions> = async (app, opts) => {
  const { db } = opts;

  // The image arrives as raw bytes, not multipart: one file, one request, no parser to trust.
  app.addContentTypeParser(
    IMAGE_TYPES,
    { parseAs: 'buffer', bodyLimit: MAX_MAP_BYTES + 1024 },
    (_request, body, done) => done(null, body),
  );

  app.get(
    '/campaigns/:campaignId/map',
    {
      schema: {
        tags: ['maps'],
        summary: 'The campaign map and its markers',
        params: CampaignParams,
        response: { 200: MapResponseSchema },
      },
    },
    async (request) => {
      const user = requireUser(request);
      return getMap(db, user.id, request.params.campaignId);
    },
  );

  app.put(
    '/campaigns/:campaignId/map',
    {
      bodyLimit: MAX_MAP_BYTES + 1024,
      schema: {
        tags: ['maps'],
        summary: 'Upload or replace the map image (raw image/png or image/jpeg body)',
        params: CampaignParams,
        querystring: z.object({
          name: z.string().trim().max(120).optional(),
          attribution: z.string().trim().max(400).optional(),
        }),
        response: { 200: CampaignMapSchema },
      },
    },
    async (request) => {
      const user = requireUser(request);
      if (!Buffer.isBuffer(request.body)) throw badRequest('Send the image as the request body');

      return putMap(db, user.id, request.params.campaignId, {
        bytes: request.body,
        ...(request.query.name ? { name: request.query.name } : {}),
        ...(request.query.attribution ? { attribution: request.query.attribution } : {}),
      });
    },
  );

  app.patch(
    '/campaigns/:campaignId/map',
    {
      schema: {
        tags: ['maps'],
        summary: 'Rename the map or record its attribution',
        params: CampaignParams,
        body: UpdateMapRequestSchema,
        response: { 200: CampaignMapSchema },
      },
    },
    async (request) => {
      const user = requireUser(request);
      return updateMap(db, user.id, request.params.campaignId, request.body);
    },
  );

  app.delete(
    '/campaigns/:campaignId/map',
    {
      schema: {
        tags: ['maps'],
        summary: 'Remove the map and its markers',
        params: CampaignParams,
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      await deleteMap(db, user.id, request.params.campaignId);
      return reply.status(204).send();
    },
  );

  app.get(
    '/campaigns/:campaignId/map/image',
    {
      schema: {
        tags: ['maps'],
        summary: 'The image itself, behind the same membership check',
        params: CampaignParams,
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const image = await readMapImage(db, user.id, request.params.campaignId);
      // Private, and tied to the revision so a replaced map is not served from a stale cache.
      reply.header('cache-control', 'private, max-age=300');
      reply.header('etag', `"map-${image.revision}"`);
      return reply.type(image.mimeType).send(image.bytes);
    },
  );

  app.post(
    '/campaigns/:campaignId/map/markers',
    {
      schema: {
        tags: ['maps'],
        summary: 'Place a marker',
        params: CampaignParams,
        body: CreateMarkerRequestSchema,
        response: { 201: MapMarkerSchema },
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const marker = await createMarker(db, user.id, request.params.campaignId, request.body);
      return reply.status(201).send(marker);
    },
  );

  app.patch(
    '/campaigns/:campaignId/map/markers/:markerId',
    {
      schema: {
        tags: ['maps'],
        summary: 'Move or relabel a marker',
        params: MarkerParams,
        body: UpdateMarkerRequestSchema,
        response: { 200: MapMarkerSchema },
      },
    },
    async (request) => {
      const user = requireUser(request);
      return updateMarker(
        db,
        user.id,
        request.params.campaignId,
        request.params.markerId,
        request.body,
      );
    },
  );

  app.delete(
    '/campaigns/:campaignId/map/markers/:markerId',
    {
      schema: {
        tags: ['maps'],
        summary: 'Remove a marker',
        params: MarkerParams,
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      await deleteMarker(db, user.id, request.params.campaignId, request.params.markerId);
      return reply.status(204).send();
    },
  );
};
