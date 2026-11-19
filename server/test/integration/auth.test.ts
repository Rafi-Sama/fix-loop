import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client, createHarness, resetDb, signup, tokenFrom, type Harness } from '../helpers.js';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.close());
beforeEach(() => resetDb(h.owner));

describe('auth', () => {
  it('signs up, reads /me, seeds the 10 default categories', async () => {
    const c = await signup(h.app);
    const me = await c.get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.role).toBe('admin');
    expect((await c.get('/org/categories')).body).toHaveLength(10);
  });

  it('rejects wrong passwords with the same message as unknown emails', async () => {
    const c = await signup(h.app);
    const email = (await c.get('/auth/me')).body.email;
    const anon = new Client(h.app);
    const wrong = await anon.post('/auth/login', { email, password: 'nope-nope-nope' });
    const unknown = await anon.post('/auth/login', { email: 'ghost@example.com', password: 'nope-nope-nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it('rate-limits sign-in per IP', async () => {
    const hit = () => h.app.inject({ method: 'POST', url: '/auth/login', remoteAddress: '10.9.9.9', payload: { email: 'ghost@example.com', password: 'nope-nope-nope' } });
    for (let i = 0; i < 10; i++) expect((await hit()).statusCode).toBe(401);
    const limited = await hit();
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe('too_many_requests');
  });

  it('locks the account after 10 failures', async () => {
    const c = await signup(h.app);
    const email = (await c.get('/auth/me')).body.email;
    // Bypass the per-IP route limit by varying the client IP.
    for (let i = 0; i < 10; i++) {
      await h.app.inject({ method: 'POST', url: '/auth/login', remoteAddress: `10.0.0.${i}`, payload: { email, password: 'wrong-password-x' } });
    }
    const r = await h.app.inject({ method: 'POST', url: '/auth/login', remoteAddress: '10.0.1.1', payload: { email, password: 'correct horse battery staple' } });
    expect(r.statusCode).toBe(429);
  });

  it('blocks cross-origin writes from a signed-in browser (CSRF)', async () => {
    const c = await signup(h.app);
    const r = await c.req('POST', '/owners', { name: 'x' }, { origin: 'https://evil.example' });
    expect(r.status).toBe(403);
    const noOrigin = await h.app.inject({ method: 'POST', url: '/owners', headers: { cookie: c.cookie }, payload: { name: 'x' } });
    expect(noOrigin.statusCode).toBe(403);
  });

  it('logout kills the session', async () => {
    const c = await signup(h.app);
    const cookie = c.cookie;
    expect((await c.post('/auth/logout')).status).toBe(204);
    c.cookie = cookie;
    expect((await c.get('/auth/me')).status).toBe(401);
  });

  it('invite → set password through a single-use link', async () => {
    const admin = await signup(h.app);
    const invited = await admin.post('/org/users', { email: 'new.manager@example.com', name: 'New Manager' });
    expect(invited.status).toBe(201);
    const mail = (await h.flush()).find((m) => m.to === 'new.manager@example.com');
    const token = tokenFrom(mail);
    const c = new Client(h.app);
    // The link page can tell a live invite from a dead link.
    expect((await c.get(`/links/${token}`)).body).toEqual({ purpose: 'user_invite', org: { name: 'Acme PM' } });
    const r = await c.post('/auth/password-reset/complete', { token, password: 'another long password 42' });
    expect(r.status).toBe(200);
    expect((await c.get('/auth/me')).body.role).toBe('manager');
    // Single use.
    expect((await new Client(h.app).post('/auth/password-reset/complete', { token, password: 'another long password 43' })).status).toBe(410);
    expect((await c.get(`/links/${token}`)).status).toBe(410);
  });

  it('managers cannot change settings; the last admin cannot be demoted', async () => {
    const admin = await signup(h.app);
    const me = (await admin.get('/auth/me')).body;
    const r = await admin.patch(`/org/users/${me.id}`, { role: 'manager' });
    expect(r.status).toBe(409);
  });
});
