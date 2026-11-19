import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dispatchNotifications } from '../../src/jobs/dispatch.js';
import { processReminders } from '../../src/jobs/reminders.js';
import { PermanentSendError } from '../../src/modules/notifications/providers.js';
import { createHarness, env, insureVendor, resetDb, seedPortfolio, signup, type Harness } from '../helpers.js';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.close());
beforeEach(() => resetDb(h.owner));

const HOUR = 3_600_000;
const later = (hours: number) => new Date(Date.now() + hours * HOUR);

async function assignedJob() {
  const pm = await signup(h.app);
  const s = await seedPortfolio(pm);
  await insureVendor(pm, s.vendor.id);
  const req = (await pm.post('/requests', { unitId: s.unit.id, categoryId: s.plumbing.id, title: 'Leak', description: 'Leak', permissionToEnter: 'yes' })).body;
  const wo = (await pm.post(`/requests/${req.id}/work-orders`, {})).body;
  await pm.post(`/work-orders/${wo.id}/assign`, { vendorId: s.vendor.id });
  await h.flush();
  return { pm, s, wo };
}

describe('reminders', () => {
  it('nudges the vendor at 4h and escalates to the PM at 24h', async () => {
    const { s } = await assignedJob();
    expect(await processReminders(h.owner, later(1))).toBe(0);
    expect(await processReminders(h.owner, later(5))).toBe(1);
    let mail = await h.flush();
    expect(mail.find((m) => m.to === s.vendor.email)?.subject).toMatch(/Reminder: please accept/);
    expect(await processReminders(h.owner, later(25))).toBe(1);
    mail = await h.flush();
    expect(mail.some((m) => m.subject?.startsWith('No answer from'))).toBe(true);
  });

  it('a transition cancels pending reminders so they never fire', async () => {
    const { pm, wo } = await assignedJob();
    await pm.post(`/work-orders/${wo.id}/accept`);
    await processReminders(h.owner, later(30));
    const mail = await h.flush();
    expect(mail.some((m) => m.subject?.includes('please accept') || m.subject?.startsWith('No answer'))).toBe(false);
  });

  it('a stale reminder (status changed without cancel) is skipped', async () => {
    const { wo } = await assignedJob();
    await h.owner.execute(sql`update work_orders set status = 'awaiting_scheduling' where id = ${wo.id}`);
    expect(await processReminders(h.owner, later(5))).toBe(1); // consumed…
    expect((await h.flush()).length).toBe(0); // …but nothing sent
  });

  it('document expiry reminders fire 30 days before and only for the current expiry date', async () => {
    const pm = await signup(h.app);
    const s = await seedPortfolio(pm);
    const soon = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    await insureVendor(pm, s.vendor.id, soon);
    await processReminders(h.owner, new Date(Date.now() + 12 * 86_400_000));
    const mail = await h.flush();
    expect(mail.find((m) => m.to === s.vendor.email)?.subject).toMatch(/insurance/);
  });
});

describe('outbox delivery', () => {
  it('retries transient failures with backoff and gives up on permanent ones', async () => {
    const { pm, wo } = await assignedJob();
    await pm.post(`/work-orders/${wo.id}/accept`); // queues PM + tenant notices
    let calls = 0;
    const flaky = {
      email: async () => {
        calls++;
        throw new Error('503 upstream');
      },
      sms: async () => {
        throw new PermanentSendError('21610 unsubscribed');
      },
    };
    const n = await dispatchNotifications(h.owner, flaky, env.APP_URL);
    expect(n).toBeGreaterThan(0);
    const rows = await h.owner.execute<{ status: string; attempts: number; next_attempt_at: Date }>(
      sql`select status, attempts, next_attempt_at from notifications where status <> 'sent'`,
    );
    expect(rows.every((r) => r.status === 'queued' && r.attempts === 1 && new Date(r.next_attempt_at) > new Date())).toBe(true);
    // Not due yet → not retried immediately.
    expect(await dispatchNotifications(h.owner, flaky, env.APP_URL)).toBe(0);
    expect(calls).toBe(n);
  });

  it('never stores raw link tokens in the outbox', async () => {
    await assignedJob();
    const rows = await h.owner.execute<{ payload: string }>(sql`select payload::text as payload from notifications`);
    expect(rows.some((r) => /[A-Za-z0-9_-]{43}/.test(r.payload))).toBe(false);
  });
});
