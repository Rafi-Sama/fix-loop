/** One test per defect found in the backend review, so none of them can quietly come back. */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { processReminders } from '../../src/jobs/reminders.js';
import { Client, createHarness, insureVendor, resetDb, seedPortfolio, signup, tokenFrom, type Harness } from '../helpers.js';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.close());
beforeEach(() => resetDb(h.owner));

const DAY = 86_400_000;

async function setup(opts: { quoteRequired?: boolean; estimatedCostCents?: number } = {}) {
  const pm = await signup(h.app);
  const s = await seedPortfolio(pm);
  await insureVendor(pm, s.vendor.id);
  const req = (await pm.post('/requests', { unitId: s.unit.id, tenantId: s.tenant.id, categoryId: s.plumbing.id, title: 'Leak', description: 'Leak', permissionToEnter: 'yes' })).body;
  const wo = (await pm.post(`/requests/${req.id}/work-orders`, { ...opts })).body;
  return { pm, s, req, wo };
}
async function assign(pm: Client, woId: string, vendorId: string) {
  expect((await pm.post(`/work-orders/${woId}/assign`, { vendorId })).status).toBe(200);
  return h.flush();
}
const schedule = (pm: Client, woId: string, days = 2) => {
  const startsAt = new Date(Date.now() + days * DAY);
  return pm.post(`/work-orders/${woId}/appointments`, { startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000) });
};
async function photo(pm: Client, woId: string) {
  const p = (await pm.post('/files/uploads', { subject: { type: 'work_order', id: woId }, kind: 'completion_photo', mime: 'image/png', sizeBytes: 7 })).body;
  await h.owner.execute(sql`update attachments set uploaded = true where id = ${p.attachmentId}`);
  return p.attachmentId as string;
}
const status = async (pm: Client, woId: string) => (await pm.get(`/work-orders/${woId}`)).body;

describe('reassignment after acceptance', () => {
  it('releases a scheduled job: appointment cancelled, old link dead, authorised amount cleared, vendor told', async () => {
    const { pm, s, wo } = await setup({ quoteRequired: true });
    const mail = await assign(pm, wo.id, s.vendor.id);
    const oldToken = tokenFrom(mail.find((m) => m.to === s.vendor.email));
    await pm.post(`/work-orders/${wo.id}/accept`);
    await pm.post(`/work-orders/${wo.id}/quotes`, { amountCents: 10000 });
    await pm.post(`/work-orders/${wo.id}/quote-decision`, { decision: 'approve' });
    expect((await schedule(pm, wo.id)).status).toBe(201);

    expect((await pm.post(`/work-orders/${wo.id}/unassign`)).status).toBe(204);
    const d = await status(pm, wo.id);
    expect(d).toMatchObject({ status: 'draft', vendorId: null, approvedAmountCents: null, acceptedAt: null });
    expect(d.appointments.every((a: { status: string }) => a.status === 'cancelled')).toBe(true);
    expect((await new Client(h.app).get(`/links/${oldToken}`)).status).toBe(410);
    expect((await h.flush()).some((m) => m.to === s.vendor.email && m.subject?.includes('cancelled'))).toBe(true);
  });

  it('a vendor can withdraw through their link after accepting', async () => {
    const { pm, s, wo } = await setup();
    const token = tokenFrom((await assign(pm, wo.id, s.vendor.id)).find((m) => m.to === s.vendor.email));
    const v = new Client(h.app);
    await v.post(`/links/${token}/accept`);
    expect((await v.get(`/links/${token}`)).body.actions).toContain('decline');
    expect((await v.post(`/links/${token}/decline`, { reason: 'Truck broke down' })).status).toBe(204);
    expect((await status(pm, wo.id)).status).toBe('draft');
  });

  it('nothing can be released once work has started', async () => {
    const { pm, s, wo } = await setup();
    await assign(pm, wo.id, s.vendor.id);
    await pm.post(`/work-orders/${wo.id}/accept`);
    await schedule(pm, wo.id);
    await pm.post(`/work-orders/${wo.id}/start`);
    expect((await pm.post(`/work-orders/${wo.id}/unassign`)).status).toBe(409);
  });
});

describe('quotes and approvals', () => {
  it('a vendor can revise a pending quote; the old one is superseded', async () => {
    const { pm, s, wo } = await setup({ quoteRequired: true });
    await assign(pm, wo.id, s.vendor.id);
    await pm.post(`/work-orders/${wo.id}/accept`);
    await pm.post(`/work-orders/${wo.id}/quotes`, { amountCents: 50000 });
    expect((await pm.post(`/work-orders/${wo.id}/quotes`, { amountCents: 28000 })).status).toBe(201);
    const d = await status(pm, wo.id);
    expect(d.quotes.map((q: { version: number; status: string }) => [q.version, q.status])).toEqual([
      [2, 'pending'],
      [1, 'superseded'],
    ]);
  });

  it('an approval that resumes a scheduled job keeps the day-before reminder', async () => {
    const { pm, s, wo } = await setup();
    await assign(pm, wo.id, s.vendor.id);
    await pm.post(`/work-orders/${wo.id}/accept`);
    await schedule(pm, wo.id, 3);
    await pm.post(`/work-orders/${wo.id}/quotes`, { amountCents: 10000 }); // diagnose-then-quote from `scheduled`
    await pm.post(`/work-orders/${wo.id}/quote-decision`, { decision: 'approve' });
    expect((await status(pm, wo.id)).status).toBe('scheduled');
    const pending = await h.owner.execute<{ type: string }>(sql`select type from reminders where subject_id = ${wo.id} and fired_at is null and cancelled_at is null`);
    expect(pending.map((r) => r.type)).toContain('wo.appointment_tomorrow');
  });

  it('rejecting a quote with "cancel" does the full cancel cleanup', async () => {
    const { pm, s, wo, req } = await setup();
    const token = tokenFrom((await assign(pm, wo.id, s.vendor.id)).find((m) => m.to === s.vendor.email));
    await pm.post(`/work-orders/${wo.id}/accept`);
    await schedule(pm, wo.id);
    await pm.post(`/work-orders/${wo.id}/quotes`, { amountCents: 10000 });
    await pm.post(`/work-orders/${wo.id}/quote-decision`, { decision: 'reject', next: 'cancelled', note: 'Owner will DIY' });
    const d = await status(pm, wo.id);
    expect(d.status).toBe('cancelled');
    expect(d.appointments.every((a: { status: string }) => a.status === 'cancelled')).toBe(true);
    expect((await new Client(h.app).get(`/links/${token}`)).status).toBe(410);
    expect((await pm.get(`/requests/${req.id}`)).body.status).toBe('new');
  });
});

describe('closing', () => {
  it('a job with no quote or estimate can’t close a big invoice without the owner’s OK', async () => {
    const { pm, s, wo } = await setup();
    await assign(pm, wo.id, s.vendor.id);
    await pm.post(`/work-orders/${wo.id}/accept`);
    await schedule(pm, wo.id);
    await pm.post(`/work-orders/${wo.id}/start`);
    await pm.post(`/work-orders/${wo.id}/complete`, { invoiceAmountCents: 500000, photoAttachmentIds: [await photo(pm, wo.id)] });
    const blocked = await pm.post(`/work-orders/${wo.id}/close`, {});
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.details.code).toBe('owner_approval_required');
    expect((await pm.post(`/work-orders/${wo.id}/close`, { ownerApprovedOffline: true, note: 'Owner OK by phone' })).status).toBe(204);
    expect((await status(pm, wo.id)).approvals.at(-1)).toMatchObject({ approverType: 'owner', channel: 'phone', amountCents: 500000 });
  });

  it('a small invoice with no quote closes normally', async () => {
    const { pm, s, wo } = await setup();
    await assign(pm, wo.id, s.vendor.id);
    await pm.post(`/work-orders/${wo.id}/accept`);
    await schedule(pm, wo.id);
    await pm.post(`/work-orders/${wo.id}/start`);
    await pm.post(`/work-orders/${wo.id}/complete`, { invoiceAmountCents: 12000, photoAttachmentIds: [await photo(pm, wo.id)] });
    expect((await pm.post(`/work-orders/${wo.id}/close`, {})).status).toBe(204);
  });

  it('cancelling a completed job rejects its submitted invoice', async () => {
    const { pm, s, wo } = await setup();
    await assign(pm, wo.id, s.vendor.id);
    await pm.post(`/work-orders/${wo.id}/accept`);
    await schedule(pm, wo.id);
    await pm.post(`/work-orders/${wo.id}/start`);
    await pm.post(`/work-orders/${wo.id}/complete`, { invoiceAmountCents: 1000, photoAttachmentIds: [await photo(pm, wo.id)] });
    await pm.post(`/work-orders/${wo.id}/cancel`, { reason: 'Duplicate' });
    expect((await status(pm, wo.id)).invoices[0].status).toBe('rejected');
  });
});

describe('requests and reminders', () => {
  it('editing the due date moves the overdue reminder', async () => {
    const { pm, s, wo } = await setup();
    await assign(pm, wo.id, s.vendor.id);
    const due = new Date(Date.now() + 30 * DAY);
    await pm.patch(`/work-orders/${wo.id}`, { expectedCompletionAt: due });
    const [r] = await h.owner.execute<{ due_at: Date }>(sql`select due_at from reminders where subject_id = ${wo.id} and type = 'wo.overdue' and cancelled_at is null and fired_at is null`);
    expect(new Date(r!.due_at).getTime()).toBe(due.getTime());
  });

  it('a needs-info request moves to in progress when dispatched, and the tenant nudge is cancelled', async () => {
    const { pm, s, req, wo } = await setup();
    await pm.post(`/requests/${req.id}/needs-info`, { question: 'Is it the hot or cold line?' });
    await assign(pm, wo.id, s.vendor.id);
    expect((await pm.get(`/requests/${req.id}`)).body.status).toBe('in_progress');
    const live = await h.owner.execute(sql`select 1 from reminders where subject_id = ${req.id} and fired_at is null and cancelled_at is null`);
    expect(live).toHaveLength(0);
  });

  it('a tenant can confirm a fix only once', async () => {
    const { pm, s, wo } = await setup();
    await assign(pm, wo.id, s.vendor.id);
    await pm.post(`/work-orders/${wo.id}/accept`);
    await schedule(pm, wo.id);
    await pm.post(`/work-orders/${wo.id}/start`);
    await pm.post(`/work-orders/${wo.id}/complete`, { invoiceAmountCents: 1000, photoAttachmentIds: [await photo(pm, wo.id)] });
    await pm.post(`/work-orders/${wo.id}/close`, {});
    const token = tokenFrom((await h.flush()).find((m) => m.to === s.tenant.email && m.subject?.startsWith('Was')));
    const t = new Client(h.app);
    expect((await t.post(`/links/${token}/confirm`, { fixed: true, rating: 4 })).status).toBe(204);
    expect((await t.post(`/links/${token}/confirm`, { fixed: false })).status).toBe(409);
  });

  it('a reminder that throws is retired instead of blocking the queue', async () => {
    const { pm, s, wo } = await setup();
    await assign(pm, wo.id, s.vendor.id);
    await pm.post(`/work-orders/${wo.id}/accept`);
    await schedule(pm, wo.id, 3);
    // A corrupt timezone makes rendering the appointment window throw inside the reminder.
    await h.owner.execute(sql`update organizations set timezone = 'Not/AZone'`);
    const errors: string[] = [];
    const at = new Date(Date.now() + 2.5 * DAY);
    await processReminders(h.owner, at, (_e, id) => errors.push(id));
    expect(errors).toHaveLength(1);
    // Retired, not left due: the next tick doesn't hit it again.
    expect(await processReminders(h.owner, at, (_e, id) => errors.push(id))).toBe(0);
    expect(errors).toHaveLength(1);
  });

  it('managers who haven’t accepted their invite get no operational mail', async () => {
    const { pm, req } = await setup();
    await pm.post('/org/users', { email: 'pending.invite@example.com', name: 'Pending' });
    await h.flush();
    await pm.post(`/requests/${req.id}/comments`, { body: 'x' });
    await pm.post('/requests', { unitId: req.unitId, categoryId: req.categoryId, title: 'Another', description: 'x', permissionToEnter: 'yes' });
    expect((await h.flush()).some((m) => m.to === 'pending.invite@example.com')).toBe(false);
  });
});

describe('validation and safety', () => {
  it('insurance needs an expiry date; deleting a document deletes its file', async () => {
    const pm = await signup(h.app);
    const s = await seedPortfolio(pm);
    const start = (await pm.post('/files/uploads', { subject: { type: 'vendor', id: s.vendor.id }, kind: 'document', mime: 'application/pdf', sizeBytes: 7 })).body;
    await h.owner.execute(sql`update attachments set uploaded = true where id = ${start.attachmentId}`);
    expect((await pm.post(`/vendors/${s.vendor.id}/documents`, { type: 'insurance', attachmentId: start.attachmentId })).status).toBe(400);
    const doc = (await pm.post(`/vendors/${s.vendor.id}/documents`, { type: 'w9', attachmentId: start.attachmentId })).body;
    expect((await pm.get(`/vendors/${s.vendor.id}/documents/${doc.id}/url`)).body.url).toMatch(/^http/);
    expect((await h.app.inject({ method: 'DELETE', url: `/vendors/${s.vendor.id}/documents/${doc.id}`, headers: { cookie: pm.cookie, origin: 'http://localhost:5173' } })).statusCode).toBe(204);
    expect(await h.owner.execute(sql`select 1 from attachments where id = ${start.attachmentId}`)).toHaveLength(0);
  });

  it('unknown reminder settings are rejected', async () => {
    const pm = await signup(h.app);
    expect((await pm.patch('/org', { reminderConfig: { 'wo.typo': 3 } })).status).toBe(400);
    expect((await pm.patch('/org', { reminderConfig: { 'wo.acceptance_nudge': 2 } })).status).toBe(200);
  });

  it('archived units can’t get new tenants', async () => {
    const pm = await signup(h.app);
    const s = await seedPortfolio(pm);
    await pm.patch(`/units/${s.unit.id}`, { archived: true });
    expect((await pm.post('/tenants', { unitId: s.unit.id, name: 'x', email: 'x@example.com' })).status).toBe(404);
  });

  it('owners with active properties can’t be archived', async () => {
    const pm = await signup(h.app);
    const s = await seedPortfolio(pm);
    expect((await pm.patch(`/owners/${s.owner.id}`, { archived: true })).status).toBe(409);
  });

  it('readiness reports the database', async () => {
    expect((await h.app.inject({ method: 'GET', url: '/ready' })).json()).toEqual({ ok: true });
  });

  it('a PM can resend a lost job link', async () => {
    const { pm, s, wo } = await setup();
    await assign(pm, wo.id, s.vendor.id);
    expect((await pm.post(`/work-orders/${wo.id}/resend-link`)).status).toBe(202);
    const token = tokenFrom((await h.flush()).find((m) => m.to === s.vendor.email));
    expect((await new Client(h.app).get(`/links/${token}`)).body.job.ref).toBe(wo.ref);
  });

  it('a firm with a full job history can be deleted (cancellation / data retention)', async () => {
    const { pm, s, wo } = await setup();
    await assign(pm, wo.id, s.vendor.id);
    const orgId = (await pm.get('/auth/me')).body.org.id;
    // The composite (org_id, id) FKs still stop orphaning a row inside a firm.
    await expect(h.owner.execute(sql`delete from units where id = ${s.unit.id}`)).rejects.toThrow();
    await h.owner.execute(sql`delete from organizations where id = ${orgId}`);
    const [left] = await h.owner.execute<{ n: number }>(sql`select (select count(*) from work_orders) + (select count(*) from tenants) + (select count(*) from users) as n`);
    expect(Number(left!.n)).toBe(0);
  });

  it('nothing claims to be sent to a party we have no way to reach', async () => {
    const { pm, s, wo } = await setup({ quoteRequired: true });
    await assign(pm, wo.id, s.vendor.id);
    await pm.post(`/work-orders/${wo.id}/accept`);
    await pm.post(`/work-orders/${wo.id}/quotes`, { amountCents: 90000 });
    // An owner with only a phone gets no approval link (owners are email-only), so don't mark it as waiting on them.
    await pm.patch(`/owners/${s.owner.id}`, { email: null, phone: '512-555-0177' });
    const sent = await pm.post(`/work-orders/${wo.id}/send-to-owner`);
    expect(sent.status).toBe(409);
    expect(sent.body.error.details.code).toBe('owner_unreachable');
    expect((await status(pm, wo.id)).waitingOn).toBe('pm');
    await pm.patch(`/vendors/${s.vendor.id}`, { email: null });
    expect((await pm.post(`/work-orders/${wo.id}/resend-link`)).status).toBe(409);
    expect((await pm.post(`/vendors/${s.vendor.id}/invite`)).status).toBe(400);
  });
});


describe('keyset pagination', () => {
  it('pages through rows created in the same transaction (shared created_at) without skipping any', async () => {
    const pm = await signup(h.app);
    const s = await seedPortfolio(pm);
    // One statement → identical now() for every row, like a bulk import.
    await h.owner.execute(sql`
      insert into owners (org_id, name) select o.org_id, 'Bulk ' || g from owners o, generate_series(1, 7) g where o.id = ${s.owner.id}`);
    const names: string[] = [];
    let cursor: string | null = null;
    do {
      const page: { body: { items: { name: string }[]; nextCursor: string | null } } = await pm.get(`/owners?limit=3${cursor ? `&cursor=${cursor}` : ''}`);
      names.push(...page.body.items.map((o) => o.name));
      cursor = page.body.nextCursor;
    } while (cursor);
    expect(names).toHaveLength(8);
    expect(new Set(names).size).toBe(8);
  });
});
