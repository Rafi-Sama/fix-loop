import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { createDatabase, type Db } from '../src/db/client.js';
import { users } from '../src/db/schema/index.js';
import { dispatchNotifications } from '../src/jobs/dispatch.js';
import { createStorage } from '../src/modules/files/storage.js';
import type { Providers } from '../src/modules/notifications/providers.js';

export const env = loadEnv();
export const ORIGIN = env.APP_URL;

export interface Sent {
  channel: 'email' | 'sms';
  to: string;
  subject?: string;
  text: string;
}

export interface Harness {
  app: FastifyInstance;
  db: Db;
  owner: Db;
  sent: Sent[];
  /** Run the outbox once and return what was sent. */
  flush(): Promise<Sent[]>;
  close(): Promise<void>;
}

export async function createHarness(): Promise<Harness> {
  const appDb = createDatabase(env.DATABASE_URL, { max: 5, appName: 'test-api' });
  const ownerDb = createDatabase(env.DATABASE_OWNER_URL, { max: 3, appName: 'test-owner' });
  const storage = createStorage(env);
  await storage.ensureBucket();
  const app = await buildApp({ config: env, db: appDb.db, storage }, { logger: false });
  const sent: Sent[] = [];
  const providers: Providers = {
    email: async (m) => {
      sent.push({ channel: 'email', to: m.to, subject: m.subject, text: m.text });
      return { providerId: `t-${sent.length}` };
    },
    sms: async (to, body) => {
      sent.push({ channel: 'sms', to, text: body });
      return { providerId: `t-${sent.length}` };
    },
  };
  return {
    app,
    db: appDb.db,
    owner: ownerDb.db,
    sent,
    async flush() {
      const before = sent.length;
      while ((await dispatchNotifications(ownerDb.db, providers, env.APP_URL)) > 0);
      return sent.slice(before);
    },
    async close() {
      await app.close();
      await appDb.close();
      await ownerDb.close();
    },
  };
}

export async function resetDb(owner: Db) {
  const rows = await owner.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public'`);
  await owner.execute(sql.raw(`truncate ${rows.map((r) => `"${r.tablename}"`).join(', ')} cascade`));
}

/** Token from the link inside a sent message. */
export function tokenFrom(msg: Sent | undefined): string {
  const m = msg?.text.match(/\/l\/([A-Za-z0-9_-]{43})/);
  if (!m) throw new Error(`No link in message: ${msg?.text}`);
  return m[1]!;
}

// biome-ignore lint/suspicious/noExplicitAny: tests assert on response JSON field by field; typing every body would be noise.
type Json = any;

let ipSeq = 0;
export class Client {
  cookie = '';
  // Each client looks like a different device, so per-IP rate limits don't trip across tests.
  readonly ip = `10.${(++ipSeq >> 8) & 255}.${ipSeq & 255}.7`;
  constructor(private app: FastifyInstance) {}

  async req<T = Json>(method: InjectOptions['method'], url: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await this.app.inject({
      method,
      url,
      remoteAddress: this.ip,
      headers: { origin: ORIGIN, ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
      ...(body === undefined ? {} : { payload: body as object }),
    });
    const set = res.headers['set-cookie'];
    if (set) this.cookie = (Array.isArray(set) ? set[0]! : set).split(';')[0]!;
    return { status: res.statusCode, body: (res.body ? JSON.parse(res.body) : null) as T };
  }
  get = <T = Json>(url: string) => this.req<T>('GET', url);
  post = <T = Json>(url: string, body: unknown = {}) => this.req<T>('POST', url, body);
  patch = <T = Json>(url: string, body: unknown) => this.req<T>('PATCH', url, body);
}

let seq = 0;
/** A new firm and its admin. Verified by default (most tests aren't about verification); the confirm email stays queued. */
export async function signup(app: FastifyInstance, name = 'Acme PM', { verified = true } = {}) {
  const c = new Client(app);
  seq++;
  const r = await c.post('/auth/signup', { orgName: name, name: 'Pat Manager', email: `pm${seq}-${Date.now()}@example.com`, password: 'correct horse battery staple' });
  if (r.status !== 201) throw new Error(`signup failed ${JSON.stringify(r.body)}`);
  if (verified) await app.db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, r.body.userId));
  return c;
}

/** Upload a tiny real file to MinIO through the presigned POST, like a browser would. */
export async function uploadVia(start: { attachmentId: string; upload: { url: string; fields: Record<string, string> } }, mime = 'image/png') {
  const form = new FormData();
  for (const [k, v] of Object.entries(start.upload.fields)) form.append(k, v);
  form.append('file', new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], { type: mime }));
  const res = await fetch(start.upload.url, { method: 'POST', body: form });
  if (res.status >= 300) throw new Error(`upload failed ${res.status} ${await res.text()}`);
  return start.attachmentId;
}

/** Owner + multi-unit property + tenant + vendor, ready for a job. */
export async function seedPortfolio(c: Client) {
  const owner = (await c.post('/owners', { name: 'Olivia Owner', email: `owner-${Date.now()}@example.com`, approvalThresholdCents: 30000 })).body;
  const property = (await c.post('/properties', { ownerId: owner.id, nameRef: 'Green Valley', addressLine: '123 Main Street', city: 'Austin', state: 'tx', zip: '78701', type: 'multi_family' })).body;
  const [unit] = (await c.post(`/properties/${property.id}/units`, { labels: ['204', '205'] })).body;
  const tenant = (await c.post('/tenants', { unitId: unit.id, name: 'Tina Tenant', email: `tenant-${Date.now()}@example.com`, phone: '(512) 555-0100' })).body;
  const vendor = (await c.post('/vendors', { companyName: 'Pipe Pros', email: `vendor-${Date.now()}@example.com`, phone: '512-555-0199' })).body;
  const categories = (await c.get('/org/categories')).body as { id: string; name: string }[];
  const plumbing = categories.find((x) => x.name === 'Plumbing')!;
  const me = (await c.get('/auth/me')).body;
  return { owner, property, unit, tenant, vendor, plumbing, slug: me.org.slug as string };
}

/** Give a vendor a valid insurance certificate so dispatch isn't blocked. */
export async function insureVendor(c: Client, vendorId: string, expiresOn = '2099-01-01') {
  const start = (await c.post('/files/uploads', { subject: { type: 'vendor', id: vendorId }, kind: 'document', mime: 'application/pdf', sizeBytes: 7 })).body;
  await uploadVia(start, 'application/pdf');
  await c.post(`/files/uploads/${start.attachmentId}/complete`, { subject: { type: 'vendor', id: vendorId } });
  return (await c.post(`/vendors/${vendorId}/documents`, { type: 'insurance', attachmentId: start.attachmentId, expiresOn })).body;
}
