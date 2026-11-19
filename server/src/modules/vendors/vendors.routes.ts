import { and, arrayContains, desc, eq, ilike, isNotNull, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Tx } from '../../db/client.js';
import { attachments, organizations, quotes, vendorDocuments, vendors, workOrders } from '../../db/schema/index.js';
import { assertFound, badRequest } from '../../lib/errors.js';
import { email, idParams, keyset, likeEscape, optionalText, page, pageQuery, phone, shortText } from '../../lib/validation.js';
import { orgTx } from '../../shared/http.js';
import { canReach, notify, orgSmsEnabled } from '../../shared/outbox.js';
import { replaceReminders } from '../../shared/reminders.js';
import { revokeSubjectLinks } from '../links/links.service.js';
import { complianceFor, complianceOf } from './compliance.js';

const vendorBody = z.object({
  companyName: shortText,
  contactName: optionalText(200),
  email: email.nullish(),
  phone: phone.nullish(),
  address: optionalText(500),
  categoryIds: z.array(z.uuid()).max(50).default([]),
  coverageZips: z.array(z.string().regex(/^\d{5}$/)).max(500).default([]),
  coverageCities: z.array(z.string().trim().toLowerCase().min(1).max(100)).max(200).default([]),
  availabilityText: optionalText(500),
  notes: optionalText(5000),
  smsConsent: z.boolean().optional(),
  externalId: optionalText(100),
});

/** Shared by the PM API and the vendor's own profile link. Insurance and licences must carry an expiry. */
export const docBody = z
  .object({
    type: z.enum(['license', 'insurance', 'w9', 'other']),
    label: optionalText(200),
    attachmentId: z.uuid(),
    expiresOn: z.iso.date().nullish(),
  })
  .refine((d) => !(d.type === 'insurance' || d.type === 'license') || d.expiresOn, { message: 'Insurance and licences need an expiry date', path: ['expiresOn'] });

/** A confirmed upload attached to this vendor. */
export async function vendorUploadKey(tx: Tx, vendorId: string, attachmentId: string): Promise<string | null> {
  const [file] = await tx
    .select({ fileKey: attachments.fileKey })
    .from(attachments)
    .where(and(eq(attachments.id, attachmentId), eq(attachments.subjectType, 'vendor'), eq(attachments.subjectId, vendorId), eq(attachments.uploaded, true)));
  return file?.fileKey ?? null;
}

const DOC_REMINDER_DAYS = [30, 7, 0];

/** Reminders 30/7/0 days before expiry (PRD §7.4). They fire only if the expiry date hasn't changed since. */
export async function scheduleDocReminders(tx: Tx, orgId: string, doc: { id: string; expiresOn: string | null }, now = new Date()) {
  const planned = doc.expiresOn
    ? DOC_REMINDER_DAYS.map((d) => {
        // 14:00 UTC ≈ morning in US time zones. shortcut: use the org timezone when reminders need to be exact.
        const due = new Date(`${doc.expiresOn}T14:00:00Z`);
        due.setUTCDate(due.getUTCDate() - d);
        return { type: 'doc.expiring', dueAt: due, expectedStatus: doc.expiresOn };
      }).filter((r) => r.dueAt > now)
    : [];
  await replaceReminders(tx, orgId, { type: 'vendor_document', id: doc.id }, planned, now);
}

export const vendorRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.get(
    '/',
    {
      schema: {
        querystring: pageQuery.extend({
          q: z.string().max(100).optional(),
          categoryId: z.uuid().optional(),
          zip: z.string().regex(/^\d{5}$/).optional(),
          city: z.string().trim().toLowerCase().max(100).optional(),
          active: z.enum(['true', 'false', 'all']).default('true'),
        }),
      },
    },
    async (req) =>
      orgTx(app, req, async (tx) => {
        const { q, categoryId, zip, city, active, limit, cursor } = req.query;
        const like = q ? `%${likeEscape(q)}%` : null;
        const rows = await tx
          .select()
          .from(vendors)
          .where(
            and(
              active === 'all' ? undefined : eq(vendors.active, active === 'true'),
              like ? or(ilike(vendors.companyName, like), ilike(vendors.contactName, like)) : undefined,
              categoryId ? arrayContains(vendors.categoryIds, [categoryId]) : undefined,
              zip ? arrayContains(vendors.coverageZips, [zip]) : undefined,
              city ? arrayContains(vendors.coverageCities, [city]) : undefined,
              keyset(vendors, cursor),
            ),
          )
          .orderBy(desc(vendors.createdAt), desc(vendors.id))
          .limit(limit + 1);
        const { items, nextCursor } = page(rows, limit);
        const compliance = await complianceFor(tx, items.map((v) => v.id));
        return { items: items.map((v) => ({ ...v, compliance: compliance.get(v.id) })), nextCursor };
      }),
  );

  app.post('/', { schema: { body: vendorBody } }, async (req, reply) => {
    const { smsConsent, ...body } = req.body;
    const row = await orgTx(app, req, async (tx, a) => {
      const [v] = await tx.insert(vendors).values({ ...body, orgId: a.orgId, smsConsentAt: smsConsent ? new Date() : null }).returning();
      return v;
    });
    return reply.status(201).send(row);
  });

  // Vendor profile (PRD §7.3)
  app.get('/:id', { schema: { params: idParams } }, async (req) =>
    orgTx(app, req, async (tx) => {
      const id = req.params.id;
      const [v] = await tx.select().from(vendors).where(eq(vendors.id, id));
      assertFound(v, 'Vendor');
      const [jobs, quoteHistory, docs, [metrics]] = await Promise.all([
        tx
          .select({ id: workOrders.id, ref: workOrders.ref, status: workOrders.status, description: workOrders.description, priority: workOrders.priority, createdAt: workOrders.createdAt })
          .from(workOrders)
          .where(eq(workOrders.vendorId, id))
          .orderBy(desc(workOrders.createdAt))
          .limit(200),
        tx
          .select({ id: quotes.id, workOrderId: quotes.workOrderId, amountCents: quotes.amountCents, status: quotes.status, version: quotes.version, createdAt: quotes.createdAt })
          .from(quotes)
          .where(eq(quotes.vendorId, id))
          .orderBy(desc(quotes.createdAt))
          .limit(100),
        tx.select().from(vendorDocuments).where(eq(vendorDocuments.vendorId, id)).orderBy(desc(vendorDocuments.createdAt)),
        tx
          .select({
            medianAcceptHours: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from ${workOrders.acceptedAt} - ${workOrders.assignedAt}) / 3600)`,
            medianCompleteHours: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from ${workOrders.completedAt} - ${workOrders.assignedAt}) / 3600)`,
          })
          .from(workOrders)
          .where(and(eq(workOrders.vendorId, id), isNotNull(workOrders.assignedAt))),
      ]);
      return {
        ...v,
        compliance: await complianceOf(tx, id),
        documents: docs,
        // The client splits these into open/done; sending three copies tripled the payload.
        assignedWorkOrders: jobs,
        quoteHistory,
        responseTimes: metrics,
      };
    }),
  );

  app.patch(
    '/:id',
    { schema: { params: idParams, body: vendorBody.partial().extend({ active: z.boolean().optional() }).strict() } },
    async (req) =>
      orgTx(app, req, async (tx, a) => {
        const { smsConsent, ...patch } = req.body;
        const [v] = await tx
          .update(vendors)
          .set({ ...patch, ...(smsConsent === undefined ? {} : { smsConsentAt: smsConsent ? new Date() : null }) })
          .where(eq(vendors.id, req.params.id))
          .returning();
        assertFound(v, 'Vendor');
        if (patch.active === false) await revokeSubjectLinks(tx, a.orgId, v.id);
        return v;
      }),
  );

  // Vendor documents with expiry (PRD §7.4). The file is uploaded first via /files/uploads (subject: vendor).
  app.post('/:id/documents', { schema: { params: idParams, body: docBody } }, async (req, reply) => {
    const row = await orgTx(app, req, async (tx, a) => {
      const [v] = await tx.select({ id: vendors.id }).from(vendors).where(eq(vendors.id, req.params.id));
      assertFound(v, 'Vendor');
      const fileKey = await vendorUploadKey(tx, v.id, req.body.attachmentId);
      if (!fileKey) throw badRequest('Upload the file first');
      const [d] = await tx
        .insert(vendorDocuments)
        .values({ orgId: a.orgId, vendorId: v.id, type: req.body.type, label: req.body.label ?? null, fileKey, expiresOn: req.body.expiresOn ?? null })
        .returning();
      await scheduleDocReminders(tx, a.orgId, d!);
      return d;
    });
    return reply.status(201).send(row);
  });

  app.patch(
    '/:id/documents/:docId',
    {
      schema: {
        params: z.object({ id: z.uuid(), docId: z.uuid() }),
        body: z.object({ label: optionalText(200), expiresOn: z.iso.date().nullable() }).partial().strict(),
      },
    },
    async (req) =>
      orgTx(app, req, async (tx, a) => {
        if (req.body.expiresOn === null) {
          const [cur] = await tx.select({ type: vendorDocuments.type }).from(vendorDocuments).where(eq(vendorDocuments.id, req.params.docId));
          if (cur?.type === 'insurance' || cur?.type === 'license') throw badRequest('Insurance and licences need an expiry date');
        }
        const [d] = await tx
          .update(vendorDocuments)
          .set(req.body)
          .where(and(eq(vendorDocuments.id, req.params.docId), eq(vendorDocuments.vendorId, req.params.id)))
          .returning();
        assertFound(d, 'Document');
        if ('expiresOn' in req.body) await scheduleDocReminders(tx, a.orgId, d);
        return d;
      }),
  );

  app.delete('/:id/documents/:docId', { schema: { params: z.object({ id: z.uuid(), docId: z.uuid() }) } }, async (req, reply) => {
    const fileKey = await orgTx(app, req, async (tx, a) => {
      const [d] = await tx
        .delete(vendorDocuments)
        .where(and(eq(vendorDocuments.id, req.params.docId), eq(vendorDocuments.vendorId, req.params.id)))
        .returning({ id: vendorDocuments.id, fileKey: vendorDocuments.fileKey });
      assertFound(d, 'Document');
      await replaceReminders(tx, a.orgId, { type: 'vendor_document', id: d.id }, []);
      // W-9s carry tax IDs: delete the file too, not just the record.
      await tx.delete(attachments).where(eq(attachments.fileKey, d.fileKey));
      return d.fileKey;
    });
    // After commit: a failed object delete only leaks storage, never a dangling record.
    await app.storage.delete(fileKey).catch((err) => req.log.warn({ err }, 'vendor document file delete failed'));
    return reply.status(204).send();
  });

  app.get('/:id/documents/:docId/url', { schema: { params: z.object({ id: z.uuid(), docId: z.uuid() }) } }, async (req) =>
    orgTx(app, req, async (tx) => {
      const [d] = await tx
        .select({ fileKey: vendorDocuments.fileKey, type: vendorDocuments.type })
        .from(vendorDocuments)
        .where(and(eq(vendorDocuments.id, req.params.docId), eq(vendorDocuments.vendorId, req.params.id)));
      assertFound(d, 'Document');
      return { url: await app.storage.presignDownload(d.fileKey, `${d.type}-${req.params.docId}`) };
    }),
  );

  // "Invite vendor to confirm details" (PRD §7.1): a no-login profile + document upload link.
  app.post('/:id/invite', { schema: { params: idParams } }, async (req, reply) => {
    await orgTx(app, req, async (tx, a) => {
      const [v] = await tx.select().from(vendors).where(eq(vendors.id, req.params.id));
      assertFound(v, 'Vendor');
      const to = { type: 'vendor' as const, id: v.id, email: v.email, phone: v.phone, smsConsentAt: v.smsConsentAt };
      const smsEnabled = await orgSmsEnabled(tx, a.orgId);
      if (!canReach(to, smsEnabled)) throw badRequest('This vendor has no email on file, so there is nowhere to send the invite');
      const [org] = await tx.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, a.orgId));
      await notify(
        tx,
        {
          orgId: a.orgId,
          to,
          template: 'vendor.invite',
          vars: { orgName: org!.name },
          subject: { type: 'vendor', id: v.id },
          link: { purpose: 'vendor_profile', scopeId: v.id, ttlHours: 14 * 24 },
          sms: true,
        },
        smsEnabled,
      );
    });
    return reply.status(202).send();
  });
};

