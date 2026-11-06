import {
  LoginRequestSchema,
  RegisterRequestSchema,
  SessionResponseSchema,
  type SessionResponse,
} from '@mythweaver/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppConfig } from '../../config';
import type { Database } from '../../db/client';
import { badRequest } from '../../lib/errors';
import { registerUser, toPublicUser, verifyCredentials } from './service';
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  clearSessionCookies,
  createSession,
  requireUser,
  revokeSession,
  sessionCookieOptions,
} from './session';

export type AuthRoutesOptions = {
  db: Database;
  config: AppConfig;
};

export const authRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (app, opts) => {
  const { db, config } = opts;

  // @fastify/rate-limit reads the per-route budget from `config.rateLimit`, not from the
  // route options themselves.
  const rateLimit = (max: number, timeWindow: string) =>
    config.rateLimitEnabled ? { config: { rateLimit: { max, timeWindow } } } : {};

  app.post(
    '/auth/register',
    {
      ...rateLimit(config.rateLimitRegisterMax, '10 minutes'),
      schema: {
        tags: ['auth'],
        summary: 'Create an account (when registration is open)',
        body: RegisterRequestSchema,
        response: { 201: SessionResponseSchema },
      },
    },
    async (request, reply) => {
      const user = await registerUser(db, config, request.body);
      const { token, expiresAt } = await createSession(db, user.id, config);

      reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(config, expiresAt));
      return reply.status(201).send({ user: toPublicUser(user) });
    },
  );

  app.post(
    '/auth/login',
    {
      ...rateLimit(config.rateLimitLoginMax, '1 minute'),
      schema: {
        tags: ['auth'],
        summary: 'Start a session',
        body: LoginRequestSchema,
        response: { 200: SessionResponseSchema },
      },
    },
    async (request, reply) => {
      const user = await verifyCredentials(db, request.body.email, request.body.password);
      const { token, expiresAt } = await createSession(db, user.id, config);

      // A fresh session on every login: the old cookie is replaced, not reused.
      reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(config, expiresAt));
      return reply.status(200).send({ user: toPublicUser(user) });
    },
  );

  /**
   * Logout is idempotent and always clears cookies, even without a valid session: a stale
   * cookie in the browser is exactly the state the user is trying to escape.
   */
  app.post(
    '/auth/logout',
    {
      // No response schema on purpose: 204 carries no body, and an empty object is not a
      // Zod type — passing one makes OpenAPI generation fail at request time.
      schema: { tags: ['auth'], summary: 'End the current session' },
    },
    async (request, reply) => {
      if (request.sessionId) {
        await revokeSession(db, request.sessionId);
      }
      clearSessionCookies(reply, config);
      return reply.status(204).send();
    },
  );

  app.get(
    '/me',
    {
      schema: {
        tags: ['auth'],
        summary: 'The signed-in account',
        response: { 200: SessionResponseSchema },
      },
    },
    async (request) => {
      const user = requireUser(request);
      return { user } satisfies SessionResponse;
    },
  );

  /**
   * Kept out of `/me` on purpose: the SPA needs a CSRF token before it can log in, and this
   * endpoint answers with one even when the session is anonymous.
   */
  app.get(
    '/auth/csrf',
    {
      schema: {
        tags: ['auth'],
        summary: 'Read the CSRF token cookie value',
        // Must be a Zod schema, not a raw JSON Schema object, or OpenAPI generation throws.
        response: { 200: z.object({ header: z.string() }) },
      },
    },
    async (request) => {
      const token = request.cookies[CSRF_COOKIE];
      if (!token) {
        // The onRequest hook installs one; reaching here means cookies are disabled.
        throw badRequest('Cookies are required to sign in');
      }
      return { header: token };
    },
  );
};
