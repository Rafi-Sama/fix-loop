import { and, eq, inArray, ne } from 'drizzle-orm';
import type { Tx } from '../../db/client.js';
import {
  maintenanceRequests,
  organizations,
  owners,
  properties,
  tenants,
  units,
  vendors,
  workOrders,
} from '../../db/schema/index.js';
import { assertFound } from '../../lib/errors.js';
import type { Actor } from '../../shared/actor.js';
import { replaceReminders } from '../../shared/reminders.js';
import { OPEN_STATUSES } from './state-machine.js';

export type Org = typeof organizations.$inferSelect;

export interface Ctx {
  tx: Tx;
  org: Org;
  actor: Actor;
  now: Date;
  smsEnabled: boolean;
}

export async function makeCtx(tx: Tx, actor: Actor, now = new Date()): Promise<Ctx> {
  const [org] = await tx.select().from(organizations).where(eq(organizations.id, actor.orgId));
  assertFound(org, 'Organization');
  return { tx, org, actor, now, smsEnabled: org.smsRegistrationStatus === 'approved' };
}

/** A work order with everything needed to decide, notify and render it. */
export async function loadWorkOrder(tx: Tx, id: string, opts: { lock?: boolean } = {}) {
  const q = tx
    .select({
      wo: workOrders,
      request: maintenanceRequests,
      unit: units,
      property: properties,
      owner: owners,
      vendor: vendors,
      tenant: tenants,
    })
    .from(workOrders)
    .innerJoin(maintenanceRequests, eq(maintenanceRequests.id, workOrders.requestId))
    .innerJoin(units, eq(units.id, workOrders.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .innerJoin(owners, eq(owners.id, properties.ownerId))
    .leftJoin(vendors, eq(vendors.id, workOrders.vendorId))
    .leftJoin(tenants, eq(tenants.id, maintenanceRequests.tenantId))
    .where(eq(workOrders.id, id));
  // Lock only the work order row: concurrent commands on the same job serialise, others don't wait.
  const [row] = await (opts.lock ? q.for('update', { of: workOrders }) : q);
  assertFound(row, 'Work order');
  return row;
}
export type LoadedWo = Awaited<ReturnType<typeof loadWorkOrder>>;

export const addressOf = (w: Pick<LoadedWo, 'property' | 'unit'>) =>
  `${w.property.addressLine}${w.unit.label === 'Main' ? '' : ` #${w.unit.label}`}, ${w.property.city}`;

export function baseVars(c: Ctx, w: LoadedWo): Record<string, string | number | null> {
  return {
    orgName: c.org.name,
    ref: w.wo.ref,
    requestRef: w.request.ref,
    title: w.request.title,
    description: w.wo.description,
    address: addressOf(w),
    priority: w.wo.priority,
    vendor: w.vendor?.companyName ?? null,
    emergencyPhone: w.property.emergencyPhone ?? c.org.emergencyPhone,
  };
}

export const approvalThreshold = (c: Ctx, w: LoadedWo) => w.owner.approvalThresholdCents ?? c.org.defaultApprovalThresholdCents;

export function formatWindow(start: Date, end: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(start);
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time.format(start)}–${time.format(end)}`;
}

/** Keep the request's status in step with its work orders (PRD §5.6 status enum). */
export async function syncRequestStatus(tx: Tx, requestId: string, now: Date) {
  const wos = await tx.select({ status: workOrders.status }).from(workOrders).where(eq(workOrders.requestId, requestId));
  const active = wos.some((w) => OPEN_STATUSES.includes(w.status) && w.status !== 'draft');
  const anyClosed = wos.some((w) => w.status === 'closed');
  const anyOpen = wos.some((w) => OPEN_STATUSES.includes(w.status));
  const next = active ? 'in_progress' : anyClosed && !anyOpen ? 'resolved' : 'new';
  // Never pull a request out of a terminal state implicitly. A needs-info request only moves on
  // when work actually starts (the PM dispatched anyway); otherwise it keeps waiting on the tenant.
  const from: ('new' | 'in_progress' | 'resolved' | 'needs_info')[] = next === 'in_progress' ? ['new', 'needs_info', 'resolved'] : ['new', 'in_progress', 'resolved'];
  const [moved] = await tx
    .update(maintenanceRequests)
    .set({ status: next, statusChangedAt: now })
    .where(and(eq(maintenanceRequests.id, requestId), ne(maintenanceRequests.status, next), inArray(maintenanceRequests.status, from)))
    .returning({ orgId: maintenanceRequests.orgId });
  // Leaving needs_info: the "please answer" nudge to the tenant is no longer relevant.
  if (moved && next === 'in_progress') await replaceReminders(tx, moved.orgId, { type: 'request', id: requestId }, [], now);
}
