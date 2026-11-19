import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { ts } from '../db/sql.js';
import type { Db, Tx } from '../db/client.js';
import { appointments, maintenanceRequests, organizations, reminders, tenants, vendorDocuments, vendors } from '../db/schema/index.js';
import { baseVars, formatWindow, loadWorkOrder, type Ctx } from '../modules/work-orders/context.js';
import { overdueRepeatHours } from '../modules/work-orders/policy.js';
import { notify, notifyManagers } from '../shared/outbox.js';

const BATCH = 100;
type Reminder = typeof reminders.$inferSelect;

/**
 * Fires due reminders. Each one runs in its own transaction that locks the reminder row,
 * re-checks it is still pending and that the subject is still in `expectedStatus`, then
 * writes outbox rows. Several workers can run concurrently (SKIP LOCKED).
 */
export async function processReminders(db: Db, now = new Date(), onError: (err: unknown, reminderId: string) => void = () => {}): Promise<number> {
  const due = await db.execute<{ id: string }>(sql`
    select id from reminders
    where fired_at is null and cancelled_at is null and due_at <= ${ts(now)}
    order by due_at limit ${BATCH}`);
  let fired = 0;
  for (const { id } of due) {
    const ok = await fireOne(db, id, now).catch(async (err) => {
      // Poison pill: a reminder that throws is retired so it can't block the queue behind it.
      onError(err, id);
      await db.update(reminders).set({ firedAt: now }).where(and(eq(reminders.id, id), isNull(reminders.firedAt)));
      return false;
    });
    if (ok) fired++;
  }
  return fired;
}

/** Lock, re-check and fire one reminder in its own transaction. False if another worker took it. */
function fireOne(db: Db, id: string, now: Date): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [rem] = await tx
      .select()
      .from(reminders)
      .where(and(eq(reminders.id, id), isNull(reminders.firedAt), isNull(reminders.cancelledAt)))
      .for('update', { skipLocked: true });
    if (!rem) return false;
    await fire(tx, rem, now);
    await tx.update(reminders).set({ firedAt: now }).where(eq(reminders.id, rem.id));
    return true;
  });
}

async function ctxFor(tx: Tx, orgId: string, now: Date): Promise<Ctx | null> {
  const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId));
  return org ? { tx, org, actor: { type: 'system', orgId }, now, smsEnabled: org.smsRegistrationStatus === 'approved' } : null;
}

async function fire(tx: Tx, r: Reminder, now: Date) {
  const c = await ctxFor(tx, r.orgId, now);
  if (!c) return;
  if (r.type.startsWith('wo.')) return fireWorkOrder(c, r);
  if (r.type === 'request.needs_info_nudge') return fireNeedsInfo(c, r);
  if (r.type === 'doc.expiring') return fireDocExpiry(c, r);
}

async function fireWorkOrder(c: Ctx, r: Pick<Reminder, 'type' | 'subjectId' | 'expectedStatus'>) {
  const w = await loadWorkOrder(c.tx, r.subjectId).catch(() => null);
  // Stale: the job moved on. (Transitions also cancel reminders; this guards the race.)
  if (!w || (r.expectedStatus && w.wo.status !== r.expectedStatus)) return;
  const vars = baseVars(c, w);
  const subject = { type: 'work_order' as const, id: w.wo.id };
  const vendor = w.vendor ? { type: 'vendor' as const, id: w.vendor.id, email: w.vendor.email, phone: w.vendor.phone, smsConsentAt: w.vendor.smsConsentAt } : null;
  const toVendor = (template: Parameters<typeof notify>[1]['template']) =>
    vendor ? notify(c.tx, { orgId: c.org.id, to: vendor, template, vars, subject, link: { purpose: 'job', scopeId: w.wo.id, ttlHours: 60 * 24 }, sms: true }, c.smsEnabled) : undefined;
  const toPm = (template: Parameters<typeof notify>[1]['template'], extra: Record<string, number | string | null> = {}, sms = false) =>
    notifyManagers(c.tx, c.org.id, c.smsEnabled, { template, vars: { ...vars, ...extra }, subject, sms });

  switch (r.type) {
    case 'wo.acceptance_nudge':
      return toVendor('wo.acceptance_nudge.vendor');
    case 'wo.acceptance_escalate':
      return toPm('wo.acceptance_escalate.pm', {}, w.wo.priority === 'emergency');
    case 'wo.quote_nudge':
      return toVendor('wo.quote_nudge.vendor');
    case 'wo.approval_resend':
    case 'wo.approval_escalate': {
      const [q] = await c.tx.execute<{ amount_cents: number }>(sql`select amount_cents from quotes where work_order_id = ${w.wo.id} and status = 'pending' limit 1`);
      if (!q) return;
      if (r.type === 'wo.approval_escalate') return toPm('wo.approval_escalate.pm', { amount: q.amount_cents });
      // Re-send to the owner only if the approval is actually with them and they get direct emails.
      if (w.wo.approvalPendingWith !== 'owner' || w.owner.notifyMode !== 'direct') return;
      return notify(
        c.tx,
        { orgId: c.org.id, to: { type: 'owner', id: w.owner.id, email: w.owner.email, phone: w.owner.phone }, template: 'wo.approval_resend.owner', vars: { ...vars, amount: q.amount_cents }, subject, link: { purpose: 'approval', scopeId: w.wo.id, ttlHours: 14 * 24 } },
        c.smsEnabled,
      );
    }
    case 'wo.appointment_tomorrow': {
      const [a] = await c.tx.select().from(appointments).where(and(eq(appointments.workOrderId, w.wo.id), eq(appointments.status, 'scheduled'))).orderBy(desc(appointments.createdAt)).limit(1);
      if (!a) return;
      const v = { ...vars, window: formatWindow(a.startsAt, a.endsAt, c.org.timezone) };
      if (vendor) await notify(c.tx, { orgId: c.org.id, to: vendor, template: 'wo.appointment_tomorrow.party', vars: v, subject, link: { purpose: 'job', scopeId: w.wo.id, ttlHours: 60 * 24 }, sms: true }, c.smsEnabled);
      if (w.tenant) await notify(c.tx, { orgId: c.org.id, to: { type: 'tenant', id: w.tenant.id, email: w.tenant.email, phone: w.tenant.phone, smsConsentAt: w.tenant.smsConsentAt }, template: 'wo.appointment_tomorrow.party', vars: v, subject, sms: true }, c.smsEnabled);
      return;
    }
    case 'wo.review_nudge':
      return toPm('wo.review_nudge.pm');
    case 'wo.overdue': {
      await toPm('wo.overdue.pm');
      await toVendor('wo.overdue.vendor');
      // Repeat daily while the job stays open in the same state.
      await c.tx.insert(reminders).values({
        orgId: c.org.id,
        type: 'wo.overdue',
        subjectType: 'work_order',
        subjectId: w.wo.id,
        expectedStatus: w.wo.status,
        dueAt: new Date(c.now.getTime() + overdueRepeatHours(c.org.reminderConfig) * 3_600_000),
      });
      return;
    }
  }
}

async function fireNeedsInfo(c: Ctx, r: Pick<Reminder, 'subjectId' | 'expectedStatus'>) {
  const [row] = await c.tx
    .select({ request: maintenanceRequests, tenant: tenants })
    .from(maintenanceRequests)
    .innerJoin(tenants, eq(tenants.id, maintenanceRequests.tenantId))
    .where(eq(maintenanceRequests.id, r.subjectId));
  if (row?.request.status !== 'needs_info') return;
  await notify(
    c.tx,
    {
      orgId: c.org.id,
      to: { type: 'tenant', id: row.tenant.id, email: row.tenant.email, phone: row.tenant.phone, smsConsentAt: row.tenant.smsConsentAt },
      template: 'request.needs_info_nudge.tenant',
      vars: { orgName: c.org.name, ref: row.request.ref, title: row.request.title, question: row.request.infoRequest },
      subject: { type: 'request', id: row.request.id },
      link: { purpose: 'needs_info', scopeId: row.request.id, ttlHours: 14 * 24 },
      sms: true,
    },
    c.smsEnabled,
  );
}

async function fireDocExpiry(c: Ctx, r: Pick<Reminder, 'subjectId' | 'expectedStatus'>) {
  const [row] = await c.tx
    .select({ doc: vendorDocuments, vendor: vendors })
    .from(vendorDocuments)
    .innerJoin(vendors, eq(vendors.id, vendorDocuments.vendorId))
    .where(eq(vendorDocuments.id, r.subjectId));
  // Fire only if the expiry date is unchanged (a renewal replaces the date) and the vendor is active.
  if (!row || row.doc.expiresOn !== r.expectedStatus || !row.vendor.active) return;
  const today = c.now.toISOString().slice(0, 10);
  const when = row.doc.expiresOn! < today ? 'has expired' : row.doc.expiresOn === today ? 'expires today' : 'expires soon';
  const vars = { orgName: c.org.name, vendor: row.vendor.companyName, docType: row.doc.type === 'w9' ? 'W-9' : row.doc.type === 'license' ? 'licence' : row.doc.type, when, expiresOn: row.doc.expiresOn };
  const subject = { type: 'vendor' as const, id: row.vendor.id };
  await notify(
    c.tx,
    { orgId: c.org.id, to: { type: 'vendor', id: row.vendor.id, email: row.vendor.email, phone: row.vendor.phone, smsConsentAt: row.vendor.smsConsentAt }, template: 'doc.expiring.vendor', vars, subject, link: { purpose: 'vendor_profile', scopeId: row.vendor.id, ttlHours: 14 * 24 } },
    c.smsEnabled,
  );
  await notifyManagers(c.tx, c.org.id, c.smsEnabled, { template: 'doc.expiring.pm', vars, subject });
}

