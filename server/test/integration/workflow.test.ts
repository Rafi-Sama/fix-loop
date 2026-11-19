/** The complete 12-step maintenance workflow (docs/prd.md §12), driven through the real HTTP API and links. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client, createHarness, env, insureVendor, resetDb, seedPortfolio, signup, tokenFrom, uploadVia, type Harness, type Sent } from '../helpers.js';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.close());
beforeEach(() => resetDb(h.owner));

const to = (msgs: Sent[], addr: string) => msgs.find((m) => m.to === addr && m.channel === 'email');

describe('12-step workflow', () => {
  it('tenant report → vendor quote → owner approval → repair → close → tenant confirms', async () => {
    const pm = await signup(h.app);
    const s = await seedPortfolio(pm);
    await insureVendor(pm, s.vendor.id);
    const anon = new Client(h.app);

    // Step 1: tenant submits with a photo through the public link.
    const up = await anon.post(`/public/orgs/${s.slug}/uploads`, { mime: 'image/png', sizeBytes: 7 });
    expect(up.status).toBe(201);
    await uploadVia(up.body);
    expect((await anon.post(`/public/orgs/${s.slug}/uploads/${up.body.attachmentId}/complete`, { draftId: up.body.draftId })).status).toBe(200);
    const submitted = await anon.post(`/public/orgs/${s.slug}/requests`, {
      draftId: up.body.draftId,
      contact: { name: 'Tina Tenant', email: s.tenant.email },
      categoryId: s.plumbing.id,
      title: 'Kitchen Sink Leak',
      description: 'Water is leaking from the pipe underneath the kitchen sink.',
      urgency: 'normal',
      permissionToEnter: 'only_if_home',
      availabilityText: 'Weekday mornings',
      photoIds: [up.body.attachmentId],
    });
    expect(submitted.status).toBe(201);
    expect(submitted.body.ref).toMatch(/^MR-\d{4}-001$/);
    let mail = await h.flush();
    expect(to(mail, s.tenant.email)?.subject).toContain(submitted.body.ref);

    // Step 2–3: PM triages and converts to a work order that needs a quote.
    const list = (await pm.get('/requests?status=new')).body;
    const requestId = list.items[0].id;
    expect(list.items[0].verifiedTenant).toBe(true);
    const wo = (await pm.post(`/requests/${requestId}/work-orders`, { description: 'Inspect and repair the leaking kitchen sink pipe.', quoteRequired: true, estimatedCostCents: 25000 })).body;
    expect(wo.ref).toMatch(/^WO-\d{4}-001$/);

    // Step 4: assign → vendor gets a job link.
    expect((await pm.post(`/work-orders/${wo.id}/assign`, { vendorId: s.vendor.id })).status).toBe(200);
    mail = await h.flush();
    const vendorToken = tokenFrom(to(mail, s.vendor.email));
    const vendor = new Client(h.app);
    const view = (await vendor.get(`/links/${vendorToken}`)).body;
    expect(view.job.ref).toBe(wo.ref);
    expect(view.access).toBeNull(); // tenant contact hidden until accepted
    expect(view.issue.photos).toHaveLength(1);
    expect(view).not.toHaveProperty('owner');

    // Step 5–6: vendor accepts, sees access info, quotes above the owner's threshold.
    expect((await vendor.post(`/links/${vendorToken}/accept`)).status).toBe(204);
    expect((await vendor.get(`/links/${vendorToken}`)).body.access.tenantPhone).toBe('+15125550100');
    expect((await vendor.post(`/links/${vendorToken}/quote`, { amountCents: 45000, description: 'Replace P-trap' })).status).toBe(204);

    // Step 7: PM can't approve over threshold alone → sends to owner → owner approves by link.
    const direct = await pm.post(`/work-orders/${wo.id}/quote-decision`, { decision: 'approve' });
    expect(direct.status).toBe(409);
    expect(direct.body.error.details.code).toBe('owner_approval_required');
    expect((await pm.post(`/work-orders/${wo.id}/send-to-owner`)).status).toBe(204);
    mail = await h.flush();
    const ownerToken = tokenFrom(to(mail, s.owner.email));
    const ownerView = (await anon.get(`/links/${ownerToken}`)).body;
    expect(ownerView.pending).toBe(true);
    expect(ownerView.quote.amountCents).toBe(45000);
    expect((await anon.post(`/links/${ownerToken}/decide`, { decision: 'approved' })).status).toBe(204);
    // An approval link can't be replayed.
    expect((await anon.post(`/links/${ownerToken}/decide`, { decision: 'approved' })).status).toBe(410);

    // Step 8: vendor records the appointment; tenant is told.
    const start = new Date(Date.now() + 2 * 86_400_000);
    const end = new Date(start.getTime() + 2 * 3_600_000);
    expect((await vendor.post(`/links/${vendorToken}/schedule`, { startsAt: start, endsAt: end })).status).toBe(204);
    mail = await h.flush();
    expect(to(mail, s.tenant.email)?.subject).toContain('Appointment');

    // Step 9–10: start, upload a completion photo, complete with invoice.
    expect((await vendor.post(`/links/${vendorToken}/start`)).status).toBe(204);
    const photo = (await vendor.post(`/links/${vendorToken}/uploads`, { kind: 'completion_photo', mime: 'image/png', sizeBytes: 7 })).body;
    await uploadVia(photo);
    expect((await vendor.post(`/links/${vendorToken}/uploads/${photo.attachmentId}/complete`)).status).toBe(200);
    expect((await vendor.post(`/links/${vendorToken}/complete`, { invoiceAmountCents: 46000, photoAttachmentIds: [photo.attachmentId], notes: 'Replaced P-trap' })).status).toBe(204);

    // Step 11–12: PM closes; request resolved; expense recorded; tenant asked to confirm.
    expect((await pm.post(`/work-orders/${wo.id}/close`, {})).status).toBe(204);
    const detail = (await pm.get(`/work-orders/${wo.id}`)).body;
    // Detail carries what the page needs in one response: vendor compliance and signed file URLs (no per-thumbnail calls).
    expect(detail.vendor.compliance).toBe('ok');
    const issuePhoto = detail.attachments.find((f: { kind: string }) => f.kind === 'issue_photo');
    expect(issuePhoto.url).toMatch(/^http.*X-Amz-Signature=/);
    expect(issuePhoto.fileKey).toBeUndefined();
    expect((await fetch(issuePhoto.url)).status).toBe(200);
    expect((await pm.get(`/work-orders/${wo.id}`)).body.attachments[0].url).toBe(detail.attachments[0].url); // stable → browser cache hits
    expect(detail.status).toBe('closed');
    expect(detail.timeline.map((e: { type: string }) => e.type)).toEqual([
      'wo.created',
      'wo.assigned',
      'wo.accepted',
      'wo.quote_submitted',
      'wo.approval_requested',
      'wo.quote_approved',
      'wo.scheduled',
      'wo.started',
      'wo.completed',
      'wo.closed',
    ]);
    expect(detail.approvals[0]).toMatchObject({ approverType: 'owner', channel: 'email_link', amountCents: 45000 });
    expect((await pm.get(`/requests/${requestId}`)).body.status).toBe('resolved');
    // Closing ends the vendor's access to the tenant's contact and access details.
    expect((await vendor.get(`/links/${vendorToken}`)).status).toBe(410);
    expect((await pm.get(`/properties/${s.property.id}`)).body.expenseByMonth[0].totalCents).toBe(46000);

    mail = await h.flush();
    const confirmToken = tokenFrom(to(mail, s.tenant.email));
    expect((await anon.post(`/links/${confirmToken}/confirm`, { fixed: true, rating: 5 })).status).toBe(204);
    expect((await pm.get(`/requests/${requestId}`)).body.tenantRating).toBe(5);

    const dash = (await pm.get('/dashboard')).body;
    expect(dash.tiles).toMatchObject({ totalProperties: 1, openRequests: 0, closedThisPeriod: 1 });

    // Reports reflect the job.
    expect((await pm.get('/reports/summary')).body).toMatchObject({ totalRequests: 1, completedRequests: 1, pendingRequests: 0 });
    expect((await pm.get('/reports/vendors')).body.items[0]).toMatchObject({ vendor: 'Pipe Pros', jobsAssigned: 1, jobsCompleted: 1 });
    const fin = (await pm.get('/reports/financial')).body;
    expect(fin.totalCents).toBe(46000);
    expect(fin.byCategory[0]).toEqual({ category: 'Plumbing', totalCents: 46000 });
    const prop = (await pm.get(`/reports/properties/${s.property.id}`)).body;
    expect(prop.jobs[0]).toMatchObject({ ref: wo.ref, costCents: 46000, vendor: 'Pipe Pros' });
    expect(prop.jobs[0].files.map((f: { kind: string }) => f.kind)).toContain('completion_photo');
    expect(prop.jobs[0].files[0].url).toMatch(/X-Amz-Signature=/);
    expect((await h.app.inject({ method: 'GET', url: '/reports/expenses.csv?unexportedOnly=true', headers: { cookie: pm.cookie } })).body).toContain(wo.ref);
    const csv = await h.app.inject({ method: 'POST', url: '/reports/expenses/export', headers: { cookie: pm.cookie, origin: env.APP_URL } });
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain(`${wo.ref},Green Valley`);
    expect(csv.body).toContain('460.00');
    const again = await h.app.inject({ method: 'GET', url: '/reports/expenses.csv?unexportedOnly=true', headers: { cookie: pm.cookie } });
    expect(again.body.trim().split('\r\n')).toHaveLength(1); // header only: already exported
  });
});
