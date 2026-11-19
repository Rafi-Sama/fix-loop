import { and, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import {
  appointments,
  approvals,
  expenses,
  invoices,
  maintenanceRequests,
  vendors,
  workOrders,
} from '../../db/schema/index.js';
import { badRequest, conflict, forbidden } from '../../lib/errors.js';
import { nextRef } from '../../shared/counters.js';
import { canReach } from '../../shared/outbox.js';
import { replaceReminders } from '../../shared/reminders.js';
import { recordEvent } from '../../shared/timeline.js';
import { confirmedAttachments } from '../files/files.service.js';
import { revokeLinks } from '../links/links.service.js';
import { complianceOf } from '../vendors/compliance.js';
import { approvalThreshold, baseVars, formatWindow, loadWorkOrder, syncRequestStatus, type Ctx, type LoadedWo } from './context.js';
import { expectedCompletion, planWorkOrderReminders } from './policy.js';
import { OPEN_STATUSES } from './state-machine.js';
import { DAY_H, type createInput, type patchInput, type scheduleInput, type completeInput, type closeInput, JOB_LINK, move, endEngagement, vendorStep, pmOnly, vendorParty, tenantParty, ownerParty, toParty, toManagers, currentAppointmentStart } from './core.js';

export { createInput, patchInput, quoteInput, scheduleInput, completeInput, closeInput } from './core.js';
export * from './quotes.service.js';

// ---------------------------------------------------------------- commands

export async function createWorkOrder(c: Ctx, input: z.infer<typeof createInput>) {
  pmOnly(c);
  const [req] = await c.tx.select().from(maintenanceRequests).where(eq(maintenanceRequests.id, input.requestId)).for('update');
  if (!req) throw badRequest('Request not found');
  if (req.status === 'closed' || req.status === 'cancelled') throw conflict('Request is closed');
  const priority = input.priority ?? req.priority;
  const ref = await nextRef(c.tx, c.org.id, 'WO', c.now);
  const [wo] = await c.tx
    .insert(workOrders)
    .values({
      orgId: c.org.id,
      ref,
      requestId: req.id,
      unitId: req.unitId,
      description: input.description ?? req.title,
      requiredWork: input.requiredWork ?? null,
      priority,
      expectedCompletionAt: input.expectedCompletionAt ?? expectedCompletion(priority, c.org.slaConfig, c.now),
      estimatedCostCents: input.estimatedCostCents ?? null,
      quoteRequired: input.quoteRequired ?? false,
      billTo: input.billTo,
    })
    .returning();
  await recordEvent(c.tx, { subjectType: 'work_order', subjectId: wo!.id, type: 'wo.created', actor: c.actor, payload: { ref } });
  await recordEvent(c.tx, { subjectType: 'request', subjectId: req.id, type: 'request.converted', actor: c.actor, payload: { workOrderId: wo!.id, ref } });
  return wo!;
}

export async function updateWorkOrder(c: Ctx, id: string, patch: z.infer<typeof patchInput>) {
  pmOnly(c);
  const w = await loadWorkOrder(c.tx, id, { lock: true });
  if (w.wo.status === 'closed' || w.wo.status === 'cancelled') throw conflict('Work order is closed');
  const [wo] = await c.tx.update(workOrders).set(patch).where(eq(workOrders.id, id)).returning();
  await recordEvent(c.tx, { subjectType: 'work_order', subjectId: id, type: 'wo.updated', actor: c.actor, visibility: 'internal', payload: { fields: Object.keys(patch) } });
  // The clocks depend on priority and due date: replan the current state's reminders.
  if ('priority' in patch || 'expectedCompletionAt' in patch) {
    await replaceReminders(
      c.tx,
      c.org.id,
      { type: 'work_order', id },
      planWorkOrderReminders({
        status: wo!.status,
        priority: wo!.priority,
        now: c.now,
        cfg: c.org.reminderConfig,
        expectedCompletionAt: wo!.expectedCompletionAt,
        appointmentStartsAt: await currentAppointmentStart(c, id),
      }),
      c.now,
    );
  }
  return wo!;
}

export async function assignVendor(c: Ctx, id: string, input: { vendorId: string; overrideReason?: string | null }) {
  pmOnly(c);
  const w = await loadWorkOrder(c.tx, id, { lock: true });
  const [vendor] = await c.tx.select().from(vendors).where(eq(vendors.id, input.vendorId));
  if (!vendor) throw badRequest('Vendor not found');
  if (!vendor.active) throw conflict('Vendor is deactivated');
  const compliance = await complianceOf(c.tx, vendor.id, c.now);
  // Compliance gate at dispatch (PRD §6.2): a typed reason is required to override.
  if ((compliance === 'expired' || compliance === 'missing') && !input.overrideReason?.trim()) {
    throw conflict(`Vendor insurance is ${compliance}`, { code: 'compliance_override_required', compliance });
  }
  w.vendor = vendor;
  w.wo.vendorId = vendor.id;
  await move(c, w, { type: 'assign' }, {
    event: 'wo.assigned',
    set: { vendorId: vendor.id, assignedAt: c.now, acceptedAt: null },
    payload: { vendorId: vendor.id, compliance, ...(input.overrideReason ? { complianceOverride: input.overrideReason } : {}) },
  });
  await syncRequestStatus(c.tx, w.request.id, c.now);
  await toParty(c, w, vendorParty(w), { template: 'wo.assigned.vendor', vars: baseVars(c, w), link: JOB_LINK, sms: true });
  return loadWorkOrder(c.tx, id);
}

/**
 * PM pulls the job back, or the vendor declines/withdraws (any time before work starts).
 * The vendor loses access, and their appointment, pending quote and authorised amount go with them.
 */
async function release(c: Ctx, w: LoadedWo, action: 'unassign' | 'decline', reason: string | null) {
  const vendorId = w.wo.vendorId;
  if (!vendorId) throw conflict('No vendor is assigned');
  const vars = baseVars(c, w);
  const vendor = vendorParty(w);
  await move(c, w, { type: action }, {
    event: action === 'decline' ? 'wo.declined' : 'wo.unassigned',
    set: { vendorId: null, assignedAt: null, acceptedAt: null, approvedAmountCents: null },
    payload: { vendorId, reason },
  });
  await endEngagement(c, w.wo.id);
  await revokeLinks(c.tx, c.org.id, w.wo.id, { subjectId: vendorId });
  await revokeLinks(c.tx, c.org.id, w.wo.id, { purposes: ['approval'] });
  // A PM-initiated release tells the vendor the job is off (a decline came from them).
  if (action === 'unassign' && vendor) await toParty(c, w, vendor, { template: 'wo.cancelled.vendor', vars, sms: true });
  await syncRequestStatus(c.tx, w.request.id, c.now);
  if (action === 'decline') await toManagers(c, w, { template: 'wo.declined.pm', vars: { ...vars, reason }, sms: w.wo.priority === 'emergency' });
}

/** The vendor lost the message: send a fresh job link (old ones stay valid until they expire). */
export async function resendJobLink(c: Ctx, id: string) {
  pmOnly(c);
  const w = await loadWorkOrder(c.tx, id);
  const vendor = vendorParty(w);
  if (!vendor || !OPEN_STATUSES.includes(w.wo.status) || w.wo.status === 'draft') throw conflict('There is no assigned vendor to send a link to');
  if (!canReach(vendor, c.smsEnabled)) throw conflict('This vendor has no email on file, so there is nowhere to send the link');
  await recordEvent(c.tx, { subjectType: 'work_order', subjectId: id, type: 'wo.link_resent', actor: c.actor, visibility: 'internal', payload: { vendorId: vendor.id } });
  await toParty(c, w, vendor, { template: 'wo.assigned.vendor', vars: baseVars(c, w), link: JOB_LINK, sms: true });
}

export async function unassignVendor(c: Ctx, id: string) {
  pmOnly(c);
  const w = await loadWorkOrder(c.tx, id, { lock: true });
  await release(c, w, 'unassign', null);
}

export async function declineJob(c: Ctx, id: string, reason: string) {
  const w = await loadWorkOrder(c.tx, id, { lock: true });
  vendorStep(c, w);
  await release(c, w, 'decline', reason);
}

export async function acceptJob(c: Ctx, id: string) {
  const w = await loadWorkOrder(c.tx, id, { lock: true });
  const { onBehalfOf } = vendorStep(c, w);
  await move(c, w, { type: 'accept' }, { event: 'wo.accepted', set: { acceptedAt: c.now }, onBehalfOf });
  const vars = baseVars(c, w);
  await toManagers(c, w, { template: 'wo.accepted.pm', vars });
  await toParty(c, w, tenantParty(w), { template: 'wo.accepted.tenant', vars, sms: true });
}

export async function scheduleAppointment(c: Ctx, id: string, input: z.infer<typeof scheduleInput>) {
  const w = await loadWorkOrder(c.tx, id, { lock: true });
  const { onBehalfOf } = vendorStep(c, w);
  if (input.startsAt.getTime() < c.now.getTime() - 3_600_000) throw badRequest('Appointment is in the past');
  if (input.startsAt.getTime() > c.now.getTime() + 180 * DAY_H * 3_600_000) throw badRequest('Appointment is more than 6 months away');
  await c.tx.update(appointments).set({ status: 'cancelled' }).where(and(eq(appointments.workOrderId, id), inArray(appointments.status, ['scheduled', 'tenant_conflict'])));
  const [appt] = await c.tx.insert(appointments).values({ orgId: c.org.id, workOrderId: id, startsAt: input.startsAt, endsAt: input.endsAt, note: input.note ?? null }).returning();
  const rescheduled = w.wo.status === 'scheduled';
  await move(c, w, { type: 'schedule' }, {
    event: rescheduled ? 'wo.rescheduled' : 'wo.scheduled',
    payload: { appointmentId: appt!.id, startsAt: input.startsAt.toISOString(), endsAt: input.endsAt.toISOString() },
    appointmentStartsAt: input.startsAt,
    onBehalfOf,
  });
  const vars = { ...baseVars(c, w), window: formatWindow(input.startsAt, input.endsAt, c.org.timezone) };
  await toParty(c, w, tenantParty(w), { template: 'wo.scheduled.tenant', vars, link: { purpose: 'request_track', scopeId: w.request.id, ttlHours: 30 * DAY_H }, sms: true });
  await toManagers(c, w, { template: 'wo.scheduled.party', vars });
  if (c.actor.type !== 'vendor') await toParty(c, w, vendorParty(w), { template: 'wo.scheduled.party', vars, link: JOB_LINK, sms: true });
  return appt!;
}

/** Tenant says the time doesn't work. The job stays scheduled; the vendor re-schedules (PRD workflow step 8). */
export async function tenantConflict(c: Ctx, id: string, note: string | null) {
  if (c.actor.type !== 'tenant') throw forbidden();
  const w = await loadWorkOrder(c.tx, id, { lock: true });
  if (w.wo.status !== 'scheduled') throw conflict('There is no upcoming appointment');
  const [appt] = await c.tx
    .update(appointments)
    .set({ status: 'tenant_conflict', note })
    .where(and(eq(appointments.workOrderId, id), eq(appointments.status, 'scheduled')))
    .returning();
  if (!appt) throw conflict('There is no upcoming appointment');
  await recordEvent(c.tx, { subjectType: 'work_order', subjectId: id, type: 'wo.tenant_conflict', actor: c.actor, payload: { appointmentId: appt.id, note } });
  const vars = { ...baseVars(c, w), window: formatWindow(appt.startsAt, appt.endsAt, c.org.timezone), note: note ?? '' };
  await toParty(c, w, vendorParty(w), { template: 'wo.tenant_conflict', vars, link: JOB_LINK, sms: true });
  await toManagers(c, w, { template: 'wo.tenant_conflict', vars });
}

export async function reportNoAccess(c: Ctx, id: string, reason: 'tenant_no_show' | 'no_permission' | 'vendor_cancelled', note: string | null) {
  const w = await loadWorkOrder(c.tx, id, { lock: true });
  const { onBehalfOf } = vendorStep(c, w);
  await c.tx.update(appointments).set({ status: 'no_access', noAccessReason: reason, note }).where(and(eq(appointments.workOrderId, id), inArray(appointments.status, ['scheduled', 'tenant_conflict'])));
  await move(c, w, { type: 'no_access' }, { event: 'wo.no_access', payload: { reason, note }, onBehalfOf });
  await toManagers(c, w, { template: 'wo.no_access.pm', vars: { ...baseVars(c, w), reason: reason.replaceAll('_', ' ') } });
}

export async function startJob(c: Ctx, id: string) {
  const w = await loadWorkOrder(c.tx, id, { lock: true });
  const { onBehalfOf } = vendorStep(c, w);
  const fastTrack = w.wo.status !== 'scheduled';
  // Emergency fast path (PRD §6.5): spend is pre-authorised up to the firm's emergency limit.
  const set = fastTrack && w.wo.approvedAmountCents === null ? { approvedAmountCents: c.org.emergencySpendLimitCents, acceptedAt: w.wo.acceptedAt ?? c.now } : {};
  await move(c, w, { type: 'start' }, { event: 'wo.started', set, payload: fastTrack ? { emergencyFastPath: true } : {}, onBehalfOf });
  if (fastTrack && w.owner.notifyMode === 'direct') await toParty(c, w, ownerParty(w), { template: 'wo.emergency_notice.owner', vars: baseVars(c, w) });
}

export async function completeJob(c: Ctx, id: string, input: z.infer<typeof completeInput>) {
  const w = await loadWorkOrder(c.tx, id, { lock: true });
  const { onBehalfOf } = vendorStep(c, w);
  const subject = { type: 'work_order' as const, id };
  await confirmedAttachments(c.tx, subject, input.photoAttachmentIds, ['completion_photo']);
  let fileKey: string | null = null;
  if (input.invoiceAttachmentId) fileKey = (await confirmedAttachments(c.tx, subject, [input.invoiceAttachmentId], ['invoice', 'document']))[0]!.fileKey;
  await c.tx.update(invoices).set({ status: 'rejected' }).where(and(eq(invoices.workOrderId, id), eq(invoices.status, 'submitted')));
  const [inv] = await c.tx
    .insert(invoices)
    .values({ orgId: c.org.id, workOrderId: id, vendorId: w.wo.vendorId, amountCents: input.invoiceAmountCents, invoiceNumber: input.invoiceNumber ?? null, fileKey })
    .returning();
  await c.tx.update(appointments).set({ status: 'done' }).where(and(eq(appointments.workOrderId, id), eq(appointments.status, 'scheduled')));
  await move(c, w, { type: 'complete' }, {
    event: 'wo.completed',
    set: { completedAt: c.now, completionNotes: input.notes ?? null },
    payload: { invoiceId: inv!.id, amountCents: input.invoiceAmountCents, photos: input.photoAttachmentIds.length },
    onBehalfOf,
  });
  await toManagers(c, w, { template: 'wo.completed.pm', vars: { ...baseVars(c, w), amount: input.invoiceAmountCents } });
  return inv!;
}

export async function requestMoreWork(c: Ctx, id: string, note: string) {
  pmOnly(c);
  const w = await loadWorkOrder(c.tx, id, { lock: true });
  await c.tx.update(invoices).set({ status: 'rejected' }).where(and(eq(invoices.workOrderId, id), eq(invoices.status, 'submitted')));
  await move(c, w, { type: 'request_more_work' }, { event: 'wo.more_work_requested', set: { completedAt: null }, payload: { note } });
  await toParty(c, w, vendorParty(w), { template: 'wo.more_work.vendor', vars: { ...baseVars(c, w), note }, link: JOB_LINK, sms: true });
}

/** Close (workflow step 12) with the invoice-overage guard from the review. */
export async function closeWorkOrder(c: Ctx, id: string, input: z.infer<typeof closeInput>) {
  pmOnly(c);
  const w = await loadWorkOrder(c.tx, id, { lock: true });
  const [inv] = await c.tx.select().from(invoices).where(and(eq(invoices.workOrderId, id), eq(invoices.status, 'submitted'))).for('update');
  if (!inv) throw conflict('No invoice has been submitted');

  const threshold = approvalThreshold(c, w);
  const ownerApproved = w.wo.approvedAmountCents !== null;
  const authorised = w.wo.approvedAmountCents ?? w.wo.estimatedCostCents;
  if (authorised !== null && inv.amountCents > authorised * (1 + c.org.invoiceOveragePct / 100) && !input.confirmOverage) {
    throw conflict('Invoice is above the authorised amount', { code: 'overage_confirmation_required', authorisedCents: authorised, invoiceCents: inv.amountCents });
  }
  // Spend above the owner's threshold always needs their OK: either an approved amount that covers it,
  // or the PM attesting they approved it offline. This also catches jobs that never had a quote.
  const coveredByApproval = ownerApproved && inv.amountCents <= w.wo.approvedAmountCents! * (1 + c.org.invoiceOveragePct / 100);
  if (inv.amountCents > threshold && !coveredByApproval && !input.ownerApprovedOffline) {
    throw conflict('The invoice is above the owner approval threshold', { code: 'owner_approval_required', thresholdCents: threshold });
  }
  if (input.ownerApprovedOffline) {
    await c.tx.insert(approvals).values({ orgId: c.org.id, workOrderId: id, approverType: 'owner', approverId: w.owner.id, decision: 'approved', note: input.note ?? 'Invoice overage approved', amountCents: inv.amountCents, channel: 'phone' });
  }

  await c.tx.update(invoices).set({ status: 'approved', approvedAt: c.now }).where(eq(invoices.id, inv.id));
  await c.tx.insert(expenses).values({
    orgId: c.org.id,
    workOrderId: id,
    propertyId: w.property.id,
    unitId: w.unit.id,
    vendorId: w.wo.vendorId,
    categoryId: w.request.categoryId,
    amountCents: inv.amountCents,
    billTo: w.wo.billTo,
    incurredOn: c.now,
  });
  await move(c, w, { type: 'close' }, { event: 'wo.closed', set: { closedAt: c.now }, payload: { invoiceId: inv.id, amountCents: inv.amountCents, overageConfirmed: input.confirmOverage } });
  // The job is over: the vendor no longer needs the tenant's contact and access details.
  await revokeLinks(c.tx, c.org.id, id, { purposes: ['job', 'approval'] });
  await syncRequestStatus(c.tx, w.request.id, c.now);

  const vars = { ...baseVars(c, w), amount: inv.amountCents };
  // Ask the tenant "was it fixed?" only once the whole request is resolved (no other open jobs).
  const [req] = await c.tx.select({ status: maintenanceRequests.status }).from(maintenanceRequests).where(eq(maintenanceRequests.id, w.request.id));
  if (req?.status === 'resolved') {
    await toParty(c, w, tenantParty(w), { template: 'wo.closed.tenant', vars, link: { purpose: 'confirm_fix', scopeId: w.request.id, ttlHours: 14 * DAY_H }, sms: true });
  }
  if (w.owner.sendCompletionSummary && w.owner.notifyMode === 'direct') await toParty(c, w, ownerParty(w), { template: 'wo.closed.owner_summary', vars });
}

export async function cancelWorkOrder(c: Ctx, id: string, reason: string) {
  pmOnly(c);
  const w = await loadWorkOrder(c.tx, id, { lock: true });
  const vendor = vendorParty(w);
  const vars = baseVars(c, w);
  await move(c, w, { type: 'cancel' }, { event: 'wo.cancelled', set: { cancelReason: reason }, payload: { reason } });
  await endEngagement(c, id);
  await revokeLinks(c.tx, c.org.id, id);
  await syncRequestStatus(c.tx, w.request.id, c.now);
  if (vendor) await toParty(c, w, vendor, { template: 'wo.cancelled.vendor', vars, sms: true });
}

