import { eq, sql } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { organizations, users } from '../../db/schema/index.js';
import { email, shortText } from '../../lib/validation.js';
import { requireUser, SESSION_TTL_MS, sessionCookieName } from '../../plugins/auth.js';
import { logSecurity } from '../../shared/security-log.js';
import * as auth from './auth.service.js';
import { dummyHash, passwordSchema } from './passwords.js';

const strict = { rateLimit: { max: 10, timeWindow: '1 minute', keyGenerator: (req: { ip: string }) => req.ip } };

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const production = app.config.NODE_ENV === 'production';
  const cookieName = sessionCookieName(production);
  auth.configureBreachCheck(app.config.PASSWORD_BREACH_CHECK);
  // Warm the timing-equaliser hash so the first unknown-email login isn't measurably faster.
  await dummyHash();

  const setSession = (reply: FastifyReply, token: string) =>
    reply.setCookie(cookieName, token, {
      httpOnly: true,
      secure: production,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_MS / 1000,
    });
  const meta = (req: { ip: string; headers: Record<string, unknown> }) => ({
    ip: req.ip,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
  });

  app.post(
    '/signup',
    {
      config: strict,
      schema: { body: z.object({ orgName: shortText, name: shortText, email, password: passwordSchema }) },
    },
    async (req, reply) => {
      const r = await auth.signup(app.db, req.body, meta(req));
      setSession(reply, r.token);
      return reply.status(201).send({ userId: r.userId, orgId: r.orgId });
    },
  );

  app.post(
    '/login',
    { config: strict, schema: { body: z.object({ email, password: z.string().min(1).max(128) }) } },
    async (req, reply) => {
      const r = await auth.login(app.db, req.body, meta(req));
      setSession(reply, r.token);
      return { userId: r.userId, orgId: r.orgId };
    },
  );

  app.post('/logout', async (req, reply) => {
    if (req.auth) {
      await auth.logout(app.db, req.auth.sessionId);
      await logSecurity(app.db, { type: 'auth.logout', orgId: req.auth.orgId, userId: req.auth.userId, meta: meta(req) });
    }
    reply.clearCookie(cookieName, { path: '/' });
    return reply.status(204).send();
  });

  app.post('/logout-others', { preHandler: app.requireAuth }, async (req, reply) => {
    const a = requireUser(req);
    await auth.logoutOthers(app.db, a.userId, a.sessionId);
    await logSecurity(app.db, { type: 'auth.logout_others', orgId: a.orgId, userId: a.userId, meta: meta(req) });
    return reply.status(204).send();
  });

  // Works before the email is verified: the web app uses `emailVerified` to show the verify screen.
  app.get('/me', { preHandler: app.requireSession }, async (req) => {
    const a = requireUser(req);
    const [row] = await app.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        phone: users.phone,
        role: users.role,
        emailVerified: sql<boolean>`${users.emailVerifiedAt} is not null`,
        org: { id: organizations.id, name: organizations.name, slug: organizations.slug, timezone: organizations.timezone },
      })
      .from(users)
      .innerJoin(organizations, eq(organizations.id, users.orgId))
      .where(eq(users.id, a.userId));
    return row;
  });

  app.get('/sessions', { preHandler: app.requireAuth }, async (req) => {
    const a = requireUser(req);
    const rows = await auth.listSessions(app.db, a.userId);
    return rows.map((s) => ({ ...s, current: s.id === a.sessionId }));
  });

  app.post(
    '/password',
    { preHandler: app.requireAuth, config: strict, schema: { body: z.object({ current: z.string().min(1).max(128), next: passwordSchema }) } },
    async (req, reply) => {
      const a = requireUser(req);
      await auth.changePassword(app.db, a.userId, a.sessionId, req.body.current, req.body.next, meta(req));
      return reply.status(204).send();
    },
  );

  app.post('/password-reset', { config: strict, schema: { body: z.object({ email }) } }, async (req, reply) => {
    await auth.requestPasswordReset(app.db, req.body.email, meta(req));
    return reply.status(202).send();
  });

  // Used by both invite acceptance and password reset.
  app.post(
    '/password-reset/complete',
    { config: strict, schema: { body: z.object({ token: z.string().max(100), password: passwordSchema }) } },
    async (req, reply) => {
      const r = await auth.setPasswordWithLink(app.db, req.body.token, req.body.password, meta(req));
      setSession(reply, r.token);
      return { userId: r.userId, orgId: r.orgId };
    },
  );

  // The emailed link opens a page with a "Confirm" button that posts here: a mail scanner's GET can't verify.
  app.post('/verify-email', { config: strict, schema: { body: z.object({ token: z.string().max(100) }) } }, async (req, reply) => {
    await auth.verifyEmail(app.db, req.body.token, meta(req));
    return reply.status(204).send();
  });

  app.post(
    '/verify-email/resend',
    { preHandler: app.requireSession, config: { rateLimit: { max: 3, timeWindow: '10 minutes', keyGenerator: (req: { auth: { userId: string } | null; ip: string }) => req.auth?.userId ?? req.ip } } },
    async (req, reply) => {
      await auth.resendVerification(app.db, requireUser(req).userId, meta(req));
      return reply.status(202).send();
    },
  );
};
