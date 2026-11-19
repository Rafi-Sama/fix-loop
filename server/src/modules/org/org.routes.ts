import { and, asc, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { categories, organizations, sessions, users } from '../../db/schema/index.js';
import { assertFound, found, badRequest, conflict } from '../../lib/errors.js';
import { cents, email, idParams, optionalText, phone, shortText } from '../../lib/validation.js';
import { requireUser } from '../../plugins/auth.js';
import { orgTx } from '../../shared/http.js';
import { notify } from '../../shared/outbox.js';
import { logSecurity, requestMeta } from '../../shared/security-log.js';
import { revokeSubjectLinks } from '../links/links.service.js';
import { DEFAULT_REMINDERS } from '../work-orders/policy.js';

const sla = z.object({ assignHours: z.number().positive().max(720), completeHours: z.number().positive().max(2160) });

const settingsPatch = z
  .object({
    name: shortText,
    phone: phone.nullable(),
    emergencyPhone: phone.nullable(),
    address: optionalText(500),
    timezone: z.string().refine((tz) => Intl.supportedValuesOf('timeZone').includes(tz), 'Unknown timezone'),
    defaultApprovalThresholdCents: cents,
    autoApproveUnderThreshold: z.boolean(),
    emergencySpendLimitCents: cents,
    invoiceOveragePct: z.number().int().min(0).max(100),
    slaConfig: z.object({ emergency: sla, high: sla, normal: sla, low: sla }).partial(),
    reminderConfig: z.partialRecord(z.enum(Object.keys(DEFAULT_REMINDERS) as [keyof typeof DEFAULT_REMINDERS]), z.number().positive().max(720)),
    emergencyKeywords: z.array(z.string().trim().toLowerCase().min(2).max(40)).max(50),
  })
  .partial()
  .strict();

const settingsColumns = {
  id: organizations.id,
  name: organizations.name,
  slug: organizations.slug,
  phone: organizations.phone,
  emergencyPhone: organizations.emergencyPhone,
  address: organizations.address,
  timezone: organizations.timezone,
  defaultApprovalThresholdCents: organizations.defaultApprovalThresholdCents,
  autoApproveUnderThreshold: organizations.autoApproveUnderThreshold,
  emergencySpendLimitCents: organizations.emergencySpendLimitCents,
  invoiceOveragePct: organizations.invoiceOveragePct,
  slaConfig: organizations.slaConfig,
  reminderConfig: organizations.reminderConfig,
  emergencyKeywords: organizations.emergencyKeywords,
  smsRegistrationStatus: organizations.smsRegistrationStatus,
};

const categoryBody = z.object({
  name: shortText,
  active: z.boolean().default(true),
  photoRequired: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

export const orgRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.get('/', async (req) => {
    const [org] = await app.db.select(settingsColumns).from(organizations).where(eq(organizations.id, requireUser(req).orgId));
    return found(org);
  });

  app.patch('/', { preHandler: app.requireAdmin, schema: { body: settingsPatch } }, async (req) => {
    if (Object.keys(req.body).length === 0) throw badRequest('Nothing to update');
    const [org] = await app.db
      .update(organizations)
      .set(req.body)
      .where(eq(organizations.id, requireUser(req).orgId))
      .returning(settingsColumns);
    return org;
  });

  // Categories (PRD §5.3): deactivate instead of delete so history keeps the name.
  app.get('/categories', async (req) =>
    orgTx(app, req, (tx) => tx.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name))),
  );

  app.post('/categories', { preHandler: app.requireAdmin, schema: { body: categoryBody } }, async (req, reply) => {
    const row = await orgTx(app, req, async (tx, actor) => {
      const [c] = await tx.insert(categories).values({ ...req.body, orgId: actor.orgId }).returning();
      return c;
    });
    return reply.status(201).send(row);
  });

  app.patch(
    '/categories/:id',
    { preHandler: app.requireAdmin, schema: { params: idParams, body: categoryBody.partial().strict() } },
    async (req) =>
      orgTx(app, req, async (tx) => {
        const [c] = await tx.update(categories).set(req.body).where(eq(categories.id, req.params.id)).returning();
        return found(c, 'Category');
      }),
  );

  // Team (PRD §10.4)
  const userColumns = { id: users.id, email: users.email, name: users.name, phone: users.phone, role: users.role, active: users.active, invited: sql<boolean>`${users.passwordHash} is null` };

  app.get('/users', async (req) =>
    app.db.select(userColumns).from(users).where(eq(users.orgId, requireUser(req).orgId)).orderBy(asc(users.name)),
  );

  app.post(
    '/users',
    { preHandler: app.requireAdmin, schema: { body: z.object({ email, name: shortText, role: z.enum(['admin', 'manager']).default('manager') }) } },
    async (req, reply) => {
      const auth = requireUser(req);
      const created = await orgTx(app, req, async (tx) => {
        const [taken] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${req.body.email}`);
        if (taken) throw conflict('A user with this email already exists');
        const [u] = await tx.insert(users).values({ ...req.body, orgId: auth.orgId }).returning(userColumns);
        const [inviter] = await tx.select({ name: users.name }).from(users).where(eq(users.id, auth.userId));
        const [org] = await tx.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, auth.orgId));
        await notify(
          tx,
          {
            orgId: auth.orgId,
            to: { type: 'user', id: u!.id, email: u!.email, phone: null },
            template: 'user.invite',
            vars: { orgName: org!.name, inviter: inviter!.name },
            subject: { type: 'user', id: u!.id },
            link: { purpose: 'user_invite', scopeId: u!.id, ttlHours: 72 },
          },
          false,
        );
        await logSecurity(tx, { type: 'team.invited', orgId: auth.orgId, userId: auth.userId, email: u!.email, meta: requestMeta(req), detail: { targetUserId: u!.id, role: u!.role } });
        return u;
      });
      return reply.status(201).send(created);
    },
  );

  app.patch(
    '/users/:id',
    {
      preHandler: app.requireAdmin,
      schema: { params: idParams, body: z.object({ role: z.enum(['admin', 'manager']), active: z.boolean(), name: shortText, phone: phone.nullable() }).partial().strict() },
    },
    async (req) => {
      const auth = requireUser(req);
      return app.db.transaction(async (tx) => {
        const target = and(eq(users.id, req.params.id), eq(users.orgId, auth.orgId));
        const demoting = req.body.role === 'manager' || req.body.active === false;
        if (demoting) {
          // Never leave an org without an active admin. Row locks stop two admins demoting each other concurrently.
          const admins = await tx
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.orgId, auth.orgId), eq(users.role, 'admin'), eq(users.active, true)))
            .for('update');
          if (!admins.some((a) => a.id !== req.params.id)) throw conflict('The organization needs at least one active admin');
        }
        const [before] = await tx.select({ role: users.role, active: users.active }).from(users).where(target);
        const [u] = await tx.update(users).set(req.body).where(target).returning(userColumns);
        assertFound(u, 'User');
        const log = (type: 'team.role_changed' | 'team.deactivated' | 'team.reactivated', detail: Record<string, unknown> = {}) =>
          logSecurity(tx, { type, orgId: auth.orgId, userId: auth.userId, meta: requestMeta(req), detail: { targetUserId: u.id, ...detail } });
        if (before && req.body.role && req.body.role !== before.role) await log('team.role_changed', { from: before.role, to: req.body.role });
        if (before && req.body.active !== undefined && req.body.active !== before.active) await log(req.body.active ? 'team.reactivated' : 'team.deactivated');
        if (req.body.active === false) {
          await tx.delete(sessions).where(eq(sessions.userId, req.params.id));
          await revokeSubjectLinks(tx, auth.orgId, req.params.id);
        }
        return u;
      });
    },
  );
};
