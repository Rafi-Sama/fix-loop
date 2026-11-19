import { and, asc, desc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { appointments, approvals, comments, events, invoices, maintenanceRequests, notifications, properties, quotes, units, vendors, workOrders } from '../../db/schema/index.js';
import { idParams, keyset, likeEscape, longText, optionalText, page, pageQuery, shortText } from '../../lib/validation.js';
import { orgTx } from '../../shared/http.js';
import { listAttachments } from '../files/files.service.js';
import { addComment } from '../requests/requests.service.js';
import { complianceOf } from '../vendors/compliance.js';
import { loadWorkOrder, makeCtx } from './context.js';
import { WO_STATUSES, waitingOn } from './state-machine.js';
import * as svc from './work-orders.service.js';

export const workOrderRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  /** Runs a work order command in an RLS transaction with a fresh context. */
  const run = <T>(req: Parameters<typeof orgTx>[1], fn: (c: Awaited<ReturnType<typeof makeCtx>>) => Promise<T>) =>
    orgTx(app, req, async (tx, actor) => fn(await makeCtx(tx, actor)));

  app.get(
    '/',
    {
      schema: {
        querystring: pageQuery.extend({
          q: z.string().max(100).optional(),
          status: z.union([z.enum(WO_STATUSES), z.array(z.enum(WO_STATUSES))]).optional(),
          vendorId: z.uuid().optional(),
          propertyId: z.uuid().optional(),
          priority: z.enum(['emergency', 'high', 'normal', 'low']).optional(),
        }),
      },
    },
    async (req) =>
      orgTx(app, req, async (tx) => {
        const { q, status, vendorId, propertyId, priority, limit, cursor } = req.query;
        const statuses = status === undefined ? undefined : Array.isArray(status) ? status : [status];
        const like = q ? `%${likeEscape(q)}%` : null;
        const where: (SQL | undefined)[] = [
          statuses ? inArray(workOrders.status, statuses) : undefined,
          vendorId ? eq(workOrders.vendorId, vendorId) : undefined,
          propertyId ? eq(units.propertyId, propertyId) : undefined,
          priority ? eq(workOrders.priority, priority) : undefined,
          like ? or(ilike(workOrders.ref, like), ilike(workOrders.description, like), ilike(properties.addressLine, like)) : undefined,
          keyset(workOrders, cursor),
        ];
        const rows = await tx
          .select({
            id: workOrders.id,
            ref: workOrders.ref,
            status: workOrders.status,
            priority: workOrders.priority,
            description: workOrders.description,
            approvalPendingWith: workOrders.approvalPendingWith,
            statusChangedAt: workOrders.statusChangedAt,
            expectedCompletionAt: workOrders.expectedCompletionAt,
            createdAt: workOrders.createdAt,
            requestRef: maintenanceRequests.ref,
            address: properties.addressLine,
            unitLabel: units.label,
            vendorName: vendors.companyName,
          })
          .from(workOrders)
          .innerJoin(maintenanceRequests, eq(maintenanceRequests.id, workOrders.requestId))
          .innerJoin(units, eq(units.id, workOrders.unitId))
          .innerJoin(properties, eq(properties.id, units.propertyId))
          .leftJoin(vendors, eq(vendors.id, workOrders.vendorId))
          .where(and(...where))
          .orderBy(desc(workOrders.createdAt), desc(workOrders.id))
          .limit(limit + 1);
        const p = page(rows, limit);
        return { ...p, items: p.items.map((r) => ({ ...r, waitingOn: r.approvalPendingWith === 'owner' ? 'owner' : waitingOn(r.status) })) };
      }),
  );

  // Work order details (PRD §6.6) with timeline (§6.7) and communication history (§8.4).
  app.get('/:id', { schema: { params: idParams } }, async (req) =>
    orgTx(app, req, async (tx) => {
      const id = req.params.id;
      const w = await loadWorkOrder(tx, id);
      const [quoteRows, approvalRows, appts, invoiceRows, files, requestFiles, timeline, notes, comms, compliance] = await Promise.all([
        tx.select().from(quotes).where(eq(quotes.workOrderId, id)).orderBy(desc(quotes.version)),
        tx.select().from(approvals).where(eq(approvals.workOrderId, id)).orderBy(asc(approvals.decidedAt)),
        tx.select().from(appointments).where(eq(appointments.workOrderId, id)).orderBy(desc(appointments.createdAt)),
        tx.select().from(invoices).where(eq(invoices.workOrderId, id)).orderBy(desc(invoices.createdAt)),
        listAttachments(tx, app.storage, { type: 'work_order', id }),
        listAttachments(tx, app.storage, { type: 'request', id: w.request.id }),
        tx.select().from(events).where(and(eq(events.subjectType, 'work_order'), eq(events.subjectId, id))).orderBy(asc(events.id)),
        tx.select().from(comments).where(and(eq(comments.subjectType, 'work_order'), eq(comments.subjectId, id))).orderBy(asc(comments.createdAt)),
        tx
          .select({ id: notifications.id, channel: notifications.channel, recipientType: notifications.recipientType, recipientId: notifications.recipientId, template: notifications.template, status: notifications.status, sentAt: notifications.sentAt, createdAt: notifications.createdAt })
          .from(notifications)
          .where(and(eq(notifications.subjectType, 'work_order'), eq(notifications.subjectId, id)))
          .orderBy(asc(notifications.createdAt)),
        w.vendor ? complianceOf(tx, w.vendor.id) : null,
      ]);
      return {
        ...w.wo,
        waitingOn: w.wo.approvalPendingWith === 'owner' ? 'owner' : waitingOn(w.wo.status),
        request: w.request,
        unit: w.unit,
        property: w.property,
        owner: w.owner,
        vendor: w.vendor && { ...w.vendor, compliance },
        // Only what the job needs (PRD §6.6).
        tenant: w.tenant ? { id: w.tenant.id, name: w.tenant.name, phone: w.tenant.phone, email: w.tenant.email } : null,
        quotes: quoteRows,
        approvals: approvalRows,
        appointments: appts,
        invoices: invoiceRows,
        attachments: [...requestFiles, ...files],
        timeline,
        comments: notes,
        communications: comms,
      };
    }),
  );

  app.patch('/:id', { schema: { params: idParams, body: svc.patchInput } }, async (req) => run(req, (c) => svc.updateWorkOrder(c, req.params.id, req.body)));

  app.post('/:id/assign', { schema: { params: idParams, body: z.object({ vendorId: z.uuid(), overrideReason: optionalText(500) }) } }, async (req) =>
    run(req, async (c) => (await svc.assignVendor(c, req.params.id, req.body)).wo),
  );
  app.post('/:id/resend-link', { schema: { params: idParams } }, async (req, reply) => {
    await run(req, (c) => svc.resendJobLink(c, req.params.id));
    return reply.status(202).send();
  });
  app.post('/:id/unassign', { schema: { params: idParams } }, async (req, reply) => {
    await run(req, (c) => svc.unassignVendor(c, req.params.id));
    return reply.status(204).send();
  });

  app.post(
    '/:id/quote-decision',
    {
      schema: {
        params: idParams,
        body: z.object({
          decision: z.enum(['approve', 'reject']),
          next: z.enum(['awaiting_quote', 'draft', 'cancelled']).optional(),
          ownerApprovedOffline: z.boolean().default(false),
          note: optionalText(1000),
        }),
      },
    },
    async (req, reply) => {
      await run(req, (c) => svc.pmDecideQuote(c, req.params.id, req.body));
      return reply.status(204).send();
    },
  );
  app.post('/:id/send-to-owner', { schema: { params: idParams } }, async (req, reply) => {
    await run(req, (c) => svc.sendToOwner(c, req.params.id));
    return reply.status(204).send();
  });

  // Proxy updates: the PM performs a vendor step on the vendor's behalf (PRD US-20).
  app.post('/:id/accept', { schema: { params: idParams } }, async (req, reply) => {
    await run(req, (c) => svc.acceptJob(c, req.params.id));
    return reply.status(204).send();
  });
  app.post('/:id/decline', { schema: { params: idParams, body: z.object({ reason: shortText }) } }, async (req, reply) => {
    await run(req, (c) => svc.declineJob(c, req.params.id, req.body.reason));
    return reply.status(204).send();
  });
  app.post('/:id/quotes', { schema: { params: idParams, body: svc.quoteInput } }, async (req, reply) =>
    reply.status(201).send(await run(req, (c) => svc.submitQuote(c, req.params.id, req.body))),
  );
  app.post('/:id/appointments', { schema: { params: idParams, body: svc.scheduleInput } }, async (req, reply) =>
    reply.status(201).send(await run(req, (c) => svc.scheduleAppointment(c, req.params.id, req.body))),
  );
  app.post(
    '/:id/no-access',
    { schema: { params: idParams, body: z.object({ reason: z.enum(['tenant_no_show', 'no_permission', 'vendor_cancelled']), note: optionalText(1000) }) } },
    async (req, reply) => {
      await run(req, (c) => svc.reportNoAccess(c, req.params.id, req.body.reason, req.body.note ?? null));
      return reply.status(204).send();
    },
  );
  app.post('/:id/start', { schema: { params: idParams } }, async (req, reply) => {
    await run(req, (c) => svc.startJob(c, req.params.id));
    return reply.status(204).send();
  });
  app.post('/:id/complete', { schema: { params: idParams, body: svc.completeInput } }, async (req, reply) =>
    reply.status(201).send(await run(req, (c) => svc.completeJob(c, req.params.id, req.body))),
  );

  // PM review (workflow steps 11–12)
  app.post('/:id/more-work', { schema: { params: idParams, body: z.object({ note: z.string().trim().min(3).max(2000) }) } }, async (req, reply) => {
    await run(req, (c) => svc.requestMoreWork(c, req.params.id, req.body.note));
    return reply.status(204).send();
  });
  app.post('/:id/close', { schema: { params: idParams, body: svc.closeInput } }, async (req, reply) => {
    await run(req, (c) => svc.closeWorkOrder(c, req.params.id, req.body));
    return reply.status(204).send();
  });
  app.post('/:id/cancel', { schema: { params: idParams, body: z.object({ reason: shortText }) } }, async (req, reply) => {
    await run(req, (c) => svc.cancelWorkOrder(c, req.params.id, req.body.reason));
    return reply.status(204).send();
  });

  app.post(
    '/:id/comments',
    { schema: { params: idParams, body: z.object({ body: longText, visibility: z.enum(['internal', 'shared']).default('internal') }) } },
    async (req, reply) =>
      reply.status(201).send(await run(req, (c) => addComment(c, { type: 'work_order', id: req.params.id }, req.body.body, req.body.visibility))),
  );
};
