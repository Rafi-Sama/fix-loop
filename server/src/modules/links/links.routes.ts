/**
 * No-login link endpoints for vendors, tenants and owners (PRD §1.1).
 * Every view is built field-by-field: nothing internal (notes, other tenants, owner data for vendors) can leak.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { withOrg } from '../../db/client.js';
import { appointments, categories, invoices, maintenanceRequests, quotes, vendorDocuments, vendors, workOrders } from '../../db/schema/index.js';
import { badRequest, forbidden, gone } from '../../lib/errors.js';
import { email, optionalText, phone, shortText } from '../../lib/validation.js';
import type { Actor } from '../../shared/actor.js';
import { completeUpload, downloadUrl, listAttachments, startUpload, uploadRequest, type AttachmentKind, type AttachmentSubject } from '../files/files.service.js';
import { answerInfo, confirmFix } from '../requests/requests.service.js';
import { docBody, scheduleDocReminders, vendorUploadKey } from '../vendors/vendors.routes.js';
import { formatWindow, loadWorkOrder, makeCtx, type Ctx, type LoadedWo } from '../work-orders/context.js';
import * as wo from '../work-orders/work-orders.service.js';
import { resolveLink, type AccessLink, type LinkPurpose } from './links.service.js';

const tokenParams = z.object({ token: z.string().max(100) });
const fileParams = tokenParams.extend({ id: z.uuid() });

const VENDOR_PURPOSES: LinkPurpose[] = ['job', 'vendor_profile'];
const TENANT_PURPOSES: LinkPurpose[] = ['request_track', 'needs_info', 'confirm_fix', 'my_requests'];
// Invite, reset and confirm-email links are readable too, so the UI can tell a live link from a dead one
// (they reveal only their purpose and the firm's name).
const ALL: LinkPurpose[] = [...VENDOR_PURPOSES, ...TENANT_PURPOSES, 'approval', 'user_invite', 'password_reset', 'email_verify'];

function actorFor(link: AccessLink): Actor {
  const base = { orgId: link.orgId };
  if (VENDOR_PURPOSES.includes(link.purpose)) return { ...base, type: 'vendor', id: link.subjectId };
  if (link.purpose === 'approval') return { ...base, type: 'owner', id: link.subjectId };
  // An unverified submitter's tracking link is keyed by the request itself; they act anonymously.
  const anonymous = link.purpose === 'request_track' && link.subjectId === link.scopeId;
  return { ...base, type: 'tenant', id: anonymous ? null : link.subjectId };
}

const PLAIN_STATUS: Record<string, string> = {
  new: 'Received',
  needs_info: 'We need more information',
  in_progress: 'In progress',
  resolved: 'Completed',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

/** Which upload kinds each link may add, and to what. */
function uploadTarget(link: AccessLink, kind: AttachmentKind): AttachmentSubject {
  const allowed: Partial<Record<LinkPurpose, { type: AttachmentSubject['type']; kinds: AttachmentKind[] }>> = {
    job: { type: 'work_order', kinds: ['completion_photo', 'quote', 'invoice'] },
    request_track: { type: 'request', kinds: ['issue_photo'] },
    needs_info: { type: 'request', kinds: ['issue_photo'] },
    vendor_profile: { type: 'vendor', kinds: ['document'] },
  };
  const rule = allowed[link.purpose];
  if (!rule?.kinds.includes(kind)) throw forbidden('This link cannot upload that kind of file');
  return { type: rule.type, id: link.scopeId };
}

function vendorActions(w: LoadedWo): string[] {
  const emergency = w.wo.priority === 'emergency';
  switch (w.wo.status) {
    case 'awaiting_acceptance':
      return emergency ? ['accept', 'decline', 'start'] : ['accept', 'decline'];
    case 'awaiting_quote':
      return ['quote', 'decline'];
    case 'awaiting_approval':
      return ['quote', 'decline'];
    case 'awaiting_scheduling':
      return emergency ? ['schedule', 'start', 'decline'] : ['schedule', 'decline'];
    case 'scheduled':
      return ['start', 'reschedule', 'no_access', 'quote', 'decline'];
    case 'in_progress':
      return ['complete', 'quote'];
    default:
      return [];
  }
}

export const linkRoutes: FastifyPluginAsyncZod = async (app) => {
  // Tokens are unguessable, but cap probing anyway.
  const limit = { rateLimit: { max: 60, timeWindow: '1 minute', keyGenerator: (req: { ip: string }) => req.ip } };

  /** Resolve the token, then run inside the link's org with the link holder as actor. */
  async function withLink<T>(token: string, purposes: LinkPurpose[], fn: (c: Ctx, link: AccessLink) => Promise<T>): Promise<T> {
    const link = await resolveLink(app.db, token, purposes);
    return withOrg(app.db, link.orgId, async (tx) => {
      const c = await makeCtx(tx, actorFor(link));
      if (c.org.suspendedAt) throw gone('This link is no longer active');
      return fn(c, link);
    });
  }

  /** The vendor's view of their job. 410 once the job moved to another vendor. */
  async function loadJob(c: Ctx, link: AccessLink, lock = false) {
    const w = await loadWorkOrder(c.tx, link.scopeId, { lock });
    if (w.wo.vendorId !== link.subjectId) throw gone('This job is no longer assigned to you');
    return w;
  }

  app.get('/:token', { config: limit, schema: { params: tokenParams } }, async (req) =>
    withLink(req.params.token, ALL, async (c, link) => {
      const org = { name: c.org.name, phone: c.org.phone, emergencyPhone: c.org.emergencyPhone, timezone: c.org.timezone };
      switch (link.purpose) {
        case 'job': {
          const w = await loadJob(c, link);
          const accepted = !['draft', 'awaiting_acceptance'].includes(w.wo.status) || w.wo.priority === 'emergency';
          const [[appt], [quote], [invoice], photos, [category]] = await Promise.all([
            c.tx.select().from(appointments).where(and(eq(appointments.workOrderId, w.wo.id), inArray(appointments.status, ['scheduled', 'tenant_conflict']))).orderBy(desc(appointments.createdAt)).limit(1),
            c.tx.select({ amountCents: quotes.amountCents, status: quotes.status, version: quotes.version }).from(quotes).where(eq(quotes.workOrderId, w.wo.id)).orderBy(desc(quotes.version)).limit(1),
            c.tx.select({ amountCents: invoices.amountCents, status: invoices.status }).from(invoices).where(eq(invoices.workOrderId, w.wo.id)).orderBy(desc(invoices.createdAt)).limit(1),
            listAttachments(c.tx, app.storage, { type: 'request', id: w.request.id }, ['issue_photo']),
            c.tx.select({ name: categories.name }).from(categories).where(eq(categories.id, w.request.categoryId)),
          ]);
          return {
            purpose: 'job',
            org,
            job: {
              ref: w.wo.ref,
              status: w.wo.status,
              priority: w.wo.priority,
              description: w.wo.description,
              requiredWork: w.wo.requiredWork,
              expectedCompletionAt: w.wo.expectedCompletionAt,
              quoteRequired: w.wo.quoteRequired,
              approvedAmountCents: w.wo.approvedAmountCents,
            },
            issue: { title: w.request.title, description: w.request.description, category: category?.name ?? null, photos },
            location: { address: w.property.addressLine, unit: w.unit.label === 'Main' ? null : w.unit.label, city: w.property.city, state: w.property.state, zip: w.property.zip },
            // Tenant contact and access details only once the vendor has taken the job.
            access: accepted
              ? {
                  tenantName: w.tenant?.name ?? w.request.submitterName,
                  tenantPhone: w.tenant?.phone ?? w.request.submitterPhone,
                  availability: w.request.availabilityText,
                  permissionToEnter: w.request.permissionToEnter,
                  accessNotes: w.request.accessNotes,
                  pets: w.request.pets,
                }
              : null,
            appointment: appt ? { startsAt: appt.startsAt, endsAt: appt.endsAt, status: appt.status, window: formatWindow(appt.startsAt, appt.endsAt, c.org.timezone) } : null,
            quote: quote ?? null,
            invoice: invoice ?? null,
            actions: vendorActions(w),
          };
        }
        case 'approval': {
          const w = await loadWorkOrder(c.tx, link.scopeId);
          if (w.owner.id !== link.subjectId) throw gone();
          const [[quote], photos] = await Promise.all([
            c.tx.select().from(quotes).where(and(eq(quotes.workOrderId, w.wo.id), eq(quotes.status, 'pending'))).limit(1),
            listAttachments(c.tx, app.storage, { type: 'request', id: w.request.id }, ['issue_photo']),
          ]);
          const pending = w.wo.status === 'awaiting_approval' && w.wo.approvalPendingWith === 'owner' && Boolean(quote);
          return {
            purpose: 'approval',
            org,
            pending,
            property: { address: w.property.addressLine, unit: w.unit.label === 'Main' ? null : w.unit.label, city: w.property.city },
            issue: { title: w.request.title, description: w.request.description, photos },
            vendor: w.vendor ? { companyName: w.vendor.companyName } : null,
            quote: quote ? { amountCents: quote.amountCents, description: quote.description, hasFile: Boolean(quote.fileKey) } : null,
          };
        }
        case 'request_track':
        case 'needs_info':
        case 'confirm_fix': {
          const [r] = await c.tx.select().from(maintenanceRequests).where(eq(maintenanceRequests.id, link.scopeId));
          if (!r) throw gone();
          const [appt] = await c.tx
            .select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt, status: appointments.status })
            .from(appointments)
            .innerJoin(workOrders, eq(workOrders.id, appointments.workOrderId))
            .where(and(eq(workOrders.requestId, r.id), eq(workOrders.status, 'scheduled'), inArray(appointments.status, ['scheduled', 'tenant_conflict'])))
            .orderBy(desc(appointments.createdAt))
            .limit(1);
          return {
            purpose: link.purpose,
            org,
            request: {
              ref: r.ref,
              title: r.title,
              status: PLAIN_STATUS[r.status],
              createdAt: r.createdAt,
              question: r.status === 'needs_info' ? r.infoRequest : null,
              awaitingConfirmation: r.status === 'resolved' && r.tenantConfirmed === null,
            },
            appointment: appt ? { ...appt, window: formatWindow(appt.startsAt, appt.endsAt, c.org.timezone) } : null,
          };
        }
        case 'my_requests': {
          const rows = await c.tx
            .select({ ref: maintenanceRequests.ref, title: maintenanceRequests.title, status: maintenanceRequests.status, createdAt: maintenanceRequests.createdAt })
            .from(maintenanceRequests)
            .where(eq(maintenanceRequests.tenantId, link.subjectId))
            .orderBy(desc(maintenanceRequests.createdAt))
            .limit(100);
          return { purpose: 'my_requests', org, requests: rows.map((r) => ({ ...r, status: PLAIN_STATUS[r.status] })) };
        }
        case 'vendor_profile': {
          const [v] = await c.tx.select().from(vendors).where(eq(vendors.id, link.subjectId));
          if (!v?.active) throw gone();
          const docs = await c.tx
            .select({ id: vendorDocuments.id, type: vendorDocuments.type, label: vendorDocuments.label, expiresOn: vendorDocuments.expiresOn })
            .from(vendorDocuments)
            .where(eq(vendorDocuments.vendorId, v.id));
          return {
            purpose: 'vendor_profile',
            org,
            vendor: { companyName: v.companyName, contactName: v.contactName, email: v.email, phone: v.phone, address: v.address, availabilityText: v.availabilityText },
            documents: docs,
          };
        }
        case 'user_invite':
        case 'password_reset':
        case 'email_verify':
          return { purpose: link.purpose, org: { name: c.org.name } };
        default:
          throw gone();
      }
    }),
  );

  // ---------- uploads (photos, quote/invoice PDFs, compliance docs) ----------
  app.post(
    '/:token/uploads',
    { config: limit, schema: { params: tokenParams, body: uploadRequest.extend({ kind: z.enum(['issue_photo', 'completion_photo', 'quote', 'invoice', 'document']) }) } },
    async (req, reply) => {
      const { kind, ...file } = req.body;
      const r = await withLink(req.params.token, ['job', 'request_track', 'needs_info', 'vendor_profile'], async (c, link) => {
        if (link.purpose === 'job') await loadJob(c, link);
        return startUpload(c.tx, app.storage, c.actor, uploadTarget(link, kind), kind, file);
      });
      return reply.status(201).send(r);
    },
  );

  app.post('/:token/uploads/:id/complete', { config: limit, schema: { params: fileParams } }, async (req) =>
    withLink(req.params.token, ['job', 'request_track', 'needs_info', 'vendor_profile'], async (c, link) => {
      const subject: AttachmentSubject = { type: link.purpose === 'job' ? 'work_order' : link.purpose === 'vendor_profile' ? 'vendor' : 'request', id: link.scopeId };
      const a = await completeUpload(c.tx, app.storage, req.params.id, subject);
      return { id: a.id, kind: a.kind };
    }),
  );

  app.get('/:token/files/:id', { config: limit, schema: { params: fileParams } }, async (req) =>
    withLink(req.params.token, ['job', 'approval', 'request_track'], async (c, link) => {
      const allowed: AttachmentSubject[] = [];
      if (link.purpose === 'request_track') allowed.push({ type: 'request', id: link.scopeId });
      else {
        const w = link.purpose === 'job' ? await loadJob(c, link) : await loadWorkOrder(c.tx, link.scopeId);
        allowed.push({ type: 'request', id: w.request.id }, { type: 'work_order', id: w.wo.id });
      }
      return { url: await downloadUrl(c.tx, app.storage, req.params.id, allowed) };
    }),
  );

  // ---------- vendor job actions ----------
  const job = <B extends z.ZodType>(path: string, body: B, fn: (c: Ctx, id: string, b: z.infer<B>) => Promise<unknown>) =>
    app.post(`/:token/${path}`, { config: limit, schema: { params: tokenParams, body } }, async (req, reply) => {
      await withLink(req.params.token, ['job'], async (c, link) => {
        await loadJob(c, link);
        await fn(c, link.scopeId, req.body as z.infer<B>);
      });
      return reply.status(204).send();
    });

  job('accept', z.object({}).optional(), (c, id) => wo.acceptJob(c, id));
  job('decline', z.object({ reason: shortText }), (c, id, b) => wo.declineJob(c, id, b.reason));
  job('quote', wo.quoteInput, (c, id, b) => wo.submitQuote(c, id, b));
  job('schedule', wo.scheduleInput, (c, id, b) => wo.scheduleAppointment(c, id, b));
  job('no-access', z.object({ reason: z.enum(['tenant_no_show', 'no_permission', 'vendor_cancelled']), note: optionalText(1000) }), (c, id, b) =>
    wo.reportNoAccess(c, id, b.reason, b.note ?? null),
  );
  job('start', z.object({}).optional(), (c, id) => wo.startJob(c, id));
  job('complete', wo.completeInput, (c, id, b) => wo.completeJob(c, id, b));

  // ---------- owner approval ----------
  app.post(
    '/:token/decide',
    { config: limit, schema: { params: tokenParams, body: z.object({ decision: z.enum(['approved', 'declined', 'call_me']), note: optionalText(1000) }) } },
    async (req, reply) => {
      await withLink(req.params.token, ['approval'], (c, link) => wo.ownerDecide(c, link.scopeId, { decision: req.body.decision, note: req.body.note ?? null }));
      return reply.status(204).send();
    },
  );

  // ---------- tenant actions ----------
  app.post('/:token/conflict', { config: limit, schema: { params: tokenParams, body: z.object({ note: optionalText(1000) }) } }, async (req, reply) => {
    await withLink(req.params.token, ['request_track'], async (c, link) => {
      const [scheduled] = await c.tx
        .select({ id: workOrders.id })
        .from(workOrders)
        .where(and(eq(workOrders.requestId, link.scopeId), eq(workOrders.status, 'scheduled')))
        .limit(1);
      if (!scheduled) throw badRequest('There is no upcoming appointment');
      await wo.tenantConflict(c, scheduled.id, req.body.note ?? null);
    });
    return reply.status(204).send();
  });

  app.post(
    '/:token/answer',
    { config: limit, schema: { params: tokenParams, body: z.object({ answer: z.string().trim().min(1).max(5000), photoIds: z.array(z.uuid()).max(15).default([]) }) } },
    async (req, reply) => {
      await withLink(req.params.token, ['needs_info'], (c, link) => answerInfo(c, link.scopeId, req.body.answer, req.body.photoIds));
      return reply.status(204).send();
    },
  );

  app.post(
    '/:token/confirm',
    { config: limit, schema: { params: tokenParams, body: z.object({ fixed: z.boolean(), rating: z.number().int().min(1).max(5).optional(), note: optionalText(2000) }) } },
    async (req, reply) => {
      await withLink(req.params.token, ['confirm_fix'], (c, link) => confirmFix(c, link.scopeId, req.body));
      return reply.status(204).send();
    },
  );

  // ---------- vendor self-onboarding ----------
  app.patch(
    '/:token/profile',
    {
      config: limit,
      schema: {
        params: tokenParams,
        body: z.object({ contactName: optionalText(200), email: email.nullable(), phone: phone.nullable(), address: optionalText(500), availabilityText: optionalText(500), smsConsent: z.boolean() }).partial().strict(),
      },
    },
    async (req, reply) => {
      await withLink(req.params.token, ['vendor_profile'], async (c, link) => {
        const { smsConsent, ...patch } = req.body;
        await c.tx
          .update(vendors)
          .set({ ...patch, ...(smsConsent === undefined ? {} : { smsConsentAt: smsConsent ? c.now : null }) })
          .where(and(eq(vendors.id, link.subjectId), eq(vendors.active, true)));
      });
      return reply.status(204).send();
    },
  );

  app.post('/:token/documents', { config: limit, schema: { params: tokenParams, body: docBody } }, async (req, reply) => {
    await withLink(req.params.token, ['vendor_profile'], async (c, link) => {
      const fileKey = await vendorUploadKey(c.tx, link.subjectId, req.body.attachmentId);
      if (!fileKey) throw badRequest('Upload the file first');
      const [d] = await c.tx
        .insert(vendorDocuments)
        .values({ orgId: c.org.id, vendorId: link.subjectId, type: req.body.type, label: req.body.label ?? null, fileKey, expiresOn: req.body.expiresOn ?? null })
        .returning();
      await scheduleDocReminders(c.tx, c.org.id, d!);
    });
    return reply.status(201).send();
  });
};
