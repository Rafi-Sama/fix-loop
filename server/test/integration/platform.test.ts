import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { platformAdmins, platformSessions, securityEvents, users } from '../../src/db/schema/index.js';
import { newTotpSecret, totpCode, totpStep } from '../../src/lib/totp.js';
import { hashPassword } from '../../src/modules/auth/passwords.js';
import { mintLink } from '../../src/modules/links/links.service.js';
import { Client, createHarness, resetDb, seedPortfolio, signup, tokenFrom, type Harness } from '../helpers.js';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
  await resetDb(h.owner);
});
afterAll(() => h.close());

const PASSWORD = 'superadmin correct horse';
let adminSeq = 0;
async function superadmin() {
  const secret = newTotpSecret();
  const email = `ops${++adminSeq}@fixloop.test`;
  await h.db.insert(platformAdmins).values({ email, name: 'Ops', passwordHash: await hashPassword(PASSWORD), totpSecret: secret });
  const c = new Client(h.app);
  const r = await c.post('/platform/login', { email, password: PASSWORD, code: totpCode(secret, totpStep()) });
  expect(r.status).toBe(204);
  return { c, email, secret };
}
const meOf = async (c: Client) => (await c.get('/auth/me')).body as { id: string; org: { id: string; slug: string } };
const events = (type: string) => h.db.select().from(securityEvents).where(eq(securityEvents.type, type));

describe('email verification', () => {
  it('blocks the app until the emailed link is confirmed, then lets everything through', async () => {
    const c = await signup(h.app, 'Unverified Co', { verified: false });
    const me = (await c.get('/auth/me')).body;
    expect(me.emailVerified).toBe(false);
    const blocked = await c.get('/org');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('email_unverified');

    const mail = (await h.flush()).find((m) => m.to === me.email);
    expect(mail?.subject).toMatch(/Confirm your email/);
    const token = tokenFrom(mail);
    const anon = new Client(h.app);
    expect((await anon.get(`/links/${token}`)).body.purpose).toBe('email_verify');
    expect((await anon.post('/auth/verify-email', { token })).status).toBe(204);
    expect((await anon.post('/auth/verify-email', { token })).status).toBe(410);

    expect((await c.get('/auth/me')).body.emailVerified).toBe(true);
    expect((await c.get('/org')).status).toBe(200);
    expect((await events('auth.email_verified')).some((e) => e.userId === me.id)).toBe(true);
  });

  it('resends while unverified and is a no-op afterwards', async () => {
    const c = await signup(h.app, 'Resend Co', { verified: false });
    const me = await meOf(c);
    await h.flush();
    expect((await c.post('/auth/verify-email/resend')).status).toBe(202);
    const again = (await h.flush()).filter((m) => m.subject?.includes('Confirm your email'));
    expect(again).toHaveLength(1);
    await h.db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, me.id));
    expect((await c.post('/auth/verify-email/resend')).status).toBe(202);
    expect((await h.flush()).filter((m) => m.subject?.includes('Confirm your email'))).toHaveLength(0);
  });

  it('an accepted invite counts as a verified email', async () => {
    const admin = await signup(h.app);
    await admin.post('/org/users', { email: 'invitee.verify@example.com', name: 'Invitee' });
    const mail = (await h.flush()).find((m) => m.to === 'invitee.verify@example.com');
    const c = new Client(h.app);
    expect((await c.post('/auth/password-reset/complete', { token: tokenFrom(mail), password: 'another strong passphrase' })).status).toBe(200);
    expect((await c.get('/org')).status).toBe(200);
  });
});

describe('superadmin sign-in', () => {
  it('needs password and a fresh authenticator code, and never says which was wrong', async () => {
    const secret = newTotpSecret();
    await h.db.insert(platformAdmins).values({ email: 'gate@fixloop.test', name: 'Gate', passwordHash: await hashPassword(PASSWORD), totpSecret: secret });
    const c = new Client(h.app);
    const code = totpCode(secret, totpStep());
    const wrongCode = await c.post('/platform/login', { email: 'gate@fixloop.test', password: PASSWORD, code: code === '000000' ? '111111' : '000000' });
    const wrongPw = await c.post('/platform/login', { email: 'gate@fixloop.test', password: 'nope nope nope', code });
    const unknown = await c.post('/platform/login', { email: 'nobody@fixloop.test', password: PASSWORD, code });
    for (const r of [wrongCode, wrongPw, unknown]) {
      expect(r.status).toBe(401);
      expect(r.body.error.message).toBe('Invalid email, password or code');
    }
    expect((await c.post('/platform/login', { email: 'gate@fixloop.test', password: PASSWORD, code })).status).toBe(204);
    expect((await c.get('/platform/me')).body.email).toBe('gate@fixloop.test');
    // The same code can't be used twice.
    expect((await new Client(h.app).post('/platform/login', { email: 'gate@fixloop.test', password: PASSWORD, code })).status).toBe(401);
    expect((await events('platform.login_failed')).map((e) => e.detail.reason)).toEqual(expect.arrayContaining(['bad_code', 'bad_password', 'unknown_email']));
  });

  it('locks after 5 failures', async () => {
    const secret = newTotpSecret();
    await h.db.insert(platformAdmins).values({ email: 'lock@fixloop.test', name: 'Lock', passwordHash: await hashPassword(PASSWORD), totpSecret: secret });
    for (let i = 0; i < 5; i++) await new Client(h.app).post('/platform/login', { email: 'lock@fixloop.test', password: 'wrong wrong wrong', code: '000000' });
    const r = await new Client(h.app).post('/platform/login', { email: 'lock@fixloop.test', password: PASSWORD, code: totpCode(secret, totpStep()) });
    // Same answer as a wrong password: a locked account mustn't confirm the email is a superadmin.
    expect(r.status).toBe(401);
    expect(r.body.error.message).toBe('Invalid email, password or code');
    const [a] = await h.db.select().from(platformAdmins).where(eq(platformAdmins.email, 'lock@fixloop.test'));
    expect((await events('platform.locked')).filter((e) => e.platformAdminId === a!.id)).toHaveLength(1);
    // Lock expires; the next failure re-locks at once and that is logged too.
    await h.db.update(platformAdmins).set({ lockedUntil: new Date(Date.now() - 1000) }).where(eq(platformAdmins.id, a!.id));
    await new Client(h.app).post('/platform/login', { email: 'lock@fixloop.test', password: 'wrong wrong wrong', code: '000000' });
    expect((await events('platform.locked')).filter((e) => e.platformAdminId === a!.id)).toHaveLength(2);
  });

  it('rejects state-changing ops requests without our Origin, even with no firm session', async () => {
    const { c } = await superadmin();
    const firm = await meOf(await signup(h.app, 'Csrf Co'));
    for (const origin of [undefined, 'https://evil.example']) {
      const r = await h.app.inject({ method: 'POST', url: `/platform/orgs/${firm.org.id}/suspend`, remoteAddress: c.ip, headers: { cookie: c.cookie, ...(origin ? { origin } : {}) }, payload: { reason: 'csrf attempt' } });
      expect(r.statusCode).toBe(403);
    }
    expect((await c.get(`/platform/orgs/${firm.org.id}`)).body.suspendedAt).toBeNull();
  });

  it('keeps firm and superadmin sessions apart, and signs out an idle superadmin', async () => {
    const firm = await signup(h.app);
    expect((await firm.get('/platform/overview')).status).toBe(401);
    const { c } = await superadmin();
    expect((await c.get('/org')).status).toBe(401);
    expect((await c.get('/platform/overview')).status).toBe(200);
    await h.db.update(platformSessions).set({ lastSeenAt: new Date(Date.now() - 31 * 60_000) });
    expect((await c.get('/platform/overview')).status).toBe(401);
  });
});

describe('superadmin console', () => {
  it('suspends a firm everywhere at once, and un-suspends it', async () => {
    const { c: ops } = await superadmin();
    const pm = await signup(h.app, 'Suspend Me Co');
    const { slug } = await seedPortfolio(pm);
    const me = await meOf(pm);
    // A live tenant link to check later.
    const intake = new Client(h.app);
    expect((await intake.get(`/public/orgs/${slug}`)).status).toBe(200);

    expect((await ops.post(`/platform/orgs/${me.org.id}/suspend`, {})).status).toBe(400); // reason required
    expect((await ops.post(`/platform/orgs/${me.org.id}/suspend`, { reason: 'Chargeback and spam reports' })).status).toBe(204);
    expect((await ops.post(`/platform/orgs/${me.org.id}/suspend`, { reason: 'again' })).status).toBe(409);

    expect((await pm.get('/org')).status).toBe(401);
    const email = (await h.db.select({ email: users.email }).from(users).where(eq(users.id, me.id)))[0]!.email;
    const login = await new Client(h.app).post('/auth/login', { email, password: 'correct horse battery staple' });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('org_suspended');
    expect((await intake.get(`/public/orgs/${slug}`)).status).toBe(404);
    // No-login links (incl. "confirm your email") are dead, and the worker sends nothing (the signup email is still queued).
    const token = await mintLink(h.db, me.org.id, { subjectType: 'user', subjectId: me.id, purpose: 'email_verify', scopeId: me.id, ttlHours: 1 });
    expect((await intake.get(`/links/${token}`)).status).toBe(410);
    expect((await intake.post('/auth/verify-email', { token })).status).toBe(410);
    expect((await h.flush()).filter((m) => m.to === email)).toEqual([]);
    const detail = (await ops.get(`/platform/orgs/${me.org.id}`)).body;
    expect(detail.suspendedReason).toBe('Chargeback and spam reports');

    expect((await ops.post(`/platform/orgs/${me.org.id}/unsuspend`, { reason: 'Resolved with owner' })).status).toBe(204);
    expect((await new Client(h.app).post('/auth/login', { email, password: 'correct horse battery staple' })).status).toBe(200);
    const log = (await ops.get(`/platform/security-events?orgId=${me.org.id}&type=platform`)).body.items.map((e: { type: string }) => e.type);
    expect(log).toEqual(['platform.org_unsuspended', 'platform.org_suspended']);
  });

  it('lists firms with counts only, never business records', async () => {
    const { c: ops } = await superadmin();
    const pm = await signup(h.app, 'Counted Co');
    await seedPortfolio(pm);
    const r = await ops.get('/platform/orgs?q=Counted');
    expect(r.status).toBe(200);
    const firm = r.body.items[0];
    expect(firm).toMatchObject({ name: 'Counted Co', doors: 2, openWorkOrders: 0, users: 1 });
    expect(Object.keys(firm).sort()).toEqual(['adminEmail', 'createdAt', 'doors', 'id', 'lastActiveAt', 'name', 'openWorkOrders', 'requests30d', 'slug', 'suspendedAt', 'unverified', 'users']);
    // Per-user session columns (correlated subqueries) must find the signed-in admin's session.
    const [admin] = (await ops.get(`/platform/orgs/${firm.id}`)).body.users;
    expect(admin.activeSessions).toBe(1);
    expect(admin.lastSeenAt).not.toBeNull();
    const me = (await ops.get('/platform/admins')).body.find((a: { email: string; activeSessions: number }) => a.email.endsWith('@fixloop.test') && a.activeSessions > 0);
    expect(me).toBeTruthy();
  });

  it('revokes sessions, unlocks and deactivates a firm user, all logged', async () => {
    const { c: ops } = await superadmin();
    const pm = await signup(h.app);
    const me = await meOf(pm);
    await h.db.update(users).set({ failedLogins: 10, lockedUntil: new Date(Date.now() + 600_000) }).where(eq(users.id, me.id));
    expect((await ops.post(`/platform/users/${me.id}/unlock`)).status).toBe(204);
    expect((await ops.post(`/platform/users/${me.id}/revoke-sessions`, { reason: 'Lost laptop' })).status).toBe(204);
    expect((await pm.get('/org')).status).toBe(401);
    expect((await ops.post(`/platform/users/${me.id}/deactivate`, { reason: 'Account takeover' })).status).toBe(204);
    expect((await ops.post(`/platform/users/${me.id}/deactivate`, { reason: 'Account takeover' })).status).toBe(409);
    const log = (await ops.get(`/platform/security-events?userId=${me.id}&type=platform`)).body.items;
    expect(log.map((e: { type: string }) => e.type)).toEqual(['platform.user_deactivated', 'platform.sessions_revoked', 'platform.user_unlocked']);
    expect(log[0].platformAdminEmail).toMatch(/@fixloop\.test$/);
    expect(log[0].detail.reason).toBe('Account takeover');
  });

  it('records failed firm sign-ins and lockouts, and the API cannot erase the log', async () => {
    const { c: ops } = await superadmin();
    await new Client(h.app).post('/auth/login', { email: 'ghost@example.com', password: 'whatever whatever' });
    const fails = (await ops.get('/platform/security-events?failuresOnly=true&q=ghost')).body.items;
    expect(fails[0]).toMatchObject({ type: 'auth.login_failed', email: 'ghost@example.com', detail: { reason: 'unknown_email' } });
    // "false" means false (z.coerce.boolean would read any non-empty string as true).
    expect((await ops.get('/platform/security-events?failuresOnly=false&type=platform.login')).body.items.length).toBeGreaterThan(0);
    const denied = (q: Promise<unknown>) => q.then(() => 'allowed', (e: Error & { cause?: Error }) => String(e.cause?.message ?? e.message));
    expect(await denied(h.db.execute(sql`delete from security_events`))).toMatch(/permission denied/);
    expect(await denied(h.db.execute(sql`update security_events set type = 'x'`))).toMatch(/permission denied/);
  });

  it('marks an email verified or resends the link for a stuck user', async () => {
    const { c: ops } = await superadmin();
    const pm = await signup(h.app, 'Stuck Co', { verified: false });
    const me = await meOf(pm);
    expect((await ops.post(`/platform/users/${me.id}/resend-verification`)).status).toBe(202);
    expect((await ops.post(`/platform/users/${me.id}/mark-verified`, { reason: 'Confirmed by phone' })).status).toBe(204);
    expect((await pm.get('/org')).status).toBe(200);
    expect((await ops.post(`/platform/users/${me.id}/resend-verification`)).status).toBe(409);
  });
});
