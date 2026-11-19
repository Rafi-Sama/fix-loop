#!/usr/bin/env node
// Screenshots for the landing page: runs ONE real repair through the running app (tenant report → vendor link →
// owner approval → closed), backdating between steps so the clocks read like a real day, and captures each screen.
//   node scripts/landing-shots.mjs <out-dir> <issue.jpg> <fixed.jpg>     (needs `pnpm dev` running and the demo firm)
// Adds one closed job (402 Oak St #A) to the demo firm; `pnpm seed:reset` removes it.
import { readFileSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { DEMO, DEV_DIR, WEB, psql, stripAnsi } from './lib.mjs';

const [out, issueJpg, fixedJpg] = process.argv.slice(2);
if (!out || !issueJpg || !fixedJpg) throw new Error('usage: landing-shots.mjs <out-dir> <issue.jpg> <fixed.jpg>');
mkdirSync(out, { recursive: true });
const { chromium } = createRequire(join(WEB, 'package.json'))('playwright');
const API = 'http://localhost:4000';
const ORIGIN = 'http://localhost:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let cookie = '';
async function call(method, path, body, pm = true) {
  const res = await fetch(API + path, {
    method,
    headers: { origin: ORIGIN, ...(pm ? { cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get('set-cookie');
  if (set && pm) cookie = set.split(';')[0];
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : undefined;
}
const post = (p, b = {}) => call('POST', p, b);
const get = (p) => call('GET', p);
const pub = (p, b = {}) => call('POST', p, b, false);

async function s3(upload, bytes, mime) {
  const form = new FormData();
  for (const [k, v] of Object.entries(upload.fields)) form.append(k, v);
  form.append('file', new Blob([bytes], { type: mime }));
  const res = await fetch(upload.url, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`S3 upload ${res.status}: ${await res.text()}`);
}

// The worker logs each email with its link; wait for the newest one to this address after `from` bytes.
const logFile = join(DEV_DIR, 'worker.log');
const logSize = () => statSync(logFile).size;
async function linkFor(email, template, from) {
  for (let i = 0; i < 60; i++) {
    const lines = stripAnsi(readFileSync(logFile).subarray(from).toString()).split('\n');
    const hit = lines.reverse().find((l) => l.includes(`→ ${email} `) && template.test(l) && l.includes('/l/'));
    if (hit) return /\/l\/([\w-]+)/.exec(hit)[1];
    await sleep(500);
  }
  throw new Error(`no ${template} link logged for ${email}`);
}

// Move everything recorded on this job back in time, so the next step happens "later".
let R, W;
async function age(interval) {
  const both = `('${R}'${W ? `,'${W}'` : ''})`;
  const sql = [
    `update maintenance_requests set created_at = created_at - interval '${interval}', status_changed_at = status_changed_at - interval '${interval}' where id = '${R}'`,
    ...['events', 'comments', 'attachments'].map((t) => `update ${t} set created_at = created_at - interval '${interval}' where subject_id in ${both}`),
    `update notifications set created_at = created_at - interval '${interval}', sent_at = sent_at - interval '${interval}' where subject_id in ${both}`,
  ];
  if (W) {
    sql.push(
      `update work_orders set ${['created_at', 'status_changed_at', 'assigned_at', 'accepted_at', 'completed_at', 'closed_at'].map((c) => `${c} = ${c} - interval '${interval}'`).join(', ')} where id = '${W}'`,
      `update quotes set created_at = created_at - interval '${interval}', updated_at = updated_at - interval '${interval}' where work_order_id = '${W}'`,
      `update approvals set decided_at = decided_at - interval '${interval}' where work_order_id = '${W}'`,
      `update appointments set created_at = created_at - interval '${interval}' where work_order_id = '${W}'`,
    );
  }
  const r = await psql(sql.join(';\n'));
  if (r.code !== 0) throw new Error(`backdating failed: ${r.out}`);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
const desk = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage();
const settle = async (p) => {
  await p.waitForLoadState('networkidle');
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(1400); // chart and pipe-step entrances
};
const shot = async (p, name, url, opts = {}) => {
  if (url) await p.goto(ORIGIN + url);
  await settle(p);
  await p.screenshot({ path: join(out, `${name}.png`), fullPage: true, ...opts });
  console.log('shot', name);
};

// --- sign in (API + browser)
await post('/auth/login', { email: DEMO.admin, password: DEMO.password });
await desk.goto(`${ORIGIN}/login`);
await desk.fill('input[type=email]', DEMO.admin);
await desk.fill('input[type=password]', DEMO.password);
await desk.click('button[type=submit]');
await desk.waitForURL(`${ORIGIN}/`);

const me = await get('/auth/me');
const slug = me.org.slug;
const list = (x) => x.items ?? x;
const oakProp = list(await get('/properties')).find((p) => p.addressLine === '402 Oak St');
const unitA = (await get(`/properties/${oakProp.id}`)).units.find((u) => u.label === 'A');
const plumbing = list(await get('/org/categories')).find((c) => c.name === 'Plumbing').id;
const vendors = list(await get('/vendors'));
const rivera = vendors.find((v) => v.companyName === 'Rivera Plumbing');
const TENANT = 'sam.patel@example.com';
const OWNER = 'm.chen@example.com';

// --- 1. tenant reports from the building link, with a photo
let mark = logSize();
{
  const bytes = readFileSync(issueJpg);
  const draft = await pub(`/public/orgs/${slug}/uploads`, { mime: 'image/jpeg', sizeBytes: bytes.length });
  await s3(draft.upload, bytes, 'image/jpeg');
  await pub(`/public/orgs/${slug}/uploads/${draft.attachmentId}/complete`, { draftId: draft.draftId });
  await pub(`/public/orgs/${slug}/requests`, {
    draftId: draft.draftId,
    contact: { name: 'Sam Patel', email: TENANT },
    propertyId: oakProp.id,
    unitId: unitA.id,
    categoryId: plumbing,
    title: 'Leak under the kitchen sink',
    description: 'The shut-off valve under the kitchen sink is dripping and green with corrosion. I put a bucket under it for now.',
    urgency: 'normal',
    permissionToEnter: 'yes',
    availabilityText: 'Home before 11 AM on weekdays',
    accessNotes: 'Side door, ring the bell.',
    photoIds: [draft.attachmentId],
  });
}
const reqRow = list(await get('/requests?limit=100')).find((r) => r.title === 'Leak under the kitchen sink' && !['closed', 'cancelled'].includes(r.status));
R = reqRow.id;
const tenantLink = await linkFor(TENANT, /request\.submitted\.tenant/, mark);
// The same form as the tenant sees it, filled in but not sent (the request above came through the same public API).
await phone.goto(`${ORIGIN}/r/${slug}/p/${oakProp.id}`);
await phone.getByLabel('Your name').fill('Sam Patel');
await phone.getByLabel('Email').fill(TENANT);
await phone.getByLabel('Your unit').selectOption(unitA.id);
await shot(phone, 'tenant-intake-contact');
await phone.getByRole('button', { name: 'Continue' }).click();
await shot(phone, 'tenant-intake-category');
await phone.getByText('Plumbing', { exact: true }).click();
await shot(phone, 'tenant-intake-selfhelp');
const onward = phone.getByRole('button', { name: /still|send|request|continue/i }).first();
if (!(await phone.getByLabel('Short title').count())) await onward.click();
await phone.getByLabel('Short title').fill('Leak under the kitchen sink');
await phone.getByLabel('What’s happening?').fill('The shut-off valve under the kitchen sink is dripping and green with corrosion. I put a bucket under it for now.');
await phone.locator('input[type=file]').first().setInputFiles(issueJpg);
await phone.getByLabel('When are you available?').fill('Home before 11 AM on weekdays');
await phone.getByLabel('Can the repair person enter if you’re not home?').selectOption('yes');
await phone.waitForTimeout(2500); // photo upload
await shot(phone, 'tenant-intake');
await shot(phone, 'tenant-received', `/l/${tenantLink}`);

// --- 2. PM triages seven minutes later: work order, compliance gate, assign
await age('7 minutes');
await shot(desk, 'pm-request', `/requests/${R}`);
const wo = await post(`/requests/${R}/work-orders`, { quoteRequired: true, requiredWork: 'Find the leak under the kitchen sink. Quote before replacing anything.' });
W = wo.id;
await shot(desk, 'pm-wo-draft', `/work-orders/${W}`);
try {
  await desk.getByRole('button', { name: /assign/i }).first().click();
  const dlg = desk.getByRole('dialog');
  await dlg.getByRole('checkbox').first().uncheck(); // show every vendor, not only plumbers
  await dlg.getByText('Northside Roofing').click();
  await desk.waitForTimeout(600);
  await desk.screenshot({ path: join(out, 'pm-compliance-gate.png') });
  await dlg.getByText('Rivera Plumbing').click();
  await desk.waitForTimeout(600);
  await desk.screenshot({ path: join(out, 'pm-assign.png') });
  console.log('shot pm-compliance-gate, pm-assign');
} catch (e) {
  console.log('assign dialog shots failed:', e.message.split('\n')[0]);
}
mark = logSize();
await post(`/work-orders/${W}/assign`, { vendorId: rivera.id, overrideReason: null });
const job = await linkFor(rivera.email, /\.vendor/, mark);

// --- 3. vendor accepts from the link nine minutes later, then quotes
await age('9 minutes');
await shot(phone, 'vendor-new-job', `/l/${job}`);
await shot(desk, 'pm-wo-waiting-vendor', `/work-orders/${W}`);
await pub(`/links/${job}/accept`);
await age('19 minutes');
await shot(phone, 'vendor-quote', `/l/${job}`);
await pub(`/links/${job}/quote`, { amountCents: 64000, description: 'Replace both shut-off valves and supply lines, re-seal the trap, replace the swollen cabinet floor panel.' });

// --- 4. PM sends the quote to the owner; owner approves in one tap
await age('4 minutes');
await shot(desk, 'pm-wo-quote', `/work-orders/${W}`);
mark = logSize();
await post(`/work-orders/${W}/send-to-owner`);
const approval = await linkFor(OWNER, /approval_requested\.owner/, mark);
await age('14 minutes');
await shot(phone, 'owner-approve', `/l/${approval}`);
await shot(desk, 'pm-wo-waiting-owner', `/work-orders/${W}`);
await pub(`/links/${approval}/decide`, { decision: 'approved', note: 'Go ahead. Thanks for the photo.' });

// --- 5. vendor books a window for tomorrow morning
await age('6 minutes');
await shot(phone, 'vendor-schedule', `/l/${job}`);
// Tomorrow 9–11 AM in the firm's timezone (America/Chicago), whatever this machine's clock says.
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(Date.now() + 24 * 3600e3));
const start = [14, 15].map((h) => new Date(`${day}T${h}:00:00Z`)).find((d) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }).format(d).startsWith('09'));
await pub(`/links/${job}/schedule`, { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 2 * 3600e3).toISOString() });
await shot(phone, 'tenant-scheduled', `/l/${tenantLink}`);
await shot(desk, 'pm-wo-scheduled', `/work-orders/${W}`);
await shot(phone, 'vendor-scheduled', `/l/${job}`);

// --- 6. next morning: start, finish with a photo and the invoice amount
await age('23 hours 57 minutes');
await pub(`/links/${job}/start`);
await age('92 minutes');
await shot(phone, 'vendor-in-progress', `/l/${job}`);
{
  const bytes = readFileSync(fixedJpg);
  const up = await pub(`/links/${job}/uploads`, { kind: 'completion_photo', mime: 'image/jpeg', sizeBytes: bytes.length });
  await s3(up.upload, bytes, 'image/jpeg');
  await pub(`/links/${job}/uploads/${up.attachmentId}/complete`);
  await pub(`/links/${job}/complete`, { notes: 'Replaced both shut-off valves and supply lines, re-sealed the trap. Ran water 10 minutes, dry.', invoiceAmountCents: 64000, invoiceNumber: 'RP-2291', photoAttachmentIds: [up.attachmentId] });
}

// --- 7. PM reviews and closes; tenant confirms
await age('22 minutes');
await shot(desk, 'pm-wo-review', `/work-orders/${W}`);
await shot(desk, 'pm-dashboard', '/');
mark = logSize();
await post(`/work-orders/${W}/close`, {});
const confirm = await linkFor(TENANT, /wo\.closed\.tenant/, mark);
await age('28 minutes');
await shot(phone, 'tenant-confirm', `/l/${confirm}`);
await pub(`/links/${confirm}/confirm`, { fixed: true, rating: 5, note: 'Dry as a bone. Luis was in and out in an hour.' });
await shot(desk, 'pm-wo-closed', `/work-orders/${W}`);

// --- the rest of the PM workspace
await shot(desk, 'pm-vendors', '/vendors');
await shot(desk, 'pm-work-orders', '/work-orders');
await shot(desk, 'pm-reports-vendors', '/reports/vendors');
await shot(desk, 'pm-reports-financial', '/reports/financial');
await browser.close();
console.log('done', { request: R, workOrder: W });
