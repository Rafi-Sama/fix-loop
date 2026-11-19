/**
 * Unauthenticated tenant intake (PRD §4.3, §5.1). Reachable from the firm-wide or per-property request link / QR code.
 * Nothing here lists addresses or tenants: a tenant is matched by their own email/phone, or picks a unit
 * of the property whose (unguessable) id is in their QR link.
 */
import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { withOrg, type DbOrTx, type Tx } from '../../db/client.js';
import { categories, deflections, organizations, properties, tenants, units } from '../../db/schema/index.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { email, phone, shortText } from '../../lib/validation.js';
import { notify } from '../../shared/outbox.js';
import { completeUpload, startUpload, uploadRequest } from '../files/files.service.js';
import { linkUrl } from '../links/links.service.js';
import { createRequest, requestFields, tenantParty } from '../requests/requests.service.js';
import { makeCtx } from '../work-orders/context.js';

const slugParams = z.object({ slug: z.string().regex(/^[a-z0-9-]{3,60}$/) });
const perIp = (max: number, timeWindow: string) => ({ rateLimit: { max, timeWindow, keyGenerator: (req: { ip: string }) => req.ip } });

const DISCLAIMER =
  'Submitting a request does not replace emergency services or your property’s emergency contact procedure. If anyone is in danger, call 911. For a gas smell, leave and call your gas utility.';

async function orgBySlug(tx: DbOrTx, slug: string) {
  const [org] = await tx.select({ id: organizations.id, suspendedAt: organizations.suspendedAt }).from(organizations).where(eq(organizations.slug, slug));
  // A suspended firm's intake page looks like any unknown link.
  if (!org || org.suspendedAt) throw notFound('Organization');
  return org.id;
}

/** Find the submitter among current tenants by their own email or phone. */
async function matchTenant(tx: Tx, contact: { email?: string | null | undefined; phone?: string | null | undefined }, unitId?: string) {
  const conds = [contact.email ? sql`lower(${tenants.email}) = ${contact.email}` : undefined, contact.phone ? eq(tenants.phone, contact.phone) : undefined].filter(Boolean);
  if (conds.length === 0) return null;
  const rows = await tx
    .select()
    .from(tenants)
    .where(and(or(...conds), inArray(tenants.occupancyStatus, ['current', 'notice_given'])))
    .limit(10);
  return rows.find((t) => t.unitId === unitId) ?? (unitId ? null : rows[0]) ?? null;
}

export const publicRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/orgs/:slug', { config: perIp(60, '1 minute'), schema: { params: slugParams } }, async (req) => {
    const orgId = await orgBySlug(app.db, req.params.slug);
    return withOrg(app.db, orgId, async (tx) => {
      const [org] = await tx
        .select({ name: organizations.name, emergencyPhone: organizations.emergencyPhone, emergencyKeywords: organizations.emergencyKeywords, sms: organizations.smsRegistrationStatus })
        .from(organizations)
        .where(eq(organizations.id, orgId));
      const cats = await tx
        .select({ id: categories.id, name: categories.name, photoRequired: categories.photoRequired, selfHelpKey: categories.selfHelpKey })
        .from(categories)
        .where(eq(categories.active, true))
        .orderBy(asc(categories.sortOrder));
      // smsEnabled: only offer "text me updates" when the firm can actually text.
      return { name: org!.name, emergencyPhone: org!.emergencyPhone, emergencyKeywords: org!.emergencyKeywords, smsEnabled: org!.sms === 'approved', disclaimer: DISCLAIMER, categories: cats };
    });
  });

  // Per-property QR link: lets an unmatched tenant pick their unit.
  app.get(
    '/orgs/:slug/properties/:propertyId',
    { config: perIp(30, '1 minute'), schema: { params: slugParams.extend({ propertyId: z.uuid() }) } },
    async (req) => {
      const orgId = await orgBySlug(app.db, req.params.slug);
      return withOrg(app.db, orgId, async (tx) => {
        const [p] = await tx
          .select({ addressLine: properties.addressLine, city: properties.city, emergencyPhone: properties.emergencyPhone })
          .from(properties)
          .where(and(eq(properties.id, req.params.propertyId), isNull(properties.archivedAt)));
        if (!p) throw notFound('Property');
        const unitRows = await tx
          .select({ id: units.id, label: units.label })
          .from(units)
          .where(and(eq(units.propertyId, req.params.propertyId), isNull(units.archivedAt)))
          .orderBy(asc(units.label));
        return { ...p, units: unitRows };
      });
    },
  );

  // Photos are uploaded before submit against a server-issued draft id that becomes the request id.
  app.post(
    '/orgs/:slug/uploads',
    { config: perIp(30, '10 minutes'), schema: { params: slugParams, body: uploadRequest.extend({ draftId: z.uuid().optional() }) } },
    async (req, reply) => {
      const orgId = await orgBySlug(app.db, req.params.slug);
      const draftId = req.body.draftId ?? randomUUID();
      const r = await withOrg(app.db, orgId, (tx) =>
        startUpload(tx, app.storage, { type: 'tenant', id: null, orgId }, { type: 'request', id: draftId }, 'issue_photo', req.body),
      );
      return reply.status(201).send({ ...r, draftId });
    },
  );

  app.post(
    '/orgs/:slug/uploads/:id/complete',
    { config: perIp(30, '10 minutes'), schema: { params: slugParams.extend({ id: z.uuid() }), body: z.object({ draftId: z.uuid() }) } },
    async (req) => {
      const orgId = await orgBySlug(app.db, req.params.slug);
      return withOrg(app.db, orgId, async (tx) => {
        const a = await completeUpload(tx, app.storage, req.params.id, { type: 'request', id: req.body.draftId });
        return { id: a.id };
      });
    },
  );

  app.post(
    '/orgs/:slug/requests',
    {
      config: perIp(5, '10 minutes'),
      schema: {
        params: slugParams,
        body: requestFields.extend({
          draftId: z.uuid().optional(),
          contact: z.object({ name: shortText, email: email.nullish(), phone: phone.nullish() }).refine((c) => c.email || c.phone, 'Email or phone is required'),
          propertyId: z.uuid().optional(),
          unitId: z.uuid().optional(),
          smsConsent: z.boolean().default(false),
        }),
      },
    },
    async (req, reply) => {
      const { draftId, contact, propertyId, unitId, smsConsent, ...fields } = req.body;
      const orgId = await orgBySlug(app.db, req.params.slug);
      const result = await withOrg(app.db, orgId, async (tx) => {
        if (draftId) {
          // A draft id may only be used once, and only by the org that issued its uploads.
          const [taken] = await tx.execute<{ exists: boolean }>(sql`select exists(select 1 from maintenance_requests where id = ${draftId}) as exists`);
          if (taken?.exists) throw badRequest('This draft was already submitted');
        }
        let tenant = await matchTenant(tx, contact, unitId);
        let resolvedUnit = tenant?.unitId ?? null;
        if (!tenant) {
          // Unverified submitter: must come through a property link and pick one of its units.
          if (!propertyId || !unitId) throw badRequest('We couldn’t find your tenancy. Use the request link for your property.', { code: 'tenant_not_matched' });
          const [u] = await tx.select({ id: units.id }).from(units).where(and(eq(units.id, unitId), eq(units.propertyId, propertyId)));
          if (!u) throw badRequest('Unknown unit');
          resolvedUnit = u.id;
        } else if (smsConsent && !tenant.smsConsentAt && tenant.phone && contact.phone === tenant.phone) {
          // Consent only counts for the number the submitter typed, never one matched through their email.
          const [updated] = await tx.update(tenants).set({ smsConsentAt: new Date() }).where(eq(tenants.id, tenant.id)).returning();
          tenant = updated ?? tenant;
        }
        const c = await makeCtx(tx, { type: 'tenant', id: tenant?.id ?? null, orgId });
        return createRequest(c, {
          ...(draftId ? { id: draftId } : {}),
          unitId: resolvedUnit!,
          tenant: tenant ?? null,
          submitter: { name: contact.name, email: contact.email ?? null, phone: contact.phone ?? null },
          source: 'tenant_link',
          fields,
        });
      });
      return reply.status(201).send({
        ref: result.request.ref,
        isEmergency: result.request.isEmergency,
        trackUrl: linkUrl(app.config.APP_URL, result.trackToken),
      });
    },
  );

  // "My requests" link (PRD §4.3). Always 202 so it can't be used to discover tenants.
  app.post(
    '/orgs/:slug/my-requests',
    { config: perIp(5, '10 minutes'), schema: { params: slugParams, body: z.object({ email: email.optional(), phone: phone.optional() }) } },
    async (req, reply) => {
      const orgId = await orgBySlug(app.db, req.params.slug);
      await withOrg(app.db, orgId, async (tx) => {
        const tenant = await matchTenant(tx, req.body);
        const party = tenantParty(tenant);
        if (!tenant || !party) return;
        const [org] = await tx.select({ name: organizations.name, sms: organizations.smsRegistrationStatus }).from(organizations).where(eq(organizations.id, orgId));
        await notify(
          tx,
          {
            orgId,
            to: party,
            template: 'tenant.my_requests',
            vars: { orgName: org!.name },
            subject: { type: 'request', id: tenant.id },
            link: { purpose: 'my_requests', scopeId: tenant.id, ttlHours: 24 },
            sms: true,
          },
          org!.sms === 'approved',
        );
      });
      return reply.status(202).send();
    },
  );

  // Self-help "Fixed it" (PRD §5.2): counted for the deflection KPI, no request created.
  app.post(
    '/orgs/:slug/deflections',
    { config: perIp(20, '10 minutes'), schema: { params: slugParams, body: z.object({ categoryId: z.uuid().optional(), selfHelpKey: z.string().regex(/^[a-z_]{2,40}$/) }) } },
    async (req, reply) => {
      const orgId = await orgBySlug(app.db, req.params.slug);
      await withOrg(app.db, orgId, async (tx) => {
        const categoryId = req.body.categoryId ?? null;
        if (categoryId && !(await tx.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId))).length) throw badRequest('Unknown category');
        await tx.insert(deflections).values({ orgId, categoryId, selfHelpKey: req.body.selfHelpKey });
      });
      return reply.status(204).send();
    },
  );

};
