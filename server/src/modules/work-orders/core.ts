import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  appointments,
  invoices,
  quotes,
  workOrders,
} from '../../db/schema/index.js';
import { conflict, forbidden } from '../../lib/errors.js';
import { cents, longText, optionalText } from '../../lib/validation.js';
import { notify, notifyManagers, type NotifyInput, type Party } from '../../shared/outbox.js';
import { replaceReminders } from '../../shared/reminders.js';
import { recordEvent } from '../../shared/timeline.js';
import type { Ctx, LoadedWo } from './context.js';
import { planWorkOrderReminders } from './policy.js';
import { transition, type WoAction, type WoStatus } from './state-machine.js';

export const DAY_H = 24;
export const JOB_LINK = { purpose: 'job', ttlHours: 60 * DAY_H } as const;
// ---------------------------------------------------------------- input schemas

export const createInput = z.object({
  requestId: z.uuid(),
  description: longText.optional(),
  requiredWork: optionalText(5000),
  priority: z.enum(['emergency', 'high', 'normal', 'low']).optional(),
  expectedCompletionAt: z.coerce.date().optional(),
  estimatedCostCents: cents.nullish(),
  quoteRequired: z.boolean().optional(),
  billTo: z.enum(['owner', 'tenant', 'warranty']).default('owner'),
});

export const patchInput = z
  .object({
    description: longText,
    requiredWork: optionalText(5000),
    priority: z.enum(['emergency', 'high', 'normal', 'low']),
    expectedCompletionAt: z.coerce.date().nullable(),
    estimatedCostCents: cents.nullable(),
    quoteRequired: z.boolean(),
    billTo: z.enum(['owner', 'tenant', 'warranty']),
  })
  .partial()
  .strict();

export const quoteInput = z.object({ amountCents: cents, description: optionalText(5000), attachmentId: z.uuid().optional() });
export const scheduleInput = z
  .object({ startsAt: z.coerce.date(), endsAt: z.coerce.date(), note: optionalText(1000) })
  .refine((v) => v.endsAt > v.startsAt, 'End must be after start')
  .refine((v) => v.endsAt.getTime() - v.startsAt.getTime() <= 12 * 3_600_000, 'Window can be at most 12 hours');
export const completeInput = z.object({
  notes: optionalText(5000),
  invoiceAmountCents: cents,
  invoiceNumber: optionalText(100),
  invoiceAttachmentId: z.uuid().optional(),
  photoAttachmentIds: z.array(z.uuid()).min(1, 'At least one completion photo is required').max(30),
});
export const closeInput = z.object({
  confirmOverage: z.boolean().default(false),
  ownerApprovedOffline: z.boolean().default(false),
  note: optionalText(1000),
});

// ---------------------------------------------------------------- core transition

export interface MoveOpts {
  event: string;
  payload?: Record<string, unknown>;
  set?: Partial<typeof workOrders.$inferInsert>;
  appointmentStartsAt?: Date | null;
  /** PM acting for the vendor */
  onBehalfOf?: string | null;
}

/** Validate + apply a transition, write the timeline event and replan reminders. Caller holds the row lock. */
export async function move(c: Ctx, w: LoadedWo, action: WoAction, o: MoveOpts): Promise<WoStatus> {
  const r = transition(
    { status: w.wo.status, priority: w.wo.priority, quoteRequired: w.wo.quoteRequired, resumeStatus: w.wo.resumeStatus },
    action,
  );
  await c.tx
    .update(workOrders)
    .set({
      ...o.set,
      status: r.status,
      resumeStatus: r.resumeStatus,
      statusChangedAt: c.now,
      ...(r.status === 'awaiting_approval' ? {} : { approvalPendingWith: null }),
    })
    .where(eq(workOrders.id, w.wo.id));
  await recordEvent(c.tx, {
    subjectType: 'work_order',
    subjectId: w.wo.id,
    type: o.event,
    actor: c.actor,
    onBehalfOf: o.onBehalfOf ?? null,
    payload: { from: w.wo.status, to: r.status, ...o.payload },
  });
  const expectedCompletionAt = o.set?.expectedCompletionAt ?? w.wo.expectedCompletionAt;
  // Re-entering `scheduled` without a new appointment (e.g. an approval resuming the job) keeps the existing one's reminder.
  const appointmentStartsAt = o.appointmentStartsAt ?? (r.status === 'scheduled' ? await currentAppointmentStart(c, w.wo.id) : null);
  await replaceReminders(
    c.tx,
    c.org.id,
    { type: 'work_order', id: w.wo.id },
    planWorkOrderReminders({
      status: r.status,
      priority: w.wo.priority,
      now: c.now,
      cfg: c.org.reminderConfig,
      expectedCompletionAt: expectedCompletionAt ?? null,
      appointmentStartsAt,
    }),
    c.now,
  );
  w.wo.status = r.status;
  w.wo.resumeStatus = r.resumeStatus;
  return r.status;
}

export async function currentAppointmentStart(c: Ctx, workOrderId: string): Promise<Date | null> {
  const [a] = await c.tx
    .select({ startsAt: appointments.startsAt })
    .from(appointments)
    .where(and(eq(appointments.workOrderId, workOrderId), inArray(appointments.status, ['scheduled', 'tenant_conflict'])))
    .orderBy(desc(appointments.createdAt))
    .limit(1);
  return a?.startsAt ?? null;
}

/** Everything that belongs to the current vendor's engagement ends when the job is released or cancelled. */
export async function endEngagement(c: Ctx, workOrderId: string) {
  await c.tx.update(appointments).set({ status: 'cancelled' }).where(and(eq(appointments.workOrderId, workOrderId), inArray(appointments.status, ['scheduled', 'tenant_conflict'])));
  await c.tx.update(quotes).set({ status: 'superseded' }).where(and(eq(quotes.workOrderId, workOrderId), eq(quotes.status, 'pending')));
  await c.tx.update(invoices).set({ status: 'rejected' }).where(and(eq(invoices.workOrderId, workOrderId), eq(invoices.status, 'submitted')));
}

// ---------------------------------------------------------------- who may act

/** Vendor steps: the assigned vendor via their link, or any PM as a logged proxy update. */
export function vendorStep(c: Ctx, w: LoadedWo): { onBehalfOf: string | null } {
  if (c.actor.type === 'vendor') {
    if (c.actor.id !== w.wo.vendorId) throw forbidden('This job is no longer assigned to you');
    return { onBehalfOf: null };
  }
  if (c.actor.type === 'user') {
    if (!w.wo.vendorId) throw conflict('No vendor is assigned');
    return { onBehalfOf: w.wo.vendorId };
  }
  throw forbidden();
}

export function pmOnly(c: Ctx) {
  if (c.actor.type !== 'user') throw forbidden();
}

// ---------------------------------------------------------------- notification helpers

export const vendorParty = (w: LoadedWo): Party | null =>
  w.vendor ? { type: 'vendor', id: w.vendor.id, email: w.vendor.email, phone: w.vendor.phone, smsConsentAt: w.vendor.smsConsentAt } : null;
export const tenantParty = (w: LoadedWo): Party | null =>
  w.tenant
    ? { type: 'tenant', id: w.tenant.id, email: w.tenant.email, phone: w.tenant.phone, smsConsentAt: w.tenant.smsConsentAt }
    : null;
export const ownerParty = (w: LoadedWo): Party => ({ type: 'owner', id: w.owner.id, email: w.owner.email, phone: w.owner.phone });

export type LinkInput = Omit<NonNullable<NotifyInput['link']>, 'scopeId'> & { scopeId?: string };
export type Msg = Omit<NotifyInput, 'orgId' | 'to' | 'subject' | 'link'> & { link?: LinkInput };
/** Links default to this work order as their scope. */
export const toParty = (c: Ctx, w: LoadedWo, party: Party | null, { link, ...m }: Msg) =>
  party
    ? notify(
        c.tx,
        { ...m, ...(link ? { link: { ...link, scopeId: link.scopeId ?? w.wo.id } } : {}), orgId: c.org.id, to: party, subject: { type: 'work_order', id: w.wo.id } },
        c.smsEnabled,
      )
    : undefined;
export const toManagers = (c: Ctx, w: LoadedWo, m: Omit<Msg, 'link'>) =>
  notifyManagers(c.tx, c.org.id, c.smsEnabled, { ...m, subject: { type: 'work_order', id: w.wo.id } });
