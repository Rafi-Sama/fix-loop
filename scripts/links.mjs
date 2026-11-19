#!/usr/bin/env node
// pnpm links: the newest no-login link per kind, read from the worker's log (emails/SMS are logged, not sent, in dev).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEV_DIR, color, log, stripAnsi } from './lib.mjs';

const file = join(DEV_DIR, 'worker.log');
if (!existsSync(file)) {
  log.fail('No worker log yet. Start everything with `pnpm dev`, then do something that sends a link.');
  process.exit(1);
}
// Strip ANSI colours, then split the pino-pretty output into one block per message.
const text = stripAnsi(readFileSync(file, 'utf8'));
const blocks = text.split(/\n(?=\[\d\d:\d\d:\d\d\.\d+\])/);

// Current log lines name the template; classify by it. KINDS (text patterns) is for older log blocks.
const BY_TEMPLATE = [
  ['Vendor job', /^wo\..*\.vendor$|^wo\.tenant_conflict$/],
  ['Owner approval', /^wo\.approval_(requested|resend)\.owner$/],
  ['Tenant tracking', /^(request\.submitted|wo\.accepted|wo\.scheduled)\.tenant$/],
  ['Tenant question', /^request\.needs_info(_nudge)?\.tenant$/],
  ['Tenant confirm fix', /^wo\.closed\.tenant$/],
  ['Tenant my-requests', /^tenant\.my_requests$/],
  ['Vendor profile', /^vendor\.invite$|^doc\.expiring\.vendor$/],
  ['Team invite', /^user\.invite$/],
  ['Password reset', /^user\.password_reset$/],
  ['Email confirmation', /^user\.verify_email$/],
];

const KINDS = [
  ['Vendor job', /New .* job|please accept or decline|Reminder: .*quote|Quote (approved|declined)|approval decided|more work|Job update/i],
  ['Owner approval', /Approval needed|approval reminder/i],
  ['Tenant tracking', /was received as|Appointment set|scheduled for/i],
  ['Tenant question', /more information|question/i],
  ['Tenant confirm fix', /Was it fixed|fixed\?/i],
  ['Tenant my-requests', /your requests/i],
  ['Vendor profile', /confirm your details|update your details|upload/i],
  ['Team invite', /invited you|join/i],
  ['Password reset', /Reset your password/i],
  ['Email confirmation', /Confirm your email/i],
];

const latest = new Map();
for (const b of blocks) {
  const url = /(https?:\/\/\S+\/l\/[A-Za-z0-9_-]+)/.exec(b)?.[1];
  if (!url) continue;
  // One-line format: `email → to · subject · link`. Older multi-line blocks still parse below.
  const line = /(?:email|sms) → (\S+) · (\S+) · (.*?)(?: · https?:\S+)?$/m.exec(b);
  const subject = line?.[3] ?? (/subject: "((?:[^"\\]|\\.)*)"/.exec(b)?.[1] ?? /text: "([^"]{0,70})/.exec(b)?.[1] ?? '').replace(/\\"/g, '"');
  const to = line?.[1] ?? /to: "([^"]*)"/.exec(b)?.[1] ?? '';
  const kind = (line ? BY_TEMPLATE.find(([, re]) => re.test(line[2])) : KINDS.find(([, re]) => re.test(b)))?.[0] ?? 'Other';
  latest.set(kind, { url, subject, to });
}
if (!latest.size) {
  log.warn('No links in the worker log yet. Assign a vendor, send a quote to an owner, or submit a tenant request.');
  process.exit(0);
}
console.log(color.bold('\nNewest link per kind (from .dev/worker.log)\n'));
for (const [kind, { url, subject, to }] of latest) {
  console.log(`${color.bold(kind.padEnd(20))} ${color.cyan(url)}\n${' '.repeat(21)}${color.gray(`${to} · ${subject}`)}`);
}
console.log(color.gray('\nLinks are single-purpose and expire; reassigning or closing a job revokes the vendor’s link.\n'));
