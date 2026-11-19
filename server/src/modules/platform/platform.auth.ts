// Superadmin sign-in and sessions. Separate from firm users: own table, own cookie, password + TOTP.
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Db } from '../../db/client.js';
import { platformAdmins, platformSessions } from '../../db/schema/index.js';
import { hashToken, isWellFormedToken, randomToken } from '../../lib/crypto.js';
import { unauthorized } from '../../lib/errors.js';
import { verifyTotp } from '../../lib/totp.js';
import { logSecurity, type RequestMeta } from '../../shared/security-log.js';
import { dummyHash, verifyPassword } from '../auth/passwords.js';

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60_000;
export const PLATFORM_SESSION_MS = 8 * 3_600_000;
// Signed out after 30 idle minutes: an unattended superadmin tab is the riskiest thing in the system.
const IDLE_MS = 30 * 60_000;
const TOUCH_EVERY_MS = 60_000;

export const platformCookieName = (production: boolean) => (production ? '__Host-fixloop_ops' : 'fixloop_ops');

export interface PlatformAuth {
  adminId: string;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    platform: PlatformAuth | null;
  }
}

export function requirePlatform(req: FastifyRequest): PlatformAuth {
  if (!req.platform) throw unauthorized();
  return req.platform;
}

/** Resolves the superadmin session on every /platform request (registered inside that plugin only). */
export function platformSessionHook(app: FastifyInstance) {
  const cookieName = platformCookieName(app.config.NODE_ENV === 'production');
  if (!app.hasRequestDecorator('platform')) app.decorateRequest('platform', null);
  app.addHook('onRequest', async (req) => {
    const token = req.cookies[cookieName];
    if (!token || !isWellFormedToken(token)) return;
    const now = new Date();
    const [row] = await app.db
      .select({ sessionId: platformSessions.id, adminId: platformAdmins.id, lastSeenAt: platformSessions.lastSeenAt })
      .from(platformSessions)
      .innerJoin(platformAdmins, eq(platformAdmins.id, platformSessions.adminId))
      .where(
        and(
          eq(platformSessions.tokenHash, hashToken(token)),
          gt(platformSessions.expiresAt, now),
          gt(platformSessions.lastSeenAt, new Date(now.getTime() - IDLE_MS)),
          eq(platformAdmins.active, true),
        ),
      );
    if (!row) return;
    req.platform = { adminId: row.adminId, sessionId: row.sessionId };
    if (now.getTime() - row.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
      await app.db.update(platformSessions).set({ lastSeenAt: now }).where(eq(platformSessions.id, row.sessionId));
    }
  });
}

/** Password and authenticator code are checked together; the error never says which one was wrong. */
export async function platformLogin(db: Db, input: { email: string; password: string; code: string }, meta: RequestMeta) {
  const [a] = await db.select().from(platformAdmins).where(sql`lower(${platformAdmins.email}) = ${input.email}`);
  const now = new Date();
  const fail = async (reason: string): Promise<never> => {
    await logSecurity(db, { type: 'platform.login_failed', platformAdminId: a?.id, email: input.email, meta, detail: { reason } });
    throw unauthorized('Invalid email, password or code');
  };
  if (!a?.active) {
    await verifyPassword(await dummyHash(), input.password);
    return fail(a ? 'deactivated' : 'unknown_email');
  }
  if (a.lockedUntil && a.lockedUntil > now) {
    // Same answer and timing as a wrong password: a lockout mustn't reveal which emails are superadmins.
    await verifyPassword(await dummyHash(), input.password);
    return fail('locked');
  }
  const passwordOk = await verifyPassword(a.passwordHash, input.password);
  const step = passwordOk ? verifyTotp(a.totpSecret, input.code, a.totpLastStep, now.getTime()) : null;
  if (step === null) {
    const [n] = await db
      .update(platformAdmins)
      .set({
        failedLogins: sql`${platformAdmins.failedLogins} + 1`,
        lockedUntil: sql`case when ${platformAdmins.failedLogins} + 1 >= ${MAX_FAILED} then now() + interval '15 minutes' else ${platformAdmins.lockedUntil} end`,
      })
      .where(eq(platformAdmins.id, a.id))
      .returning({ failedLogins: platformAdmins.failedLogins });
    // >=: after a lock expires the count isn't reset, so the next failure locks again and must be logged too.
    if (n && n.failedLogins >= MAX_FAILED) await logSecurity(db, { type: 'platform.locked', platformAdminId: a.id, meta, detail: { minutes: LOCK_MS / 60_000 } });
    return fail(passwordOk ? 'bad_code' : 'bad_password');
  }
  // Claim the time step atomically: two requests racing with the same code can't both win.
  const claimed = await db
    .update(platformAdmins)
    .set({ totpLastStep: step, failedLogins: 0, lockedUntil: null, lastLoginAt: now })
    .where(and(eq(platformAdmins.id, a.id), lt(platformAdmins.totpLastStep, step)))
    .returning({ id: platformAdmins.id });
  if (!claimed.length) return fail('code_reused');
  const token = randomToken();
  await db.insert(platformSessions).values({
    adminId: a.id,
    tokenHash: hashToken(token),
    ip: meta.ip,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
    expiresAt: new Date(now.getTime() + PLATFORM_SESSION_MS),
  });
  await logSecurity(db, { type: 'platform.login', platformAdminId: a.id, meta });
  return token;
}
