import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { categories, comments, maintenanceRequests, properties, tenants, units, workOrders } from '../../db/schema/index.js';
import { assertFound, badRequest, conflict, forbidden } from '../../lib/errors.js';
import { longText, optionalText, shortText } from '../../lib/validation.js';
import { nextRef } from '../../shared/counters.js';
import { notify, notifyManagers, type Party } from '../../shared/outbox.js';
import { replaceReminders } from '../../shared/reminders.js';
import { recordEvent } from '../../shared/timeline.js';
import { confirmedAttachments } from '../files/files.service.js';
import { mintLink } from '../links/links.service.js';
import type { Ctx } from '../work-orders/context.js';
import { needsInfoNudgeHours } from '../work-orders/policy.js';
import { OPEN_STATUSES } from '../work-orders/state-machine.js';

const PRIORITY = z.enum(['emergency', 'high', 'normal', 'low']);
const DAY_H = 24;

export const requestFields = z.object({
  categoryId: z.uuid(),
  title: shortText,
  description: longText,
  urgency: PRIORITY.default('normal'),
  availabilityText: optionalText(1000),
  permissionToEnter: z.enum(['yes', 'no', 'only_if_home']),
  accessNotes: optionalText(1000),
  pets: optionalText(500),
  photoIds: z.array(z.uuid()).max(15).default([]),
  // Tenant ticked "I understand" on the emergency banner.
  emergencyAck: z.boolean().default(false),
});

export const triagePatch = z
  .object({ categoryId: z.uuid(), title: shortText, description: longText, priority: PRIORITY, accessNotes: optionalText(1000), availabilityText: optionalText(1000) })
  .partial()
  .strict();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whole-word, case-insensitive keyword match ("fire" doesn't match "fireplace"). */
export function detectEmergency(text: string, keywords: readonly string[]): string[] {
  const t = text.toLowerCase();
  return keywords.filter((k) => new RegExp(`(^|[^a-z])${escapeRe(k.toLowerCase())}($|[^a-z])`).test(t));
}

interface CreateArgs {
  id?: string;
  unitId: string;
  tenant: (typeof tenants.$inferSelect) | null;
  submitter?: { name: string; email: string | null; phone: string | null };
  source: 'tenant_link' | 'pm_entered';
  fields: z.infer<typeof requestFields>;
}

/** Creates a request, notifies the PM (SMS too for emergencies) and returns a tracking token for the submitter. */
export async function createRequest(c: Ctx, a: CreateArgs) {
  const { fields } = a;
  const [cat] = await c.tx.select().from(categories).where(and(eq(categories.id, fields.categoryId), eq(categories.active, true)));
  if (!cat) throw badRequest('Unknown category');
  const [unit] = await c.tx
    .select({ id: units.id, label: units.label, addressLine: properties.addressLine, city: properties.city, emergencyPhone: properties.emergencyPhone, archived: sql<boolean>`${properties.archivedAt} is not null or ${units.archivedAt} is not null` })
    .from(units)
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(eq(units.id, a.unitId));
  if (!unit || unit.archived) throw badRequest('Unknown unit');

  const matched = detectEmergency(`${fields.title} ${fields.description}`, c.org.emergencyKeywords);
  const isEmergency = fields.urgency === 'emergency' || matched.length > 0;
  if (isEmergency && a.source === 'tenant_link' && !fields.emergencyAck) {
    // The client must show the emergency banner (911 / gas utility / emergency number) first.
    throw conflict('Please read the emergency instructions', { code: 'emergency_ack_required', keywords: matched, emergencyPhone: unit.emergencyPhone ?? c.org.emergencyPhone });
  }
  const id = a.id ?? crypto.randomUUID();
  if (cat.photoRequired && a.source === 'tenant_link' && fields.photoIds.length === 0 && !isEmergency) {
    throw badRequest('Please add at least one photo', { code: 'photo_required' });
  }
  await confirmedAttachments(c.tx, { type: 'request', id }, fields.photoIds, ['issue_photo']);

  const ref = await nextRef(c.tx, c.org.id, 'MR', c.now);
  const [req] = await c.tx
    .insert(maintenanceRequests)
    .values({
      id,
      orgId: c.org.id,
      ref,
      unitId: unit.id,
      tenantId: a.tenant?.id ?? null,
      categoryId: cat.id,
      title: fields.title,
      description: fields.description,
      tenantUrgency: a.source === 'tenant_link' ? fields.urgency : null,
      // The PM confirms the final priority in triage; an emergency is never downgraded automatically.
      priority: isEmergency ? 'emergency' : fields.urgency,
      source: a.source,
      isEmergency,
      emergencyAckAt: isEmergency && fields.emergencyAck ? c.now : null,
      availabilityText: fields.availabilityText ?? null,
      permissionToEnter: fields.permissionToEnter,
      accessNotes: fields.accessNotes ?? null,
      pets: fields.pets ?? null,
      submitterName: a.submitter?.name ?? null,
      submitterEmail: a.submitter?.email ?? null,
      submitterPhone: a.submitter?.phone ?? null,
    })
    .returning();
  await recordEvent(c.tx, {
    subjectType: 'request',
    subjectId: id,
    type: 'request.created',
    actor: c.actor,
    payload: { ref, source: a.source, isEmergency, keywords: matched, verifiedTenant: Boolean(a.tenant) },
  });

  const address = `${unit.addressLine}${unit.label === 'Main' ? '' : ` #${unit.label}`}, ${unit.city}`;
  const vars = { orgName: c.org.name, ref, title: fields.title, address, priority: req!.priority, tenantPhone: a.tenant?.phone ?? a.submitter?.phone ?? '', emergencyPhone: unit.emergencyPhone ?? c.org.emergencyPhone };
  await notifyManagers(c.tx, c.org.id, c.smsEnabled, {
    template: isEmergency ? 'request.emergency.pm' : 'request.submitted.pm',
    vars,
    subject: { type: 'request', id },
    sms: isEmergency,
  });

  // The submitter's tracking link. Returned directly (they just submitted it) and also sent to a matched tenant.
  const party = tenantParty(a.tenant);
  const trackToken = await mintLink(c.tx, c.org.id, {
    purpose: 'request_track',
    subjectType: 'tenant',
    subjectId: a.tenant?.id ?? id,
    scopeId: id,
    ttlHours: 90 * DAY_H,
  });
  if (party) {
    await notify(c.tx, { orgId: c.org.id, to: party, template: 'request.submitted.tenant', vars, subject: { type: 'request', id }, link: { purpose: 'request_track', scopeId: id, ttlHours: 90 * DAY_H }, sms: true }, c.smsEnabled);
  }
  return { request: req!, trackToken };
}

export const tenantParty = (t: (typeof tenants.$inferSelect) | null | undefined): Party | null =>
  t ? { type: 'tenant', id: t.id, email: t.email, phone: t.phone, smsConsentAt: t.smsConsentAt } : null;

async function loadRequest(c: Ctx, id: string) {
  const [r] = await c.tx
    .select({ request: maintenanceRequests, tenant: tenants })
    .from(maintenanceRequests)
    .leftJoin(tenants, eq(tenants.id, maintenanceRequests.tenantId))
    .where(eq(maintenanceRequests.id, id))
    .for('update', { of: maintenanceRequests });
  assertFound(r, 'Request');
  return r;
}

export async function triage(c: Ctx, id: string, patch: z.infer<typeof triagePatch>) {
  const { request } = await loadRequest(c, id);
  if (request.status === 'closed' || request.status === 'cancelled') throw conflict('Request is closed');
  if (patch.categoryId) {
    const [cat] = await c.tx.select({ id: categories.id }).from(categories).where(eq(categories.id, patch.categoryId));
    if (!cat) throw badRequest('Unknown category');
  }
  const [r] = await c.tx.update(maintenanceRequests).set(patch).where(eq(maintenanceRequests.id, id)).returning();
  const changes = Object.fromEntries(
    Object.keys(patch).map((k) => [k, { from: request[k as keyof typeof request], to: patch[k as keyof typeof patch] }]),
  );
  await recordEvent(c.tx, { subjectType: 'request', subjectId: id, type: 'request.updated', actor: c.actor, visibility: 'internal', payload: { changes } });
  return r!;
}

export async function addComment(c: Ctx, subject: { type: 'request' | 'work_order'; id: string }, body: string, visibility: 'internal' | 'shared') {
  const table = subject.type === 'request' ? maintenanceRequests : workOrders;
  const [row] = await c.tx.select({ id: table.id }).from(table).where(eq(table.id, subject.id));
  assertFound(row, subject.type === 'request' ? 'Request' : 'Work order');
  const [cm] = await c.tx
    .insert(comments)
    .values({ orgId: c.org.id, subjectType: subject.type, subjectId: subject.id, body, visibility, authorType: c.actor.type, authorId: c.actor.type === 'system' ? null : c.actor.id })
    .returning();
  return cm!;
}

export async function askForInfo(c: Ctx, id: string, question: string) {
  const { request, tenant } = await loadRequest(c, id);
  if (!['new', 'needs_info'].includes(request.status)) throw conflict('Only new requests can be sent back for information');
  const party = tenantParty(tenant);
  if (!party) throw conflict('This request has no verified tenant to ask');
  await c.tx.update(maintenanceRequests).set({ status: 'needs_info', statusChangedAt: c.now, infoRequest: question }).where(eq(maintenanceRequests.id, id));
  await recordEvent(c.tx, { subjectType: 'request', subjectId: id, type: 'request.needs_info', actor: c.actor, payload: { question } });
  await notify(c.tx, { orgId: c.org.id, to: party, template: 'request.needs_info.tenant', vars: { orgName: c.org.name, ref: request.ref, title: request.title, question }, subject: { type: 'request', id }, link: { purpose: 'needs_info', scopeId: id, ttlHours: 14 * DAY_H }, sms: true }, c.smsEnabled);
  await replaceReminders(c.tx, c.org.id, { type: 'request', id }, [
    { type: 'request.needs_info_nudge', dueAt: new Date(c.now.getTime() + needsInfoNudgeHours(c.org.reminderConfig) * 3_600_000), expectedStatus: 'needs_info' },
  ], c.now);
}

export async function answerInfo(c: Ctx, id: string, answer: string, photoIds: string[]) {
  if (c.actor.type !== 'tenant') throw forbidden();
  const { request } = await loadRequest(c, id);
  if (request.status !== 'needs_info') throw conflict('No information was requested');
  await confirmedAttachments(c.tx, { type: 'request', id }, photoIds, ['issue_photo']);
  await addComment(c, { type: 'request', id }, answer, 'shared');
  await c.tx.update(maintenanceRequests).set({ status: 'new', statusChangedAt: c.now }).where(eq(maintenanceRequests.id, id));
  await recordEvent(c.tx, { subjectType: 'request', subjectId: id, type: 'request.info_received', actor: c.actor, payload: { photos: photoIds.length } });
  await replaceReminders(c.tx, c.org.id, { type: 'request', id }, [], c.now);
  await notifyManagers(c.tx, c.org.id, c.smsEnabled, { template: 'request.info_received.pm', vars: { orgName: c.org.name, ref: request.ref, answer: answer.slice(0, 300) }, subject: { type: 'request', id } });
}

/** close = no work needed; cancel = withdrawn. Both need a reason and no open work orders. */
export async function endRequest(c: Ctx, id: string, outcome: 'closed' | 'cancelled', reason: string) {
  const { request } = await loadRequest(c, id);
  if (['resolved', 'closed', 'cancelled'].includes(request.status)) throw conflict(`Request is already ${request.status}`);
  const [open] = await c.tx
    .select({ id: workOrders.id })
    .from(workOrders)
    .where(and(eq(workOrders.requestId, id), inArray(workOrders.status, [...OPEN_STATUSES])))
    .limit(1);
  if (open) throw conflict('Cancel or close its open work orders first');
  await c.tx.update(maintenanceRequests).set({ status: outcome, statusChangedAt: c.now, closeReason: reason }).where(eq(maintenanceRequests.id, id));
  await replaceReminders(c.tx, c.org.id, { type: 'request', id }, [], c.now);
  await recordEvent(c.tx, { subjectType: 'request', subjectId: id, type: `request.${outcome}`, actor: c.actor, payload: { reason } });
}

export async function confirmFix(c: Ctx, id: string, input: { fixed: boolean; rating?: number | undefined; note?: string | null }) {
  if (c.actor.type !== 'tenant') throw forbidden();
  const { request } = await loadRequest(c, id);
  if (request.status !== 'resolved' || request.tenantConfirmed !== null) throw conflict('This request is not awaiting confirmation');
  await c.tx
    .update(maintenanceRequests)
    .set({
      tenantConfirmed: input.fixed ? 'fixed' : 'not_fixed',
      tenantRating: input.rating ?? null,
      // "Not fixed" reopens the request for the PM (PRD workflow step 12).
      ...(input.fixed ? {} : { status: 'new' as const, statusChangedAt: c.now }),
    })
    .where(eq(maintenanceRequests.id, id));
  if (input.note) await addComment(c, { type: 'request', id }, input.note, 'shared');
  await recordEvent(c.tx, { subjectType: 'request', subjectId: id, type: input.fixed ? 'request.confirmed_fixed' : 'request.reopened', actor: c.actor, payload: { rating: input.rating ?? null } });
  if (!input.fixed) {
    await notifyManagers(c.tx, c.org.id, c.smsEnabled, { template: 'request.not_fixed.pm', vars: { orgName: c.org.name, ref: request.ref }, subject: { type: 'request', id } });
  }
}
