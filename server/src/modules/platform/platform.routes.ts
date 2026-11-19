// Fixloop superadmin console API. Sees firms, accounts and the security log; never a firm's tenants,
// properties or jobs (only counts, via platform_org_stats(ids)). Every action is written to the security log.
import { and, desc, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Tx } from '../../db/client.js';
import { organizations, platformAdmins, platformSessions, securityEvents, sessions, users } from '../../db/schema/index.js';
import { assertFound, conflict } from '../../lib/errors.js';
import { email, idParams, keyset, likeEscape, page, pageQuery } from '../../lib/validation.js';
import { logSecurity, requestMeta, SECURITY_EVENT_TYPES, type SecurityEventType } from '../../shared/security-log.js';
import { resendVerification } from '../auth/auth.service.js';
import { revokeSubjectLinks } from '../links/links.service.js';
import { PLATFORM_SESSION_MS, platformCookieName, platformLogin, platformSessionHook, requirePlatform } from './platform.auth.js';

const reason = z.object({ reason: z.string().trim().min(3).max(500) });
const strict = { rateLimit: { max: 5, timeWindow: '1 minute', keyGenerator: (req: { ip: string }) => req.ip } };
/** A uuid[] literal for raw SQL (Drizzle would otherwise expand a JS array into a parameter list). */
const uuidArray = (ids: string[]) => sql`array[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::uuid[]`;

export const platformRoutes: FastifyPluginAsyncZod = async (app) => {
  const NO_STATS = { doors: 0, openWorkOrders: 0, requests30d: 0 };
  /** Per-firm counts through platform_org_stats(), the only path from here to RLS-protected tables. */
  const orgStats = async (ids: string[]) => {
    if (!ids.length) return new Map<string, typeof NO_STATS>();
    const rows = await app.db.execute<{ org_id: string; doors: string; open_work_orders: string; requests_30d: string }>(sql`select * from platform_org_stats(${uuidArray(ids)})`);
    return new Map(rows.map((r) => [r.org_id, { doors: Number(r.doors), openWorkOrders: Number(r.open_work_orders), requests30d: Number(r.requests_30d) }]));
  };
  const production = app.config.NODE_ENV === 'production';
  const cookieName = platformCookieName(production);
  platformSessionHook(app);
  const guard = { preHandler: async (req: Parameters<typeof requirePlatform>[0]) => void requirePlatform(req) };

  /** Run an action in one transaction and log it with the acting superadmin. */
  const act = <T>(req: Parameters<typeof requirePlatform>[0], fn: (tx: Tx, log: (type: SecurityEventType, e: { orgId?: string | null; userId?: string | null; detail?: Record<string, unknown> }) => Promise<void>) => Promise<T>) => {
    const { adminId } = requirePlatform(req);
    return app.db.transaction((tx) => fn(tx, (type, e) => logSecurity(tx, { type, platformAdminId: adminId, meta: requestMeta(req), ...e })));
  };

  // ---------------------------------------------------------------- session

  app.post('/login', { config: strict, schema: { body: z.object({ email, password: z.string().min(1).max(128), code: z.string().trim().max(10) }) } }, async (req, reply) => {
    const token = await platformLogin(app.db, req.body, requestMeta(req));
    reply.setCookie(cookieName, token, { httpOnly: true, secure: production, sameSite: 'strict', path: '/', maxAge: PLATFORM_SESSION_MS / 1000 });
    return reply.status(204).send();
  });

  app.post('/logout', async (req, reply) => {
    if (req.platform) {
      await app.db.delete(platformSessions).where(eq(platformSessions.id, req.platform.sessionId));
      await logSecurity(app.db, { type: 'platform.logout', platformAdminId: req.platform.adminId, meta: requestMeta(req) });
    }
    reply.clearCookie(cookieName, { path: '/' });
    return reply.status(204).send();
  });

  app.get('/me', guard, async (req) => {
    const [a] = await app.db
      .select({ id: platformAdmins.id, email: platformAdmins.email, name: platformAdmins.name })
      .from(platformAdmins)
      .where(eq(platformAdmins.id, requirePlatform(req).adminId));
    return a;
  });

  // ---------------------------------------------------------------- overview

  app.get('/overview', guard, async () => {
    const day = sql`now() - interval '24 hours'`;
    const [row] = await app.db.execute<Record<string, number>>(sql`select
      (select count(*)::int from organizations) as "firms",
      (select count(*)::int from organizations where suspended_at is not null) as "suspended",
      (select count(*)::int from organizations where created_at > now() - interval '7 days') as "newFirms7d",
      (select count(*)::int from users where active) as "users",
      (select count(*)::int from users where password_hash is not null and email_verified_at is null) as "unverifiedUsers",
      (select count(distinct user_id)::int from sessions where last_seen_at > ${day} and expires_at > now()) as "activeUsers24h",
      (select count(*)::int from security_events where type = 'auth.login_failed' and at > ${day}) as "failedLogins24h",
      (select count(*)::int from security_events where type = 'auth.locked' and at > ${day}) as "lockouts24h",
      (select count(*)::int from security_events where type in ('platform.login_failed', 'platform.locked') and at > ${day}) as "platformFailures24h"`);
    return row;
  });

  // ---------------------------------------------------------------- firms

  const firmStatus = z.enum(['all', 'active', 'suspended', 'unverified']);
  app.get('/orgs', { ...guard, schema: { querystring: pageQuery.extend({ q: z.string().trim().max(100).optional(), status: firmStatus.default('all') }) } }, async (req) => {
    const { q, status, limit, cursor } = req.query;
    const where: (SQL | undefined)[] = [keyset(organizations, cursor)];
    if (q) {
      const like = `%${likeEscape(q)}%`;
      where.push(sql`(${organizations.name} ilike ${like} or ${organizations.slug} ilike ${like} or exists (select 1 from users u where u.org_id = organizations.id and u.email ilike ${like}))`);
    }
    if (status === 'suspended') where.push(isNotNull(organizations.suspendedAt));
    if (status === 'active') where.push(isNull(organizations.suspendedAt));
    if (status === 'unverified') where.push(sql`exists (select 1 from users u where u.org_id = organizations.id and u.role = 'admin' and u.password_hash is not null and u.email_verified_at is null)`);
    // Subqueries name organizations.id outright: in a single-table select Drizzle renders ${organizations.id} as a bare "id".
    const rows = await app.db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        createdAt: organizations.createdAt,
        suspendedAt: organizations.suspendedAt,
        users: sql<number>`(select count(*)::int from users u where u.org_id = organizations.id)`,
        unverified: sql<number>`(select count(*)::int from users u where u.org_id = organizations.id and u.password_hash is not null and u.email_verified_at is null)`,
        adminEmail: sql<string | null>`(select u.email from users u where u.org_id = organizations.id and u.role = 'admin' order by u.created_at limit 1)`,
        // Sessions are deleted on sign-out, suspension and expiry, so fall back to the last sign-in in the security log.
        lastActiveAt: sql<Date | null>`greatest((select max(s.last_seen_at) from sessions s where s.org_id = organizations.id), (select max(e.at) from security_events e where e.org_id = organizations.id and e.type = 'auth.login'))`,
      })
      .from(organizations)
      .where(and(...where))
      .orderBy(desc(organizations.createdAt), desc(organizations.id))
      .limit(limit + 1);
    // Counts for this page's firms only (one grouped pass per table), not for every firm on the platform.
    const stats = await orgStats(rows.slice(0, limit).map((r) => r.id));
    return page(rows.map((r) => ({ ...r, ...(stats.get(r.id) ?? NO_STATS) })), limit);
  });

  app.get('/orgs/:id', { ...guard, schema: { params: idParams } }, async (req) => {
    const [org] = await app.db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        phone: organizations.phone,
        timezone: organizations.timezone,
        createdAt: organizations.createdAt,
        suspendedAt: organizations.suspendedAt,
        suspendedReason: organizations.suspendedReason,
        smsRegistrationStatus: organizations.smsRegistrationStatus,
      })
      .from(organizations)
      .where(eq(organizations.id, req.params.id));
    assertFound(org, 'Firm');
    const stats = (await orgStats([org.id])).get(org.id) ?? NO_STATS;
    const team = await app.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        active: users.active,
        invitePending: sql<boolean>`${users.passwordHash} is null`,
        emailVerifiedAt: users.emailVerifiedAt,
        failedLogins: users.failedLogins,
        lockedUntil: users.lockedUntil,
        createdAt: users.createdAt,
        // Written out as users.id: in a single-table select Drizzle renders ${users.id} as a bare "id", which would bind to s.id.
        lastSeenAt: sql<Date | null>`greatest((select max(s.last_seen_at) from sessions s where s.user_id = users.id), (select max(e.at) from security_events e where e.user_id = users.id and e.type = 'auth.login'))`,
        activeSessions: sql<number>`(select count(*)::int from sessions s where s.user_id = users.id and s.expires_at > now())`,
      })
      .from(users)
      .where(eq(users.orgId, org.id))
      .orderBy(users.createdAt);
    return { ...org, ...stats, users: team };
  });

  app.post('/orgs/:id/suspend', { ...guard, schema: { params: idParams, body: reason } }, async (req, reply) => {
    await act(req, async (tx, log) => {
      const [o] = await tx.update(organizations).set({ suspendedAt: new Date(), suspendedReason: req.body.reason }).where(and(eq(organizations.id, req.params.id), isNull(organizations.suspendedAt))).returning({ id: organizations.id });
      if (!o) throw conflict('This firm is already suspended, or doesn’t exist');
      const ended = await tx.delete(sessions).where(eq(sessions.orgId, o.id)).returning({ id: sessions.id });
      await log('platform.org_suspended', { orgId: o.id, detail: { reason: req.body.reason, sessionsEnded: ended.length } });
    });
    return reply.status(204).send();
  });

  app.post('/orgs/:id/unsuspend', { ...guard, schema: { params: idParams, body: reason } }, async (req, reply) => {
    await act(req, async (tx, log) => {
      const [o] = await tx.update(organizations).set({ suspendedAt: null, suspendedReason: null }).where(and(eq(organizations.id, req.params.id), isNotNull(organizations.suspendedAt))).returning({ id: organizations.id });
      if (!o) throw conflict('This firm isn’t suspended, or doesn’t exist');
      await log('platform.org_unsuspended', { orgId: o.id, detail: { reason: req.body.reason } });
    });
    return reply.status(204).send();
  });

  // ---------------------------------------------------------------- firm users

  /** Load the target user (locked) for an action; 404 when missing. */
  const target = async (tx: Tx, id: string) => {
    const [u] = await tx.select({ id: users.id, orgId: users.orgId, active: users.active, emailVerifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, id)).for('update');
    assertFound(u, 'User');
    return u;
  };

  app.post('/users/:id/deactivate', { ...guard, schema: { params: idParams, body: reason } }, async (req, reply) => {
    await act(req, async (tx, log) => {
      const u = await target(tx, req.params.id);
      if (!u.active) throw conflict('This user is already deactivated');
      await tx.update(users).set({ active: false }).where(eq(users.id, u.id));
      await tx.delete(sessions).where(eq(sessions.userId, u.id));
      await revokeSubjectLinks(tx, u.orgId, u.id);
      await log('platform.user_deactivated', { orgId: u.orgId, userId: u.id, detail: { reason: req.body.reason } });
    });
    return reply.status(204).send();
  });

  app.post('/users/:id/reactivate', { ...guard, schema: { params: idParams, body: reason } }, async (req, reply) => {
    await act(req, async (tx, log) => {
      const u = await target(tx, req.params.id);
      if (u.active) throw conflict('This user is already active');
      await tx.update(users).set({ active: true }).where(eq(users.id, u.id));
      await log('platform.user_reactivated', { orgId: u.orgId, userId: u.id, detail: { reason: req.body.reason } });
    });
    return reply.status(204).send();
  });

  app.post('/users/:id/revoke-sessions', { ...guard, schema: { params: idParams, body: reason } }, async (req, reply) => {
    await act(req, async (tx, log) => {
      const u = await target(tx, req.params.id);
      const ended = await tx.delete(sessions).where(eq(sessions.userId, u.id)).returning({ id: sessions.id });
      await log('platform.sessions_revoked', { orgId: u.orgId, userId: u.id, detail: { reason: req.body.reason, sessionsEnded: ended.length } });
    });
    return reply.status(204).send();
  });

  app.post('/users/:id/unlock', { ...guard, schema: { params: idParams } }, async (req, reply) => {
    await act(req, async (tx, log) => {
      const u = await target(tx, req.params.id);
      await tx.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, u.id));
      await log('platform.user_unlocked', { orgId: u.orgId, userId: u.id });
    });
    return reply.status(204).send();
  });

  app.post('/users/:id/resend-verification', { ...guard, config: strict, schema: { params: idParams } }, async (req, reply) => {
    if (!(await resendVerification(app.db, req.params.id, requestMeta(req), { platformAdminId: requirePlatform(req).adminId }))) {
      throw conflict('This email is already verified, or the user doesn’t exist');
    }
    return reply.status(202).send();
  });

  app.post('/users/:id/mark-verified', { ...guard, schema: { params: idParams, body: reason } }, async (req, reply) => {
    await act(req, async (tx, log) => {
      const u = await target(tx, req.params.id);
      if (u.emailVerifiedAt) throw conflict('This email is already verified');
      await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, u.id));
      await log('platform.email_marked_verified', { orgId: u.orgId, userId: u.id, detail: { reason: req.body.reason } });
    });
    return reply.status(204).send();
  });

  // ---------------------------------------------------------------- security log

  const logQuery = pageQuery.extend({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    // Exact type ("auth.login_failed") or a group ("auth", "team", "platform").
    type: z.union([z.enum(SECURITY_EVENT_TYPES), z.enum(['auth', 'team', 'platform'])]).optional(),
    orgId: z.uuid().optional(),
    userId: z.uuid().optional(),
    q: z.string().trim().max(100).optional(),
    failuresOnly: z.stringbool().optional(),
  });
  app.get('/security-events', { ...guard, schema: { querystring: logQuery } }, async (req) => {
    const { type, orgId, userId, q, failuresOnly, limit, cursor } = req.query;
    const at = { createdAt: securityEvents.at, id: securityEvents.id };
    const where: (SQL | undefined)[] = [keyset(at, cursor)];
    if (type) where.push(type.includes('.') ? eq(securityEvents.type, type) : sql`${securityEvents.type} like ${`${type}.%`}`);
    if (orgId) where.push(eq(securityEvents.orgId, orgId));
    if (userId) where.push(sql`(${securityEvents.userId} = ${userId} or ${securityEvents.detail}->>'targetUserId' = ${userId})`);
    if (q) {
      const like = `%${likeEscape(q)}%`;
      // Matching users and firms are looked up first (small tables), so every branch below is an index
      // lookup on security_events (trigram on email/ip, btree on user_id/org_id). Matching on the joined
      // columns directly made Postgres walk the whole log: 1.7 s at 1M entries, now 2–45 ms.
      const [byUser, byOrg] = await Promise.all([
        app.db.select({ id: users.id }).from(users).where(sql`${users.email} ilike ${like}`).limit(500),
        app.db.select({ id: organizations.id }).from(organizations).where(sql`${organizations.name} ilike ${like}`).limit(500),
      ]);
      const any = (col: SQL | typeof securityEvents.userId | typeof securityEvents.orgId, ids: { id: string }[]) => (ids.length ? sql` or ${col} = any(${uuidArray(ids.map((x) => x.id))})` : sql``);
      where.push(sql`(${securityEvents.email} ilike ${like} or ${securityEvents.ip} ilike ${like}${any(securityEvents.userId, byUser)}${any(securityEvents.orgId, byOrg)})`);
    }
    if (failuresOnly) where.push(sql`${securityEvents.type} in ('auth.login_failed', 'auth.locked', 'platform.login_failed', 'platform.locked')`);
    const rows = await app.db
      .select({
        id: securityEvents.id,
        createdAt: securityEvents.at,
        type: securityEvents.type,
        orgId: securityEvents.orgId,
        orgName: organizations.name,
        userId: securityEvents.userId,
        userEmail: users.email,
        platformAdminEmail: platformAdmins.email,
        email: securityEvents.email,
        ip: securityEvents.ip,
        userAgent: securityEvents.userAgent,
        detail: securityEvents.detail,
      })
      .from(securityEvents)
      .leftJoin(organizations, eq(organizations.id, securityEvents.orgId))
      .leftJoin(users, eq(users.id, securityEvents.userId))
      .leftJoin(platformAdmins, eq(platformAdmins.id, securityEvents.platformAdminId))
      .where(and(...where))
      .orderBy(desc(securityEvents.at), desc(securityEvents.id))
      .limit(limit + 1);
    return page(rows, limit);
  });

  // ---------------------------------------------------------------- superadmins (read-only; managed with `pnpm superadmin`)

  app.get('/admins', guard, async () =>
    app.db
      .select({ id: platformAdmins.id, email: platformAdmins.email, name: platformAdmins.name, active: platformAdmins.active, lastLoginAt: platformAdmins.lastLoginAt, createdAt: platformAdmins.createdAt, activeSessions: sql<number>`(select count(*)::int from platform_sessions s where s.admin_id = platform_admins.id and s.expires_at > now())` })
      .from(platformAdmins)
      .orderBy(platformAdmins.createdAt),
  );
};
