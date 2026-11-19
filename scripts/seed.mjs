#!/usr/bin/env node
// Demo data for every screen and state. Goes through the real API (so the state machine and validation apply),
// then backdates a little history with SQL so charts and "at risk" have something to show.
//   pnpm seed          seed once (skips if the demo firm exists)
//   pnpm seed:reset    delete the demo firm and seed again
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { deflateSync, crc32 } from 'node:zlib';
import { DEMO, SERVER, color, deleteOrg, ensureDocker, ensureEnv, log, portOpen, psql, waitFor } from './lib.mjs';

const API = process.env.API_URL ?? 'http://localhost:4000';
const ORIGIN = process.env.APP_URL ?? 'http://localhost:5173';
const reset = process.argv.includes('--reset');

// ---------------------------------------------------------------- http

let cookie = '';
async function call(method, path, body, { retry = 4, as } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { origin: ORIGIN, cookie: as ?? cookie, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get('set-cookie');
  if (set && !as) cookie = set.split(';')[0];
  const text = await res.text();
  if (res.status === 429 && retry > 0) {
    const wait = Number(/retry in (\d+)s/.exec(text)?.[1] ?? 20);
    log.info(`rate limited on ${path}, waiting ${wait}s`);
    await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
    return call(method, path, body, { retry: retry - 1, as });
  }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : undefined;
}
const post = (p, b = {}) => call('POST', p, b);
const patch = (p, b) => call('PATCH', p, b);
const get = (p) => call('GET', p);

// ---------------------------------------------------------------- tiny PNG/PDF generators (no deps)

function png(w, h, [r1, g1, b1], [r2, g2, b2]) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const t = (x + y) / (w + h);
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = r1 + (r2 - r1) * t;
      raw[o + 1] = g1 + (g2 - g1) * t;
      raw[o + 2] = b1 + (b2 - b1) * t;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PALETTES = [[[86, 120, 160], [200, 210, 220]], [[140, 110, 80], [230, 210, 180]], [[60, 120, 90], [190, 220, 200]], [[150, 70, 70], [240, 200, 190]]];
let photoN = 0;
const photo = () => png(320, 240, ...PALETTES[photoN++ % PALETTES.length]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');

async function s3(upload, bytes, mime) {
  const form = new FormData();
  for (const [k, v] of Object.entries(upload.fields)) form.append(k, v);
  form.append('file', new Blob([bytes], { type: mime }));
  const res = await fetch(upload.url, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`S3 upload ${res.status}: ${await res.text()}`);
}
async function upload(subject, kind, mime = 'image/png') {
  const bytes = mime === 'application/pdf' ? PDF : photo();
  const r = await post('/files/uploads', { subject, kind, mime, sizeBytes: bytes.length });
  await s3(r.upload, bytes, mime);
  await post(`/files/uploads/${r.attachmentId}/complete`, { subject });
  return r.attachmentId;
}

// ---------------------------------------------------------------- api lifecycle

let tempApi = null;
async function ensureApi() {
  if (await portOpen(4000)) return log.ok(`API already running on ${API}`);
  log.info('API not running; starting a temporary one');
  tempApi = spawn('npx', ['tsx', '--env-file=.env', 'src/server.ts'], { cwd: SERVER, stdio: 'ignore', detached: true });
  const up = await waitFor(async () => (await fetch(`${API}/health`).catch(() => null))?.ok === true, { timeoutMs: 60_000 });
  if (!up) throw new Error('API did not start (check server/.env and `pnpm check`)');
  log.ok('temporary API started');
}
const stopApi = () => tempApi && process.kill(-tempApi.pid, 'SIGTERM');

// ---------------------------------------------------------------- seed

async function existingOrg() {
  const r = await psql(`select org_id from users where lower(email) = '${DEMO.admin}'`);
  return r.out.trim() || null;
}

async function main() {
  log.step('Seeding demo data');
  ensureEnv();
  await ensureDocker();
  await ensureApi();

  const orgId = await existingOrg();
  if (orgId && !reset) {
    log.ok('demo firm already exists (use `pnpm seed:reset` to rebuild it)');
    return printCredentials();
  }
  if (orgId) {
    const del = await deleteOrg(orgId);
    if (del.code !== 0) throw new Error(`could not delete the old demo firm: ${del.out}`);
    log.ok('old demo firm deleted');
  }

  // --- firm, settings, team
  await post('/auth/signup', { orgName: 'Green Valley Property Co', name: 'Dana Whitfield', email: DEMO.admin, password: DEMO.password });
  // Sign-up leaves the email unconfirmed and the API refuses everything else until it is; demo accounts start confirmed.
  await psql(`update users set email_verified_at = now() where lower(email) = '${DEMO.admin}'`);
  const me = await get('/auth/me');
  await patch('/org', {
    phone: '(512) 555-0100',
    emergencyPhone: '(512) 555-0199',
    address: '400 Congress Ave, Suite 210, Austin, TX 78701',
    timezone: 'America/Chicago',
    defaultApprovalThresholdCents: 50000,
    emergencySpendLimitCents: 75000,
    invoiceOveragePct: 10,
    emergencyKeywords: ['gas', 'smell gas', 'flood', 'flooding', 'sparks', 'smoke', 'fire', 'no heat', 'carbon monoxide', 'sewage', 'burst pipe'],
  });
  await post('/org/categories', { name: 'Landscaping', photoRequired: false, sortOrder: 20 });
  const cats = await get('/org/categories');
  const cat = (n) => cats.find((c) => c.name === n).id;
  await patch(`/org/categories/${cat('Cleaning')}`, { active: false });

  const manager = await post('/org/users', { email: DEMO.manager, name: 'Marcus Lee', role: 'manager' });
  const former = await post('/org/users', { email: DEMO.deactivated, name: 'Riley Former', role: 'manager' });
  await post('/org/users', { email: DEMO.invited, name: 'Priya Invited', role: 'manager' });
  // Give the manager (and the soon-deactivated user) the demo password directly: invites normally set it by email link.
  const require = createRequire(`${SERVER}/package.json`);
  const { hash } = require('@node-rs/argon2');
  const pw = await hash(DEMO.password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  await psql(`update users set password_hash = '${pw}', email_verified_at = now() where id in ('${manager.id}', '${former.id}')`);
  await patch(`/org/users/${former.id}`, { active: false });
  log.ok('firm, settings, categories and team (admin, manager, invited, deactivated)');

  // --- owners, properties, units, tenants
  const owners = {};
  for (const [k, o] of Object.entries({
    chen: { name: 'Margaret Chen', email: 'm.chen@example.com', phone: '(512) 555-0141', approvalThresholdCents: 50000, externalId: 'OWN-104' },
    ridge: { name: 'Ridgeline Holdings LLC', email: 'ap@ridgeline.example.com', approvalThresholdCents: 100000, sendCompletionSummary: true, externalId: 'OWN-210' },
    alvarez: { name: 'Tom & Priya Alvarez', email: 'alvarez.home@example.com', phone: '(512) 555-0177', notifyMode: 'pm_forwards' },
    okoro: { name: 'Okoro Family Trust', email: 'trust@okoro.example.com', approvalThresholdCents: 25000 },
  })) owners[k] = await post('/owners', o);

  const props = {};
  for (const [k, p] of Object.entries({
    gv: { ownerId: owners.ridge.id, nameRef: 'Green Valley Apartments', addressLine: '123 Main Street', city: 'Austin', state: 'TX', zip: '78701', type: 'multi_family', notes: 'Main water shut-off in the basement utility room. Gate code 4412.', externalId: 'PROP-001' },
    birch: { ownerId: owners.chen.id, nameRef: 'Birch Lane House', addressLine: '18 Birch Ln', city: 'Austin', state: 'TX', zip: '78704', type: 'single_family', notes: 'Lockbox on the side gate, code 2290.' },
    oak: { ownerId: owners.chen.id, nameRef: 'Oak Street Duplex', addressLine: '402 Oak St', city: 'Round Rock', state: 'TX', zip: '78664', type: 'multi_family', emergencyPhone: '(512) 555-0400' },
    elm: { ownerId: owners.alvarez.id, nameRef: 'Elm Court Townhome', addressLine: '7 Elm Ct', city: 'Pflugerville', state: 'TX', zip: '78660', type: 'townhouse' },
    cedar: { ownerId: owners.okoro.id, nameRef: 'Cedar Ridge Condo', addressLine: '900 Cedar Ridge Dr #3C', city: 'Austin', state: 'TX', zip: '78745', type: 'condo' },
    old: { ownerId: owners.okoro.id, nameRef: 'Sold: 55 Pecan St', addressLine: '55 Pecan St', city: 'Austin', state: 'TX', zip: '78702', type: 'single_family' },
  })) props[k] = await post('/properties', p);
  const gv = await post(`/properties/${props.gv.id}/units`, { labels: ['101', '102', '103', '104', '201', '202', '203', '204', '301', '302'] });
  const oak = await post(`/properties/${props.oak.id}/units`, { labels: ['A', 'B'] });
  const mainUnit = async (id) => (await get(`/properties/${id}`)).units[0];
  const [birch, elm, cedar] = await Promise.all([mainUnit(props.birch.id), mainUnit(props.elm.id), mainUnit(props.cedar.id)]);
  const u = (l) => gv.find((x) => x.label === l);
  await patch(`/units/${u('302').id}`, { archived: true });
  await patch(`/properties/${props.old.id}`, { archived: true });

  const T = {};
  for (const [k, t] of Object.entries({
    jordan: { unitId: u('204').id, name: 'Jordan Reyes', email: 'jordan.reyes@example.com', phone: '(512) 555-0204', smsConsent: true },
    aisha: { unitId: u('101').id, name: 'Aisha Bello', email: 'aisha.b@example.com', phone: '(512) 555-0101' },
    marcusT: { unitId: u('102').id, name: 'Marcus Brown', phone: '(512) 555-0102', occupancyStatus: 'notice_given' },
    wen: { unitId: u('103').id, name: 'Wen Zhao', email: 'wen.zhao@example.com' },
    gabe: { unitId: u('201').id, name: 'Gabriel Ortiz', email: 'gabe.o@example.com', phone: '(512) 555-0221', smsConsent: true },
    past: { unitId: u('202').id, name: 'Former Tenant Sam', email: 'sam.past@example.com', occupancyStatus: 'past' },
    okafor: { unitId: birch.id, name: 'The Okafor family', email: 'okafor@example.com', phone: '(512) 555-0188' },
    patel: { unitId: oak[0].id, name: 'Sam Patel', email: 'sam.patel@example.com' },
    kim: { unitId: oak[1].id, name: 'Hana Kim', phone: '(512) 555-0402', smsConsent: true },
    novak: { unitId: elm.id, name: 'Lena Novak', email: 'lena.novak@example.com', phone: '(512) 555-0133' },
    diaz: { unitId: cedar.id, name: 'Carlos Díaz', email: 'carlos.diaz@example.com' },
  })) T[k] = await post('/tenants', t);
  log.ok('4 owners, 6 properties (1 archived), 15 units (1 archived), 11 tenants');

  // --- vendors with every compliance state
  const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const V = {};
  for (const [k, v] of Object.entries({
    plumb: { companyName: 'Rivera Plumbing', contactName: 'Luis Rivera', email: 'luis@riveraplumbing.example.com', phone: '(512) 555-0311', categoryIds: [cat('Plumbing')], coverageCities: ['austin', 'round rock'], coverageZips: ['78701', '78704', '78745'], availabilityText: 'Mon–Fri 7–5, emergencies 24/7', smsConsent: true, externalId: 'V-1001' },
    hvac: { companyName: 'Apex HVAC', contactName: 'Dee Morgan', email: 'service@apexhvac.example.com', phone: '(512) 555-0322', categoryIds: [cat('HVAC')], coverageCities: ['austin', 'pflugerville'], availabilityText: 'Mon–Sat 8–6' },
    roof: { companyName: 'Northside Roofing', contactName: 'Kev Brandt', email: 'kev@northsideroof.example.com', phone: '(512) 555-0333', categoryIds: [cat('Roofing'), cat('General maintenance')], coverageCities: ['austin', 'pflugerville', 'round rock'] },
    elec: { companyName: 'BrightLine Electric', contactName: 'Priya Shah', email: 'dispatch@brightline.example.com', phone: '(512) 555-0344', categoryIds: [cat('Electrical')], coverageCities: ['austin', 'round rock'] },
    handy: { companyName: 'Fix-It Fred', contactName: 'Fred Okoye', phone: '(512) 555-0355', categoryIds: [cat('General maintenance'), cat('Painting'), cat('Appliance repair')], coverageCities: ['austin'] },
    pest: { companyName: 'GreenShield Pest', contactName: 'Ana Ruiz', email: 'ana@greenshield.example.com', categoryIds: [cat('Pest control')], coverageCities: ['austin', 'round rock'] },
    gone: { companyName: 'Budget Appliance Co', email: 'hello@budgetappliance.example.com', categoryIds: [cat('Appliance repair')], coverageCities: ['austin'], notes: 'Stopped using after two no-shows in 2026.' },
  })) V[k] = await post('/vendors', v);
  const doc = async (k, type, expiresOn, label) => {
    const id = await upload({ type: 'vendor', id: V[k].id }, 'document', 'application/pdf');
    await post(`/vendors/${V[k].id}/documents`, { type, attachmentId: id, expiresOn, label });
  };
  await doc('plumb', 'insurance', day(220), 'General liability $1M');
  await doc('plumb', 'license', day(400), 'TX master plumber M-40211');
  await doc('plumb', 'w9', null, 'W-9 2026');
  await doc('hvac', 'insurance', day(12), 'General liability $1M'); // expiring
  await doc('roof', 'insurance', day(-9), 'General liability (lapsed)'); // expired
  await doc('elec', 'insurance', day(300), 'GL + workers comp');
  await doc('elec', 'license', day(-30), 'TDLR electrical (lapsed)'); // licence expired → expired
  await doc('pest', 'insurance', day(150), 'GL $2M');
  await patch(`/vendors/${V.gone.id}`, { active: false });
  log.ok('7 vendors: compliant, expiring, expired insurance, expired licence, missing, inactive');

  // --- requests and work orders in every state
  const req = (unitId, tenantId, f) => post('/requests', { unitId, tenantId, permissionToEnter: 'yes', availabilityText: 'Weekday mornings', ...f });
  const wo = (rid, b = {}) => post(`/requests/${rid}/work-orders`, b);
  const A = (id, path, b = {}) => post(`/work-orders/${id}/${path}`, b);
  const photos = async (rid, n = 1) => {
    for (let i = 0; i < n; i++) await upload({ type: 'request', id: rid }, 'issue_photo');
  };
  const slot = (days, h) => {
    const s = new Date();
    s.setDate(s.getDate() + days);
    s.setHours(h, 0, 0, 0);
    return { startsAt: s.toISOString(), endsAt: new Date(s.getTime() + 2 * 3600e3).toISOString() };
  };
  const finish = async (id, cents, notes = 'Replaced worn parts, tested, cleaned up.') => {
    const ph = await upload({ type: 'work_order', id }, 'completion_photo');
    const ph2 = await upload({ type: 'work_order', id }, 'completion_photo');
    const inv = await upload({ type: 'work_order', id }, 'invoice', 'application/pdf');
    await A(id, 'complete', { notes, invoiceAmountCents: cents, invoiceNumber: `INV-${2000 + photoN}`, invoiceAttachmentId: inv, photoAttachmentIds: [ph, ph2] });
  };
  // Spend above the owner's threshold needs their OK; demo jobs record it as approved by phone.
  const closeJob = (id, body = {}) =>
    A(id, 'close', body).catch((e) => {
      if (!String(e.message).includes('owner_approval_required')) throw e;
      return A(id, 'close', { ...body, ownerApprovedOffline: true, note: 'Owner approved by phone' });
    });
  const fullJob = async (unitId, tenantId, vendor, f, cents, estimate = cents) => {
    const r = await req(unitId, tenantId, f);
    await photos(r.id);
    const w = await wo(r.id, { estimatedCostCents: estimate });
    await A(w.id, 'assign', { vendorId: V[vendor].id, overrideReason: ['roof', 'handy', 'elec'].includes(vendor) ? 'Renewal confirmed by phone' : null });
    await A(w.id, 'accept');
    await A(w.id, 'appointments', slot(1, 10));
    await A(w.id, 'start');
    await finish(w.id, cents);
    await closeJob(w.id);
    return { r, w };
  };

  // Closed history (backdated below for the charts and reports).
  const history = [];
  history.push(await fullJob(u('204').id, T.jordan.id, 'plumb', { categoryId: cat('Plumbing'), title: 'Kitchen Sink Leak', description: 'Water is leaking from the pipe underneath the kitchen sink.', accessNotes: 'Dog is friendly, keep the bedroom door closed.', pets: 'One dog' }, 23500, 25000));
  history.push(await fullJob(birch.id, T.okafor.id, 'hvac', { categoryId: cat('HVAC'), title: 'Furnace not igniting', description: 'Clicks but never lights.', urgency: 'high' }, 41000, 40000));
  history.push(await fullJob(oak[1].id, T.kim.id, 'elec', { categoryId: cat('Electrical'), title: 'Bathroom fan dead', description: 'Fan stopped, light still works.' }, 18500));
  history.push(await fullJob(u('101').id, T.aisha.id, 'pest', { categoryId: cat('Pest control'), title: 'Roaches under the sink', description: 'Seeing a few every night.' }, 15000));
  history.push(await fullJob(elm.id, T.novak.id, 'roof', { categoryId: cat('Roofing'), title: 'Missing shingles after storm', description: 'Several shingles on the driveway.' }, 96000, 90000));
  history.push(await fullJob(cedar.id, T.diaz.id, 'plumb', { categoryId: cat('Plumbing'), title: 'Water heater pilot out', description: 'No hot water since this morning.', urgency: 'high' }, 32000));
  history.push(await fullJob(u('201').id, T.gabe.id, 'handy', { categoryId: cat('Painting'), title: 'Patch and paint bedroom wall', description: 'Hole from a door handle.', urgency: 'low' }, 27500));
  history.push(await fullJob(u('103').id, T.wen.id, 'elec', { categoryId: cat('Electrical'), title: 'Breaker keeps tripping', description: 'Kitchen circuit trips when the microwave runs.' }, 22000));

  // Closed with an invoice overage the PM confirmed.
  {
    const r = await req(oak[0].id, T.patel.id, { categoryId: cat('Plumbing'), title: 'Slow shower drain', description: 'Takes 10 minutes to drain.' });
    const w = await wo(r.id, { estimatedCostCents: 15000 });
    await A(w.id, 'assign', { vendorId: V.plumb.id });
    await A(w.id, 'accept');
    await A(w.id, 'appointments', slot(1, 9));
    await A(w.id, 'start');
    await finish(w.id, 19800, 'Root intrusion; snaked the main line too.');
    await closeJob(w.id, { confirmOverage: true, note: 'Main line work agreed on site.' });
    history.push({ r, w });
  }

  // Completed, waiting on your review (invoice over the estimate, so closing shows the overage check).
  const rDisp = await req(u('101').id, T.aisha.id, { categoryId: cat('Appliance repair'), title: 'Garbage disposal jammed', description: 'Hums but does not spin. Reset button did not help.' });
  await photos(rDisp.id, 2);
  const wDisp = await wo(rDisp.id, { estimatedCostCents: 18000 });
  await A(wDisp.id, 'assign', { vendorId: V.handy.id, overrideReason: 'Fred is the only one available today; COI requested.' });
  await A(wDisp.id, 'accept');
  await A(wDisp.id, 'appointments', slot(1, 13));
  await A(wDisp.id, 'start');
  await finish(wDisp.id, 21000);

  // Quote waiting on your decision (over threshold) and one with the owner (direct link).
  const rAc = await req(birch.id, T.okafor.id, { categoryId: cat('HVAC'), title: 'AC blowing warm air', description: 'Upstairs unit runs but the air is warm. Filter was changed last month.', urgency: 'high' });
  const wAc = await wo(rAc.id, { quoteRequired: true, estimatedCostCents: 40000, requiredWork: 'Diagnose the upstairs condenser. Quote before any repair over $150.' });
  await A(wAc.id, 'assign', { vendorId: V.hvac.id });
  await A(wAc.id, 'accept');
  await A(wAc.id, 'quotes', { amountCents: 64000, description: 'Replace run capacitor and contactor, recharge refrigerant (2 lb R-410A).' });

  const rLeak = await req(u('301').id, null, { categoryId: cat('Roofing'), title: 'Ceiling stain top floor', description: 'Brown stain spreading after rain.' });
  await photos(rLeak.id);
  const wLeak = await wo(rLeak.id, { quoteRequired: true });
  await A(wLeak.id, 'assign', { vendorId: V.roof.id, overrideReason: 'COI renewal in progress, confirmed by phone.' });
  await A(wLeak.id, 'accept');
  await A(wLeak.id, 'quotes', { amountCents: 185000, description: 'Patch flashing and replace 12 sq ft of decking.' });
  await A(wLeak.id, 'send-to-owner');

  // Quote rejected, revised (v2) and approved with the owner's phone OK → awaiting scheduling.
  const rFence = await req(elm.id, T.novak.id, { categoryId: cat('General maintenance'), title: 'Back fence leaning', description: 'Two posts rotted at the base.' });
  const wFence = await wo(rFence.id, { quoteRequired: true });
  await A(wFence.id, 'assign', { vendorId: V.roof.id, overrideReason: 'Owner preference' });
  await A(wFence.id, 'accept');
  await A(wFence.id, 'quotes', { amountCents: 98000, description: 'Replace 6 posts and 3 panels.' });
  await A(wFence.id, 'quote-decision', { decision: 'reject', next: 'awaiting_quote', note: 'Only the two rotted posts please.' });
  await A(wFence.id, 'quotes', { amountCents: 52000, description: 'Replace 2 posts, re-hang panels.' });
  await A(wFence.id, 'quote-decision', { decision: 'approve', ownerApprovedOffline: true, note: 'Tom approved by phone.' });

  // Waiting on vendor: awaiting acceptance, scheduled (after a no-access), in progress, sent back for more work.
  const rOut = await req(u('203').id, null, { categoryId: cat('Electrical'), title: 'Hallway outlets dead', description: 'Three outlets in the hallway stopped working. Breaker looks fine.' });
  const wOut = await wo(rOut.id);
  await A(wOut.id, 'assign', { vendorId: V.elec.id, overrideReason: 'Licence renewal pending; insurance current.' });

  const rGut = await req(oak[0].id, T.patel.id, { categoryId: cat('General maintenance'), title: 'Gutter cleaning', description: 'Gutters overflowing on the front side.', urgency: 'low' });
  const wGut = await wo(rGut.id);
  await A(wGut.id, 'assign', { vendorId: V.roof.id, overrideReason: 'Low-risk ground work' });
  await A(wGut.id, 'accept');
  await A(wGut.id, 'appointments', slot(1, 10));
  await A(wGut.id, 'no-access', { reason: 'tenant_no_show', note: 'Nobody home, gate locked.' });
  await A(wGut.id, 'appointments', slot(3, 10));

  const rToilet = await req(u('102').id, T.marcusT.id, { categoryId: cat('Plumbing'), title: 'Running toilet', description: 'Toilet keeps running after flushing.' });
  const wToilet = await wo(rToilet.id);
  await A(wToilet.id, 'assign', { vendorId: V.plumb.id });
  await A(wToilet.id, 'accept');
  await A(wToilet.id, 'appointments', slot(1, 15));
  await A(wToilet.id, 'start');

  const rDoor = await req(u('201').id, T.gabe.id, { categoryId: cat('General maintenance'), title: 'Front door sticks', description: 'Hard to lock, rubs at the top.' });
  const wDoor = await wo(rDoor.id);
  await A(wDoor.id, 'assign', { vendorId: V.handy.id, overrideReason: 'Small job' });
  await A(wDoor.id, 'accept');
  await A(wDoor.id, 'appointments', slot(1, 11));
  await A(wDoor.id, 'start');
  await finish(wDoor.id, 9500, 'Planed the top edge.');
  await A(wDoor.id, 'more-work', { note: 'Deadbolt still doesn’t line up with the strike plate.' });

  // Emergency fast path: accepted straight to in progress.
  const rFlood = await req(cedar.id, T.diaz.id, { categoryId: cat('Plumbing'), title: 'Burst pipe under bathroom sink', description: 'Water spraying, shut-off valve turned. Flooding the bathroom floor.', urgency: 'emergency' });
  const wFlood = await wo(rFlood.id);
  await A(wFlood.id, 'assign', { vendorId: V.plumb.id });
  await A(wFlood.id, 'start');

  // Draft (waiting on you), cancelled work order, and requests in triage.
  const rPaint = await req(u('201').id, null, { categoryId: cat('Painting'), title: 'Touch-up paint after move-out', description: 'Scuffs in living room and hallway, about 3 walls.', urgency: 'low' });
  await wo(rPaint.id, { description: 'Touch-up paint, living room and hallway', estimatedCostCents: 30000 });
  const rWindow = await req(u('104').id, null, { categoryId: cat('General maintenance'), title: 'Window screen torn', description: 'Bedroom window screen.', urgency: 'low' });
  const wWindow = await wo(rWindow.id);
  await A(wWindow.id, 'cancel', { reason: 'Tenant fixed it themselves' });
  await post(`/requests/${rWindow.id}/close`, { reason: 'Resolved by tenant' });

  const rHeat = await req(u('204').id, T.jordan.id, { categoryId: cat('HVAC'), title: 'No heat in bedroom', description: 'Bedroom radiator is cold, rest of the unit is fine.', urgency: 'emergency' });
  await photos(rHeat.id);
  const rAnts = await req(birch.id, T.okafor.id, { categoryId: cat('Pest control'), title: 'Ants in the kitchen', description: 'Trail of small ants along the counter by the window.' });
  await post(`/requests/${rAnts.id}/needs-info`, { question: 'Could you send a photo of where they come in, and are they inside cabinets too?' });
  await req(u('103').id, T.wen.id, { categoryId: cat('Other'), title: 'Mailbox lock broken', description: 'Key turns but the door will not open.', urgency: 'low' });
  await req(oak[1].id, T.kim.id, { categoryId: cat('Landscaping'), title: 'Tree branch over the roof', description: 'Large limb touching the gutter.' });
  const rDup = await req(u('204').id, T.jordan.id, { categoryId: cat('HVAC'), title: 'Bedroom heater', description: 'Same as my other request.' });
  await post(`/requests/${rDup.id}/close`, { reason: 'Duplicate request: see No heat in bedroom' });
  const rCancel = await req(u('104').id, null, { categoryId: cat('Other'), title: 'Doorbell not working', description: 'Logged by mistake.', urgency: 'low' });
  await post(`/requests/${rCancel.id}/cancel`, { reason: 'Entered by mistake' });

  // Notes on the timeline.
  await post(`/requests/${rHeat.id}/comments`, { body: 'Called Jordan, space heater dropped off as a stopgap.', visibility: 'internal' });
  await post(`/work-orders/${wAc.id}/comments`, { body: 'Margaret prefers a call before anything over $500.', visibility: 'internal' });
  await post(`/work-orders/${wGut.id}/comments`, { body: 'Please text Sam the morning of the visit.', visibility: 'shared' });

  // Public intake: an unverified tenant through the building QR link, with a photo, plus a self-help "fixed it".
  const slug = me.org.slug;
  {
    const bytes = photo();
    const draft = await call('POST', `/public/orgs/${slug}/uploads`, { mime: 'image/png', sizeBytes: bytes.length }, { as: '' });
    await s3(draft.upload, bytes, 'image/png');
    await call('POST', `/public/orgs/${slug}/uploads/${draft.attachmentId}/complete`, { draftId: draft.draftId }, { as: '' });
    await call('POST', `/public/orgs/${slug}/requests`, { draftId: draft.draftId, contact: { name: 'Alex Visitor', email: 'alex.subletter@example.com' }, propertyId: props.gv.id, unitId: u('104').id, categoryId: cat('Plumbing'), title: 'Bathtub faucet drips', description: 'Hot side drips constantly.', urgency: 'normal', permissionToEnter: 'only_if_home', availabilityText: 'Evenings', photoIds: [draft.attachmentId] }, { as: '' });
    await call('POST', `/public/orgs/${slug}/deflections`, { categoryId: cat('Electrical'), selfHelpKey: 'breaker_gfci' }, { as: '' });
  }
  log.ok('requests and work orders in every state (draft → closed, cancelled, emergency, owner approval, overage, no-access, more work)');

  // --- history: spread closed jobs over six months, mark some open ones at risk, and record tenant ratings.
  const months = [5, 4, 4, 3, 2, 2, 1, 1, 0];
  const sql = [];
  history.forEach(({ r, w }, i) => {
    const m = months[i % months.length];
    const at = `now() - interval '${m} months' - interval '${(i * 3) % 20} days'`;
    sql.push(`update maintenance_requests set created_at = ${at} - interval '3 days', status_changed_at = ${at} where id = '${r.id}'`);
    sql.push(`update work_orders set created_at = ${at} - interval '3 days', assigned_at = ${at} - interval '70 hours', accepted_at = ${at} - interval '70 hours' + interval '${2 + (i % 5) * 3} hours', completed_at = ${at} - interval '4 hours', closed_at = ${at}, status_changed_at = ${at} where id = '${w.id}'`);
    sql.push(`update expenses set incurred_on = ${at} where work_order_id = '${w.id}'`);
  });
  sql.push(`update work_orders set status_changed_at = now() - interval '30 hours', assigned_at = now() - interval '30 hours' where id = '${wOut.id}'`);
  sql.push(`update work_orders set expected_completion_at = now() - interval '1 day', status_changed_at = now() - interval '2 days' where id = '${wToilet.id}'`);
  sql.push(`update work_orders set status_changed_at = now() - interval '26 hours' where id = '${wDisp.id}'`);
  sql.push(`update maintenance_requests set tenant_confirmed = 'fixed', tenant_rating = 5 where id = '${history[0].r.id}'`);
  sql.push(`update maintenance_requests set tenant_confirmed = 'fixed', tenant_rating = 4 where id = '${history[1].r.id}'`);
  const back = await psql(sql.join(';\n'));
  if (back.code !== 0) throw new Error(`backdating failed: ${back.out}`);
  log.ok('history backdated over 6 months, 2 jobs at risk, tenant ratings recorded');

  printCredentials(slug, props.gv.id);
}

function printCredentials(slug, propertyId) {
  console.log(`
${color.bold('Demo firm: Green Valley Property Co')}
  Admin     ${color.cyan(DEMO.admin)}  /  ${color.cyan(DEMO.password)}
  Manager   ${color.cyan(DEMO.manager)}  /  ${color.cyan(DEMO.password)}
  ${color.gray(`Deactivated ${DEMO.deactivated} (can't sign in) · Invite pending ${DEMO.invited}`)}
  ${slug ? `Tenant intake  ${ORIGIN}/r/${slug}\n  Building QR    ${ORIGIN}/r/${slug}/p/${propertyId}` : `${color.gray('Tenant intake link: Settings → Request link')}`}
  ${color.gray('Vendor / owner / tenant link pages: run `pnpm links` while `pnpm dev` is running.')}
`);
}

main()
  .catch((e) => {
    log.fail(e.message);
    process.exitCode = 1;
  })
  .finally(stopApi);
