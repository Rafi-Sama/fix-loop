import { and, asc, desc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { comments, events, maintenanceRequests, properties, tenants, units, workOrders } from '../../db/schema/index.js';
import { assertFound, badRequest } from '../../lib/errors.js';
import { idParams, keyset, likeEscape, longText, page, pageQuery, shortText } from '../../lib/validation.js';
import { orgTx } from '../../shared/http.js';
import { listAttachments } from '../files/files.service.js';
import { makeCtx } from '../work-orders/context.js';
import { createInput, createWorkOrder } from '../work-orders/work-orders.service.js';
import * as svc from './requests.service.js';

const STATUS = ['new', 'needs_info', 'in_progress', 'resolved', 'closed', 'cancelled'] as const;

export const requestRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.get(
    '/',
    {
      schema: {
        querystring: pageQuery.extend({
          q: z.string().max(100).optional(),
          status: z.union([z.enum(STATUS), z.array(z.enum(STATUS))]).optional(),
          priority: z.enum(['emergency', 'high', 'normal', 'low']).optional(),
          propertyId: z.uuid().optional(),
          unitId: z.uuid().optional(),
        }),
      },
    },
    async (req) =>
      orgTx(app, req, async (tx) => {
        const { q, status, priority, propertyId, unitId, limit, cursor } = req.query;
        const statuses = status === undefined ? undefined : Array.isArray(status) ? status : [status];
        const like = q ? `%${likeEscape(q)}%` : null;
        const where: (SQL | undefined)[] = [
          statuses ? inArray(maintenanceRequests.status, statuses) : undefined,
          priority ? eq(maintenanceRequests.priority, priority) : undefined,
          propertyId ? eq(units.propertyId, propertyId) : undefined,
          unitId ? eq(maintenanceRequests.unitId, unitId) : undefined,
          like ? or(ilike(maintenanceRequests.title, like), ilike(maintenanceRequests.ref, like), ilike(tenants.name, like), ilike(properties.addressLine, like)) : undefined,
          keyset(maintenanceRequests, cursor),
        ];
        const rows = await tx
          .select({
            id: maintenanceRequests.id,
            ref: maintenanceRequests.ref,
            title: maintenanceRequests.title,
            status: maintenanceRequests.status,
            priority: maintenanceRequests.priority,
            isEmergency: maintenanceRequests.isEmergency,
            source: maintenanceRequests.source,
            createdAt: maintenanceRequests.createdAt,
            statusChangedAt: maintenanceRequests.statusChangedAt,
            unitId: units.id,
            unitLabel: units.label,
            propertyId: properties.id,
            address: properties.addressLine,
            tenantName: tenants.name,
            verifiedTenant: maintenanceRequests.tenantId,
          })
          .from(maintenanceRequests)
          .innerJoin(units, eq(units.id, maintenanceRequests.unitId))
          .innerJoin(properties, eq(properties.id, units.propertyId))
          .leftJoin(tenants, eq(tenants.id, maintenanceRequests.tenantId))
          .where(and(...where))
          .orderBy(desc(maintenanceRequests.createdAt), desc(maintenanceRequests.id))
          .limit(limit + 1);
        const p = page(rows, limit);
        return { ...p, items: p.items.map(({ verifiedTenant, ...r }) => ({ ...r, verifiedTenant: verifiedTenant !== null })) };
      }),
  );

  app.get('/:id', { schema: { params: idParams } }, async (req) =>
    orgTx(app, req, async (tx) => {
      const id = req.params.id;
      const [r] = await tx
        .select({ request: maintenanceRequests, unit: units, property: properties, tenant: tenants })
        .from(maintenanceRequests)
        .innerJoin(units, eq(units.id, maintenanceRequests.unitId))
        .innerJoin(properties, eq(properties.id, units.propertyId))
        .leftJoin(tenants, eq(tenants.id, maintenanceRequests.tenantId))
        .where(eq(maintenanceRequests.id, id));
      assertFound(r, 'Request');
      const [jobs, files, timeline, notes] = await Promise.all([
        tx.select({ id: workOrders.id, ref: workOrders.ref, status: workOrders.status, vendorId: workOrders.vendorId }).from(workOrders).where(eq(workOrders.requestId, id)),
        listAttachments(tx, app.storage, { type: 'request', id }),
        tx.select().from(events).where(and(eq(events.subjectType, 'request'), eq(events.subjectId, id))).orderBy(asc(events.id)),
        tx.select().from(comments).where(and(eq(comments.subjectType, 'request'), eq(comments.subjectId, id))).orderBy(asc(comments.createdAt)),
      ]);
      return { ...r.request, unit: r.unit, property: r.property, tenant: r.tenant, workOrders: jobs, attachments: files, timeline, comments: notes };
    }),
  );

  // A PM logs a phoned-in or emailed report (PRD US-08).
  app.post(
    '/',
    { schema: { body: svc.requestFields.extend({ unitId: z.uuid(), tenantId: z.uuid().nullish() }) } },
    async (req, reply) => {
      const { unitId, tenantId, ...fields } = req.body;
      const r = await orgTx(app, req, async (tx, actor) => {
        let tenant = null;
        if (tenantId) {
          [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId));
          if (!tenant) throw badRequest('Unknown tenant');
          if (tenant.unitId !== unitId) throw badRequest('Tenant does not live in this unit');
        }
        const c = await makeCtx(tx, actor);
        return svc.createRequest(c, { unitId, tenant: tenant ?? null, source: 'pm_entered', fields });
      });
      return reply.status(201).send(r.request);
    },
  );

  app.patch('/:id', { schema: { params: idParams, body: svc.triagePatch } }, async (req) =>
    orgTx(app, req, async (tx, actor) => svc.triage(await makeCtx(tx, actor), req.params.id, req.body)),
  );

  app.post(
    '/:id/comments',
    { schema: { params: idParams, body: z.object({ body: longText, visibility: z.enum(['internal', 'shared']).default('internal') }) } },
    async (req, reply) => {
      const cm = await orgTx(app, req, async (tx, actor) => svc.addComment(await makeCtx(tx, actor), { type: 'request', id: req.params.id }, req.body.body, req.body.visibility));
      return reply.status(201).send(cm);
    },
  );

  app.post('/:id/needs-info', { schema: { params: idParams, body: z.object({ question: z.string().trim().min(3).max(1000) }) } }, async (req, reply) => {
    await orgTx(app, req, async (tx, actor) => svc.askForInfo(await makeCtx(tx, actor), req.params.id, req.body.question));
    return reply.status(204).send();
  });

  for (const outcome of ['closed', 'cancelled'] as const) {
    app.post(`/:id/${outcome === 'closed' ? 'close' : 'cancel'}`, { schema: { params: idParams, body: z.object({ reason: shortText }) } }, async (req, reply) => {
      await orgTx(app, req, async (tx, actor) => svc.endRequest(await makeCtx(tx, actor), req.params.id, outcome, req.body.reason));
      return reply.status(204).send();
    });
  }

  // Convert into a work order (workflow step 3).
  app.post('/:id/work-orders', { schema: { params: idParams, body: createInput.omit({ requestId: true }) } }, async (req, reply) => {
    const wo = await orgTx(app, req, async (tx, actor) => createWorkOrder(await makeCtx(tx, actor), { ...req.body, requestId: req.params.id }));
    return reply.status(201).send(wo);
  });
};
