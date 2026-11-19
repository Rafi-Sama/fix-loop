import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { organizations, sessions, users } from '../db/schema/index.js';
import { hashToken, isWellFormedToken } from '../lib/crypto.js';
import { AppError, forbidden, unauthorized } from '../lib/errors.js';
import type { Actor } from '../shared/actor.js';

export interface Auth {
  userId: string;
  orgId: string;
  role: 'admin' | 'manager';
  sessionId: string;
  emailVerified: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: Auth | null;
  }
  interface FastifyInstance {
    /** Signed in with a verified email: everything except the verify screen needs this. */
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Signed in, verified or not (/auth/me, resend verification). */
    requireSession: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const SESSION_TTL_MS = 30 * 24 * 3_600_000;
const TOUCH_EVERY_MS = 5 * 60_000;

export const sessionCookieName = (production: boolean) => (production ? '__Host-fixloop_sid' : 'fixloop_sid');

export function requireUser(req: FastifyRequest): Auth {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

export function requireVerified(req: FastifyRequest): Auth {
  const a = requireUser(req);
  if (!a.emailVerified) throw new AppError(403, 'email_unverified', 'Confirm your email address to continue');
  return a;
}

export function userActor(auth: Auth): Actor & { type: 'user' } {
  return { type: 'user', id: auth.userId, orgId: auth.orgId, role: auth.role };
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  const cookieName = sessionCookieName(app.config.NODE_ENV === 'production');
  app.decorateRequest('auth', null);

  app.addHook('onRequest', async (req) => {
    const token = req.cookies[cookieName];
    if (!token || !isWellFormedToken(token)) return;
    const now = new Date();
    const [row] = await app.db
      .select({ sessionId: sessions.id, lastSeenAt: sessions.lastSeenAt, userId: users.id, orgId: users.orgId, role: users.role, verifiedAt: users.emailVerifiedAt })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .innerJoin(organizations, eq(organizations.id, users.orgId))
      // A suspended firm's sessions stop working at once (no wait for expiry).
      .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now), eq(users.active, true), isNull(organizations.suspendedAt)));
    if (!row) return;
    req.auth = { userId: row.userId, orgId: row.orgId, role: row.role, sessionId: row.sessionId, emailVerified: row.verifiedAt !== null };
    // Avoid a write on every request; "last seen" only needs minute-level precision.
    if (now.getTime() - row.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
      await app.db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.sessionId));
    }
  });

  app.decorate('requireSession', async (req: FastifyRequest) => {
    requireUser(req);
  });
  app.decorate('requireAuth', async (req: FastifyRequest) => {
    requireVerified(req);
  });
  app.decorate('requireAdmin', async (req: FastifyRequest) => {
    if (requireVerified(req).role !== 'admin') throw forbidden('Admins only');
  });
});
