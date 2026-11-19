import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Tx } from '../../db/client.js';
import { expenses, maintenanceRequests, owners, properties, tenants, units, workOrders } from '../../db/schema/index.js';
import { assertFound, found, badRequest, conflict } from '../../lib/errors.js';
import {
  cents,
  email,
  idParams,
  keyset,
  likeEscape,
  optionalText,
  page,
  pageQuery,
  phone,
  shortText,
} from '../../lib/validation.js';
import { orgTx } from '../../shared/http.js';
import { revokeSubjectLinks } from '../links/links.service.js';

const PROPERTY_TYPES = ['single_family', 'multi_family', 'condo', 'townhouse', 'mobile_home', 'other'] as const;
const OCCUPANCY = ['current', 'notice_given', 'past'] as const;

const ownerBody = z.object({
  name: shortText,
  email: email.nullish(),
  phone: phone.nullish(),
  approvalThresholdCents: cents.nullish(),
  notifyMode: z.enum(['direct', 'pm_forwards']).default('direct'),
  sendCompletionSummary: z.boolean().default(false),
  externalId: optionalText(100),
});

const propertyBody = z.object({
  ownerId: z.uuid(),
  nameRef: shortText,
  addressLine: shortText,
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Use the 2-letter state code'),
  zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code'),
  type: z.enum(PROPERTY_TYPES),
  notes: optionalText(5000),
  emergencyPhone: phone.nullish(),
  externalId: optionalText(100),
});

const tenantBody = z
  .object({
    unitId: z.uuid(),
    name: shortText,
    email: email.nullish(),
    phone: phone.nullish(),
    occupancyStatus: z.enum(OCCUPANCY).default('current'),
    smsConsent: z.boolean().optional(),
    externalId: optionalText(100),
  });


async function assertOwner(tx: Tx, id: string) {
  const [o] = await tx.select({ id: owners.id }).from(owners).where(and(eq(owners.id, id), isNull(owners.archivedAt)));
  assertFound(o, 'Owner');
}

export const portfolioRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  // ---------- Owners ----------
  app.get('/owners', { schema: { querystring: pageQuery.extend({ q: z.string().max(100).optional() }) } }, async (req) =>
    orgTx(app, req, async (tx) => {
      const { q, limit, cursor } = req.query;
      const rows = await tx
        .select()
        .from(owners)
        .where(and(isNull(owners.archivedAt), q ? ilike(owners.name, `%${likeEscape(q)}%`) : undefined, keyset(owners, cursor)))
        .orderBy(desc(owners.createdAt), desc(owners.id))
        .limit(limit + 1);
      return page(rows, limit);
    }),
  );

  app.post('/owners', { schema: { body: ownerBody } }, async (req, reply) => {
    const row = await orgTx(app, req, async (tx, a) => (await tx.insert(owners).values({ ...req.body, orgId: a.orgId }).returning())[0]);
    return reply.status(201).send(row);
  });

  app.get('/owners/:id', { schema: { params: idParams } }, async (req) =>
    orgTx(app, req, async (tx) => found((await tx.select().from(owners).where(eq(owners.id, req.params.id)))[0], 'Owner')),
  );

  app.patch('/owners/:id', { schema: { params: idParams, body: ownerBody.partial().extend({ archived: z.boolean().optional() }).strict() } }, async (req) =>
    orgTx(app, req, async (tx, a) => {
      const { archived, ...patch } = req.body;
      if (archived) {
        const [active] = await tx.select({ id: properties.id }).from(properties).where(and(eq(properties.ownerId, req.params.id), isNull(properties.archivedAt))).limit(1);
        if (active) throw conflict('Move or archive this owner’s properties first');
        await revokeSubjectLinks(tx, a.orgId, req.params.id);
      }
      const [o] = await tx
        .update(owners)
        .set({ ...patch, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) })
        .where(eq(owners.id, req.params.id))
        .returning();
      return found(o, 'Owner');
    }),
  );

  // ---------- Properties ----------
  app.get(
    '/properties',
    {
      schema: {
        querystring: pageQuery.extend({
          q: z.string().max(100).optional(),
          type: z.enum(PROPERTY_TYPES).optional(),
          ownerId: z.uuid().optional(),
          city: z.string().max(100).optional(),
          archived: z.enum(['true', 'false']).default('false'),
          hasOpenRequests: z.enum(['true', 'false']).optional(),
        }),
      },
    },
    async (req) =>
      orgTx(app, req, async (tx) => {
        const { q, type, ownerId, city, archived, hasOpenRequests, limit, cursor } = req.query;
        const like = q ? `%${likeEscape(q)}%` : null;
        const openReq = sql`exists (select 1 from ${maintenanceRequests} mr join ${units} u on u.id = mr.unit_id
          where u.property_id = ${properties.id} and mr.status in ('new','needs_info','in_progress'))`;
        const rows = await tx
          .select({
            id: properties.id,
            nameRef: properties.nameRef,
            addressLine: properties.addressLine,
            city: properties.city,
            state: properties.state,
            zip: properties.zip,
            type: properties.type,
            ownerId: properties.ownerId,
            ownerName: owners.name,
            archivedAt: properties.archivedAt,
            createdAt: properties.createdAt,
            unitCount: sql<number>`(select count(*)::int from ${units} where ${units.propertyId} = ${properties.id} and ${units.archivedAt} is null)`,
          })
          .from(properties)
          .innerJoin(owners, eq(owners.id, properties.ownerId))
          .where(
            and(
              archived === 'true' ? isNotNull(properties.archivedAt) : isNull(properties.archivedAt),
              like ? or(ilike(properties.nameRef, like), ilike(properties.addressLine, like)) : undefined,
              type ? eq(properties.type, type) : undefined,
              ownerId ? eq(properties.ownerId, ownerId) : undefined,
              city ? ilike(properties.city, likeEscape(city)) : undefined,
              hasOpenRequests === 'true' ? openReq : hasOpenRequests === 'false' ? sql`not ${openReq}` : undefined,
              keyset(properties, cursor),
            ),
          )
          .orderBy(desc(properties.createdAt), desc(properties.id))
          .limit(limit + 1);
        return page(rows, limit);
      }),
  );

  app.post('/properties', { schema: { body: propertyBody } }, async (req, reply) => {
    const row = await orgTx(app, req, async (tx, a) => {
      await assertOwner(tx, req.body.ownerId);
      const [p] = await tx.insert(properties).values({ ...req.body, orgId: a.orgId }).returning();
      // Single-unit properties get their one unit automatically (PRD §3.1: unit count is derived).
      if (p!.type !== 'multi_family') await tx.insert(units).values({ orgId: a.orgId, propertyId: p!.id, label: 'Main' });
      return p;
    });
    return reply.status(201).send(row);
  });

  app.get('/properties/:id', { schema: { params: idParams } }, async (req) =>
    orgTx(app, req, async (tx) => {
      const [p] = await tx
        .select({ property: properties, owner: owners })
        .from(properties)
        .innerJoin(owners, eq(owners.id, properties.ownerId))
        .where(eq(properties.id, req.params.id));
      assertFound(p, 'Property');
      const [unitRows, tenantRows, openRequests, completedJobs, expenseByMonth] = await Promise.all([
        tx.select().from(units).where(eq(units.propertyId, req.params.id)).orderBy(asc(units.label)),
        tx
          .select({ id: tenants.id, name: tenants.name, email: tenants.email, phone: tenants.phone, unitId: tenants.unitId, occupancyStatus: tenants.occupancyStatus })
          .from(tenants)
          .innerJoin(units, eq(units.id, tenants.unitId))
          .where(and(eq(units.propertyId, req.params.id), inArray(tenants.occupancyStatus, ['current', 'notice_given']))),
        tx
          .select({ id: maintenanceRequests.id, ref: maintenanceRequests.ref, title: maintenanceRequests.title, status: maintenanceRequests.status, priority: maintenanceRequests.priority, createdAt: maintenanceRequests.createdAt })
          .from(maintenanceRequests)
          .innerJoin(units, eq(units.id, maintenanceRequests.unitId))
          .where(and(eq(units.propertyId, req.params.id), inArray(maintenanceRequests.status, ['new', 'needs_info', 'in_progress'])))
          .orderBy(desc(maintenanceRequests.createdAt))
          .limit(50),
        tx
          .select({ id: workOrders.id, ref: workOrders.ref, description: workOrders.description, closedAt: workOrders.closedAt })
          .from(workOrders)
          .innerJoin(units, eq(units.id, workOrders.unitId))
          .where(and(eq(units.propertyId, req.params.id), eq(workOrders.status, 'closed')))
          .orderBy(desc(workOrders.closedAt))
          .limit(50),
        tx
          .select({ month: sql<string>`to_char(date_trunc('month', ${expenses.incurredOn}), 'YYYY-MM')`, totalCents: sql<number>`sum(${expenses.amountCents})::int` })
          .from(expenses)
          .where(eq(expenses.propertyId, req.params.id))
          .groupBy(sql`1`)
          .orderBy(sql`1 desc`)
          .limit(24),
      ]);
      return { ...p.property, owner: p.owner, units: unitRows, tenants: tenantRows, openRequests, completedJobs, expenseByMonth };
    }),
  );

  app.patch(
    '/properties/:id',
    { schema: { params: idParams, body: propertyBody.partial().extend({ archived: z.boolean().optional() }).strict() } },
    async (req) =>
      orgTx(app, req, async (tx) => {
        const { archived, ...patch } = req.body;
        if (patch.ownerId) await assertOwner(tx, patch.ownerId);
        const [p] = await tx
          .update(properties)
          .set({ ...patch, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) })
          .where(eq(properties.id, req.params.id))
          .returning();
        return found(p, 'Property');
      }),
  );

  // ---------- Units ----------
  app.post(
    '/properties/:id/units',
    { schema: { params: idParams, body: z.object({ labels: z.array(z.string().trim().min(1).max(50)).min(1).max(500) }) } },
    async (req, reply) => {
      const rows = await orgTx(app, req, async (tx, a) => {
        const [p] = await tx.select({ id: properties.id }).from(properties).where(eq(properties.id, req.params.id));
        assertFound(p, 'Property');
        const labels = [...new Set(req.body.labels)];
        // Re-adding existing labels is a no-op, so bulk "101–124" can be retried safely.
        return tx
          .insert(units)
          .values(labels.map((label) => ({ orgId: a.orgId, propertyId: req.params.id, label })))
          .onConflictDoNothing()
          .returning();
      });
      return reply.status(201).send(rows);
    },
  );

  app.patch(
    '/units/:id',
    { schema: { params: idParams, body: z.object({ label: z.string().trim().min(1).max(50), notes: optionalText(2000), archived: z.boolean() }).partial().strict() } },
    async (req) =>
      orgTx(app, req, async (tx) => {
        const { archived, ...patch } = req.body;
        const [u] = await tx
          .update(units)
          .set({ ...patch, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) })
          .where(eq(units.id, req.params.id))
          .returning();
        return found(u, 'Unit');
      }),
  );

  app.get('/units/:id/history', { schema: { params: idParams } }, async (req) =>
    orgTx(app, req, async (tx) => {
      const [u] = await tx.select().from(units).where(eq(units.id, req.params.id));
      assertFound(u, 'Unit');
      const [requests, jobs] = await Promise.all([
        tx.select().from(maintenanceRequests).where(eq(maintenanceRequests.unitId, req.params.id)).orderBy(desc(maintenanceRequests.createdAt)).limit(200),
        tx.select().from(workOrders).where(eq(workOrders.unitId, req.params.id)).orderBy(desc(workOrders.createdAt)).limit(200),
      ]);
      return { unit: u, requests, workOrders: jobs };
    }),
  );

  // ---------- Tenants ----------
  app.get(
    '/tenants',
    {
      schema: {
        querystring: pageQuery.extend({
          q: z.string().max(100).optional(),
          propertyId: z.uuid().optional(),
          status: z.enum(OCCUPANCY).optional(),
        }),
      },
    },
    async (req) =>
      orgTx(app, req, async (tx) => {
        const { q, propertyId, status, limit, cursor } = req.query;
        const like = q ? `%${likeEscape(q)}%` : null;
        const rows = await tx
          .select({
            id: tenants.id,
            name: tenants.name,
            email: tenants.email,
            phone: tenants.phone,
            occupancyStatus: tenants.occupancyStatus,
            unitId: units.id,
            unitLabel: units.label,
            propertyId: properties.id,
            propertyName: properties.nameRef,
            createdAt: tenants.createdAt,
          })
          .from(tenants)
          .innerJoin(units, eq(units.id, tenants.unitId))
          .innerJoin(properties, eq(properties.id, units.propertyId))
          .where(
            and(
              like ? or(ilike(tenants.name, like), ilike(tenants.email, like), ilike(tenants.phone, like)) : undefined,
              propertyId ? eq(units.propertyId, propertyId) : undefined,
              status ? eq(tenants.occupancyStatus, status) : undefined,
              keyset(tenants, cursor),
            ),
          )
          .orderBy(desc(tenants.createdAt), desc(tenants.id))
          .limit(limit + 1);
        return page(rows, limit);
      }),
  );

  app.post('/tenants', { schema: { body: tenantBody } }, async (req, reply) => {
    const { smsConsent, ...body } = req.body;
    if (!body.email && !body.phone) throw badRequest('Email or phone is required');
    const row = await orgTx(app, req, async (tx, a) => {
      const [u] = await tx.select({ id: units.id }).from(units).where(and(eq(units.id, body.unitId), isNull(units.archivedAt)));
      assertFound(u, 'Unit');
      const [t] = await tx.insert(tenants).values({ ...body, orgId: a.orgId, smsConsentAt: smsConsent ? new Date() : null }).returning();
      return t;
    });
    return reply.status(201).send(row);
  });

  app.get('/tenants/:id', { schema: { params: idParams } }, async (req) =>
    orgTx(app, req, async (tx) => {
      const [t] = await tx.select().from(tenants).where(eq(tenants.id, req.params.id));
      assertFound(t, 'Tenant');
      const requests = await tx
        .select({ id: maintenanceRequests.id, ref: maintenanceRequests.ref, title: maintenanceRequests.title, status: maintenanceRequests.status, createdAt: maintenanceRequests.createdAt })
        .from(maintenanceRequests)
        .where(eq(maintenanceRequests.tenantId, req.params.id))
        .orderBy(desc(maintenanceRequests.createdAt))
        .limit(100);
      return { ...t, requests };
    }),
  );

  app.patch('/tenants/:id', { schema: { params: idParams, body: tenantBody.partial().strict() } }, async (req) =>
    orgTx(app, req, async (tx, a) => {
      const { smsConsent, ...patch } = req.body;
      if (patch.unitId) assertFound((await tx.select({ id: units.id }).from(units).where(and(eq(units.id, patch.unitId), isNull(units.archivedAt))))[0], 'Unit');
      const [t] = await tx
        .update(tenants)
        .set({ ...patch, ...(smsConsent === undefined ? {} : { smsConsentAt: smsConsent ? new Date() : null }) })
        .where(eq(tenants.id, req.params.id))
        .returning();
      assertFound(t, 'Tenant');
      if (!t.email && !t.phone) throw conflict('A tenant needs an email or phone');
      // Marking a tenancy inactive revokes every link the tenant holds (PRD §4.2).
      if (patch.occupancyStatus === 'past') await revokeSubjectLinks(tx, a.orgId, t.id);
      return t;
    }),
  );
};
