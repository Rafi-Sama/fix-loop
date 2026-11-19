import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { forbidden, tooMany } from '../lib/errors.js';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const securityPlugin = fp(async (app: FastifyInstance) => {
  const appOrigin = new URL(app.config.APP_URL).origin;

  // JSON API: no HTML is served, so a locked-down CSP is free.
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  await app.register(cors, { origin: appOrigin, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'] });

  // shortcut: in-memory store is per instance; switch to a Redis store when running more than one API instance.
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.auth?.userId ?? req.ip,
    // Thrown into the shared error handler, so 429s use the same { error: { code, message } } shape.
    errorResponseBuilder: (_req, ctx) => tooMany(`Rate limit exceeded, retry in ${Math.ceil(ctx.ttl / 1000)}s`),
  });

  // CSRF: the session cookie is SameSite=Lax (the ops cookie Strict), and every state-changing cookie-authenticated
  // request must also come from our own web origin. Token links don't use cookies, so they're exempt.
  // A foreign Origin is rejected even when signed out, which also blocks login CSRF.
  app.addHook('preHandler', async (req) => {
    if (!UNSAFE.has(req.method) || req.url.startsWith('/links/') || req.url.startsWith('/public/')) return;
    const origin = req.headers.origin;
    // req.platform: the /platform plugin resolves the ops cookie in its own onRequest hook, before this runs.
    if (req.auth || req.platform ? origin !== appOrigin : origin !== undefined && origin !== appOrigin) {
      throw forbidden('Cross-origin request blocked');
    }
  });
});
