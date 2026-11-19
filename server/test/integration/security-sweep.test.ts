// Walks every registered route, so a new route that forgets requireAuth fails here.
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createHarness, signup, type Harness } from '../helpers.js';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.close());

/** [method, path] pairs from Fastify's route tree (printRoutes with full segments). */
function routes(tree: string) {
  const out: [string, string][] = [];
  const stack: string[] = [];
  for (const line of tree.split('\n')) {
    const m = line.match(/^(.*?)[├└]── (\S+) \(([^)]+)\)/);
    if (!m) continue;
    stack.length = m[1]!.length / 4;
    stack.push(m[2]!);
    for (const method of m[3]!.split(', ')) if (method !== 'HEAD' && method !== 'OPTIONS') out.push([method, stack.join('')]);
  }
  return out;
}

// Reachable before the email is confirmed: health, the verify screen's own calls, and the
// signed-out auth flows. Token links, public intake and /platform have their own auth.
const OPEN = /^\/(health|ready|links\/|public\/|platform\/|auth\/(me|login|logout|signup|password-reset|verify-email))/;

it('an unverified session reaches nothing but the verify screen', async () => {
  const c = await signup(h.app, 'Sweep Co', { verified: false });
  const all = routes(h.app.printRoutes({ commonPrefix: false }));
  expect(all.length).toBeGreaterThan(80);
  const leaks: string[] = [];
  for (const [method, path] of all) {
    const url = path.replace(/:\w+/g, '00000000-0000-4000-8000-000000000000').replace(/(.)\/$/, '$1');
    if (OPEN.test(url)) continue;
    const r = await c.req(method as 'GET', url, method === 'GET' || method === 'DELETE' ? undefined : {});
    // 400 = body validation, which runs before the auth preHandler and touches no data.
    if (r.body?.error?.code !== 'email_unverified' && r.body?.error?.code !== 'validation_failed') leaks.push(`${method} ${url} → ${r.status}`);
  }
  expect(leaks).toEqual([]);
  expect((await c.get('/auth/me')).status).toBe(200);
});
