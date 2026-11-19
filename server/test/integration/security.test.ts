import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { withOrg } from '../../src/db/client.js';
import { properties } from '../../src/db/schema/index.js';
import { Client, createHarness, insureVendor, resetDb, seedPortfolio, signup, tokenFrom, type Harness } from '../helpers.js';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.close());
beforeEach(() => resetDb(h.owner));

async function jobFor(pm: Client, s: Awaited<ReturnType<typeof seedPortfolio>>, vendorId = s.vendor.id) {
  const req = (await pm.post('/requests', { unitId: s.unit.id, tenantId: s.tenant.id, categoryId: s.plumbing.id, title: 'Leak', description: 'Leak under sink', permissionToEnter: 'yes' })).body;
  const wo = (await pm.post(`/requests/${req.id}/work-orders`, {})).body;
  await pm.post(`/work-orders/${wo.id}/assign`, { vendorId });
  const mail = await h.flush();
  return { req, wo, mail };
}

describe('tenant isolation', () => {
  it('every org-scoped table has row-level security enabled', async () => {
    const rows = await h.owner.execute<{ table_name: string; rls: boolean }>(sql`
      select c.table_name, cl.relrowsecurity as rls
      from information_schema.columns c join pg_class cl on cl.relname = c.table_name
      where c.table_schema = 'public' and c.column_name = 'org_id'
        -- security_events is platform-level: the API only appends, and only superadmins read it.
        and c.table_name not in ('users','sessions','access_links','security_events')`);
    expect(rows.length).toBeGreaterThan(15);
    expect(rows.filter((r) => !r.rls).map((r) => r.table_name)).toEqual([]);
  });

  it('org B cannot read or reference org A data, by API or by direct SQL', async () => {
    const a = await signup(h.app, 'Firm A');
    const sa = await seedPortfolio(a);
    const b = await signup(h.app, 'Firm B');
    await seedPortfolio(b);

    expect((await b.get(`/properties/${sa.property.id}`)).status).toBe(404);
    expect((await b.get('/properties')).body.items.every((p: { id: string }) => p.id !== sa.property.id)).toBe(true);
    // Referencing A's owner/unit from B fails.
    expect((await b.post('/properties', { ownerId: sa.owner.id, nameRef: 'x', addressLine: 'x', city: 'x', state: 'TX', zip: '78701', type: 'condo' })).status).toBe(404);
    expect((await b.post('/tenants', { unitId: sa.unit.id, name: 'x', email: 'x@example.com' })).status).toBe(404);

    // Defense in depth: the API role sees nothing without an org context, and only its org with one.
    expect(await h.db.select().from(properties)).toHaveLength(0);
    const bOrg = (await b.get('/auth/me')).body.org.id;
    const seen = await withOrg(h.db, bOrg, (tx) => tx.select().from(properties));
    expect(seen.every((p) => p.orgId === bOrg)).toBe(true);
    await expect(withOrg(h.db, bOrg, (tx) => tx.insert(properties).values({ ...sa.property, id: undefined, orgId: sa.property.orgId }))).rejects.toThrow();
  });

  it('the timeline is append-only for the API role', async () => {
    const err = await h.db.execute(sql`delete from events`).catch((e: { cause?: Error }) => e.cause);
    expect(String(err)).toMatch(/permission denied/);
  });
});

describe('link scoping', () => {
  it('a vendor link stops working when the job is reassigned', async () => {
    const pm = await signup(h.app);
    const s = await seedPortfolio(pm);
    await insureVendor(pm, s.vendor.id);
    const other = (await pm.post('/vendors', { companyName: 'Other Co', email: 'other@example.com' })).body;
    await insureVendor(pm, other.id);
    const { wo, mail } = await jobFor(pm, s);
    const token = tokenFrom(mail.find((m) => m.to === s.vendor.email));
    expect((await pm.post(`/work-orders/${wo.id}/unassign`)).status).toBe(204);
    await pm.post(`/work-orders/${wo.id}/assign`, { vendorId: other.id });
    const anon = new Client(h.app);
    expect((await anon.get(`/links/${token}`)).status).toBe(410);
    expect((await anon.post(`/links/${token}/accept`)).status).toBe(410);
  });

  it('a vendor link cannot download files from another job', async () => {
    const pm = await signup(h.app);
    const s = await seedPortfolio(pm);
    await insureVendor(pm, s.vendor.id);
    const one = await jobFor(pm, s);
    const two = await jobFor(pm, s);
    const tokenOne = tokenFrom(one.mail.find((m) => m.to === s.vendor.email));
    const photo = (await pm.post('/files/uploads', { subject: { type: 'work_order', id: two.wo.id }, kind: 'document', mime: 'image/png', sizeBytes: 7 })).body;
    await h.owner.execute(sql`update attachments set uploaded = true where id = ${photo.attachmentId}`);
    expect((await new Client(h.app).get(`/links/${tokenOne}/files/${photo.attachmentId}`)).status).toBe(404);
  });

  it('internal comments never appear in link views', async () => {
    const pm = await signup(h.app);
    const s = await seedPortfolio(pm);
    await insureVendor(pm, s.vendor.id);
    const { wo, mail } = await jobFor(pm, s);
    await pm.post(`/work-orders/${wo.id}/comments`, { body: 'SECRET owner is difficult', visibility: 'internal' });
    const view = await new Client(h.app).get(`/links/${tokenFrom(mail.find((m) => m.to === s.vendor.email))}`);
    expect(JSON.stringify(view.body)).not.toContain('SECRET');
  });

  it('malformed and unknown tokens are indistinguishable', async () => {
    const anon = new Client(h.app);
    const a = await anon.get('/links/short');
    const b = await anon.get(`/links/${'A'.repeat(43)}`);
    expect([a.status, b.status]).toEqual([404, 404]);
    expect(a.body).toEqual(b.body);
  });
});

describe('dispatch rules and edge cases', () => {
  it('compliance gate: missing insurance needs a typed override, which is logged', async () => {
    const pm = await signup(h.app);
    const s = await seedPortfolio(pm);
    const req = (await pm.post('/requests', { unitId: s.unit.id, categoryId: s.plumbing.id, title: 'Leak', description: 'Leak', permissionToEnter: 'yes' })).body;
    const wo = (await pm.post(`/requests/${req.id}/work-orders`, {})).body;
    const blocked = await pm.post(`/work-orders/${wo.id}/assign`, { vendorId: s.vendor.id });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.details.code).toBe('compliance_override_required');
    expect((await pm.post(`/work-orders/${wo.id}/assign`, { vendorId: s.vendor.id, overrideReason: 'COI renewal in the mail' })).status).toBe(200);
    const ev = (await pm.get(`/work-orders/${wo.id}`)).body.timeline.find((e: { type: string }) => e.type === 'wo.assigned');
    expect(ev.payload.complianceOverride).toBe('COI renewal in the mail');
  });

  it('emergency keywords require acknowledgement and force emergency priority', async () => {
    const pm = await signup(h.app);
    const s = await seedPortfolio(pm);
    const anon = new Client(h.app);
    const body = { contact: { name: 'T', email: s.tenant.email }, categoryId: s.plumbing.id, title: 'I smell gas in the kitchen', description: 'Strong smell', urgency: 'low', permissionToEnter: 'yes' };
    const first = await anon.post(`/public/orgs/${s.slug}/requests`, body);
    expect(first.status).toBe(409);
    expect(first.body.error.details.code).toBe('emergency_ack_required');
    const ok = await anon.post(`/public/orgs/${s.slug}/requests`, { ...body, emergencyAck: true });
    expect(ok.status).toBe(201);
    expect(ok.body.isEmergency).toBe(true);
    const mail = await h.flush();
    expect(mail.some((m) => m.subject?.startsWith('EMERGENCY'))).toBe(true);
  });

  it('whole-word keyword matching: "fireplace" is not "fire"', async () => {
    const { detectEmergency } = await import('../../src/modules/requests/requests.service.js');
    expect(detectEmergency('The fireplace damper is stuck', ['fire'])).toEqual([]);
    expect(detectEmergency('Small fire in the oven!', ['fire'])).toEqual(['fire']);
  });

  it('unmatched tenants must use a property link', async () => {
    const pm = await signup(h.app);
    const s = await seedPortfolio(pm);
    const anon = new Client(h.app);
    const body = { contact: { name: 'Stranger', email: 'stranger@example.com' }, categoryId: s.plumbing.id, title: 'Leak', description: 'Leak', permissionToEnter: 'yes', emergencyAck: false };
    const noLink = await anon.post(`/public/orgs/${s.slug}/requests`, { ...body, photoIds: [] });
    expect(noLink.body.error.details.code).toBe('tenant_not_matched');
  });

  it('SMS consent is recorded only for the phone the submitter typed', async () => {
    const pm = await signup(h.app);
    const s = await seedPortfolio(pm);
    const other = ((await pm.get('/org/categories')).body as { id: string; name: string }[]).find((c) => c.name === 'Other')!;
    const submit = (phone: string) =>
      new Client(h.app).post(`/public/orgs/${s.slug}/requests`, { contact: { name: 'x', email: s.tenant.email, phone }, smsConsent: true, categoryId: other.id, title: 'Hinge', description: 'Loose hinge', permissionToEnter: 'yes' });
    // Matched by email with someone else's number: the tenant's real phone is not opted in.
    expect((await submit('512-555-0111')).status).toBe(201);
    expect((await pm.get(`/tenants/${s.tenant.id}`)).body.smsConsentAt).toBeNull();
    expect((await submit('(512) 555-0100')).status).toBe(201);
    expect((await pm.get(`/tenants/${s.tenant.id}`)).body.smsConsentAt).not.toBeNull();
  });

  it('invoice overage needs confirmation; diagnose-then-quote resumes on site', async () => {
    const pm = await signup(h.app);
    const s = await seedPortfolio(pm);
    await insureVendor(pm, s.vendor.id);
    const { wo } = await jobFor(pm, s);
    await pm.post(`/work-orders/${wo.id}/accept`);
    const start = new Date(Date.now() + 86_400_000);
    await pm.post(`/work-orders/${wo.id}/appointments`, { startsAt: start, endsAt: new Date(start.getTime() + 3_600_000) });
    await pm.post(`/work-orders/${wo.id}/start`);
    // On site, the vendor finds a bigger job and asks for approval.
    expect((await pm.post(`/work-orders/${wo.id}/quotes`, { amountCents: 20000 })).status).toBe(201);
    expect((await pm.get(`/work-orders/${wo.id}`)).body.status).toBe('awaiting_approval');
    expect((await pm.post(`/work-orders/${wo.id}/quote-decision`, { decision: 'approve' })).status).toBe(204);
    expect((await pm.get(`/work-orders/${wo.id}`)).body.status).toBe('in_progress');

    const photo = (await pm.post('/files/uploads', { subject: { type: 'work_order', id: wo.id }, kind: 'completion_photo', mime: 'image/png', sizeBytes: 7 })).body;
    await h.owner.execute(sql`update attachments set uploaded = true where id = ${photo.attachmentId}`);
    await pm.post(`/work-orders/${wo.id}/complete`, { invoiceAmountCents: 29000, photoAttachmentIds: [photo.attachmentId] });
    const blocked = await pm.post(`/work-orders/${wo.id}/close`, {});
    expect(blocked.body.error.details.code).toBe('overage_confirmation_required');
    expect((await pm.post(`/work-orders/${wo.id}/close`, { confirmOverage: true })).status).toBe(204);
  });

  it('completion without a photo is rejected', async () => {
    const pm = await signup(h.app);
    const s = await seedPortfolio(pm);
    await insureVendor(pm, s.vendor.id);
    const { wo } = await jobFor(pm, s);
    const r = await pm.post(`/work-orders/${wo.id}/complete`, { invoiceAmountCents: 100, photoAttachmentIds: [] });
    expect(r.status).toBe(400);
  });

  it('illegal transitions return 409 and leave the job unchanged', async () => {
    const pm = await signup(h.app);
    const s = await seedPortfolio(pm);
    await insureVendor(pm, s.vendor.id);
    const { wo } = await jobFor(pm, s);
    const r = await pm.post(`/work-orders/${wo.id}/close`, {});
    expect(r.status).toBe(409);
    expect((await pm.get(`/work-orders/${wo.id}`)).body.status).toBe('awaiting_acceptance');
  });

  it('concurrent requests get unique, gapless reference numbers', async () => {
    const pm = await signup(h.app);
    const s = await seedPortfolio(pm);
    const results = await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        pm.post('/requests', { unitId: s.unit.id, categoryId: s.plumbing.id, title: `Issue ${i}`, description: 'x', permissionToEnter: 'yes' }),
      ),
    );
    const refs = results.map((r) => r.body.ref as string).sort();
    expect(new Set(refs).size).toBe(15);
    expect(refs.at(-1)).toMatch(/-015$/);
  });

  it('two people acting on the same job at once: exactly one wins', async () => {
    const pm = await signup(h.app);
    const s = await seedPortfolio(pm);
    await insureVendor(pm, s.vendor.id);
    const { wo } = await jobFor(pm, s);
    // Two clicks on "accept" (double-submit, or PM and vendor at once): the row lock serialises them.
    const [x, y] = await Promise.all([pm.post(`/work-orders/${wo.id}/accept`), pm.post(`/work-orders/${wo.id}/accept`)]);
    expect([x.status, y.status].sort()).toEqual([204, 409]);
    const accepted = (await pm.get(`/work-orders/${wo.id}`)).body.timeline.filter((e: { type: string }) => e.type === 'wo.accepted');
    expect(accepted).toHaveLength(1);
  });
});
