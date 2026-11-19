/**
 * Message templates. Plain text only: user-supplied strings (titles, notes) are never rendered as HTML,
 * which rules out HTML injection in emails. SMS bodies stay under ~2 segments.
 * shortcut: text-only email, add an escaped HTML layout with the firm logo when design is ready.
 */
type Vars = Record<string, string | number | null>;
interface Rendered {
  subject: string;
  text: string;
  sms: string;
}
type Template = (v: Vars, url: string | null) => Rendered;

const s = (v: Vars, k: string) => String(v[k] ?? '');
const money = (v: Vars, k: string) => (typeof v[k] === 'number' ? `$${((v[k] as number) / 100).toFixed(2)}` : '');
const withLink = (text: string, url: string | null) => (url ? `${text}\n\n${url}` : text);
const firm = (v: Vars) => s(v, 'orgName');

const t = (subject: (v: Vars) => string, body: (v: Vars) => string, sms?: (v: Vars) => string): Template => (v, url) => ({
  subject: subject(v),
  text: withLink(body(v), url),
  sms: withLink(`${firm(v)}: ${(sms ?? body)(v)}`, url),
});

export const templates = {
  'request.submitted.pm': t(
    (v) => `New request ${s(v, 'ref')}: ${s(v, 'title')}`,
    (v) => `${s(v, 'ref')} at ${s(v, 'address')} (${s(v, 'priority')}): ${s(v, 'title')}`,
  ),
  'request.submitted.tenant': t(
    (v) => `We received your request ${s(v, 'ref')}`,
    (v) =>
      `Your maintenance request "${s(v, 'title')}" was received as ${s(v, 'ref')}. Track it here. ` +
      `This form does not replace emergency services: if anyone is in danger call 911, then ${s(v, 'emergencyPhone')}.`,
    (v) => `request ${s(v, 'ref')} received. Track it:`,
  ),
  'request.emergency.pm': t(
    (v) => `EMERGENCY ${s(v, 'ref')}: ${s(v, 'title')}`,
    (v) => `Emergency reported at ${s(v, 'address')}: ${s(v, 'title')}. Tenant phone: ${s(v, 'tenantPhone')}`,
  ),
  'request.needs_info.tenant': t(
    (v) => `More information needed for ${s(v, 'ref')}`,
    (v) => `About "${s(v, 'title')}": ${s(v, 'question')}`,
  ),
  'request.info_received.pm': t((v) => `Tenant replied on ${s(v, 'ref')}`, (v) => `${s(v, 'ref')}: ${s(v, 'answer')}`),
  'request.needs_info_nudge.tenant': t(
    (v) => `Reminder: we still need information for ${s(v, 'ref')}`,
    (v) => `We can't schedule "${s(v, 'title')}" until you answer: ${s(v, 'question')}`,
  ),
  'tenant.my_requests': t((v) => `Your requests with ${firm(v)}`, () => 'Here are your maintenance requests. This link expires in 24 hours:'),
  'request.not_fixed.pm': t((v) => `Tenant says ${s(v, 'ref')} is NOT fixed`, (v) => `${s(v, 'ref')} reopened by the tenant.`),

  'wo.assigned.vendor': t(
    (v) => `New job ${s(v, 'ref')} from ${firm(v)}`,
    (v) => `New ${s(v, 'priority')} job ${s(v, 'ref')} at ${s(v, 'address')}: ${s(v, 'description')}. Accept or decline:`,
    (v) => `new ${s(v, 'priority')} job ${s(v, 'ref')} at ${s(v, 'address')}. Accept or decline:`,
  ),
  'wo.accepted.pm': t((v) => `${s(v, 'vendor')} accepted ${s(v, 'ref')}`, (v) => `${s(v, 'vendor')} accepted ${s(v, 'ref')}.`),
  'wo.accepted.tenant': t(
    (v) => `A vendor is assigned to ${s(v, 'requestRef')}`,
    (v) => `${s(v, 'vendor')} will contact you to schedule "${s(v, 'title')}".`,
  ),
  'wo.declined.pm': t(
    (v) => `${s(v, 'vendor')} declined ${s(v, 'ref')}`,
    (v) => `${s(v, 'vendor')} declined ${s(v, 'ref')}: ${s(v, 'reason')}. Reassign it.`,
  ),
  'wo.quote_submitted.pm': t(
    (v) => `Quote ${money(v, 'amount')} on ${s(v, 'ref')}`,
    (v) => `${s(v, 'vendor')} quoted ${money(v, 'amount')} for ${s(v, 'ref')}.`,
  ),
  'wo.approval_requested.owner': t(
    (v) => `Approval needed: ${money(v, 'amount')} repair at ${s(v, 'address')}`,
    (v) => `${firm(v)} needs your approval for a ${money(v, 'amount')} repair at ${s(v, 'address')}: ${s(v, 'description')}. Review the photos and quote:`,
  ),
  'wo.approval_resend.owner': t(
    (v) => `Reminder: approval still needed for ${s(v, 'address')}`,
    (v) => `A ${money(v, 'amount')} repair at ${s(v, 'address')} is waiting for your decision:`,
  ),
  'wo.approval_decided.pm': t(
    (v) => `${s(v, 'decision')}: ${s(v, 'ref')}`,
    (v) => `${s(v, 'approver')} ${s(v, 'decision')} ${money(v, 'amount')} on ${s(v, 'ref')}. ${s(v, 'note')}`,
  ),
  'wo.approval_decided.vendor': t(
    (v) => `Quote ${s(v, 'decision')}: ${s(v, 'ref')}`,
    (v) => `Your quote for ${s(v, 'ref')} was ${s(v, 'decision')}.`,
  ),
  'wo.emergency_notice.owner': t(
    (v) => `Emergency repair at ${s(v, 'address')}`,
    (v) => `${firm(v)} dispatched an emergency repair at ${s(v, 'address')}: ${s(v, 'description')}. Covered by the emergency spend limit; you'll get the final invoice.`,
  ),
  'wo.scheduled.tenant': t(
    (v) => `Appointment set for ${s(v, 'requestRef')}`,
    (v) => `${s(v, 'vendor')} is scheduled for ${s(v, 'window')}. If this time doesn't work, tell us here:`,
  ),
  'wo.scheduled.party': t((v) => `Scheduled: ${s(v, 'ref')}`, (v) => `${s(v, 'ref')} is scheduled for ${s(v, 'window')}.`),
  'wo.tenant_conflict': t(
    (v) => `Tenant can't make ${s(v, 'ref')} appointment`,
    (v) => `The tenant says ${s(v, 'window')} doesn't work for ${s(v, 'ref')}. ${s(v, 'note')}`,
  ),
  'wo.no_access.pm': t((v) => `No access on ${s(v, 'ref')}`, (v) => `${s(v, 'vendor')} couldn't get in for ${s(v, 'ref')}: ${s(v, 'reason')}.`),
  'wo.completed.pm': t(
    (v) => `${s(v, 'ref')} completed, ready for review`,
    (v) => `${s(v, 'vendor')} completed ${s(v, 'ref')} and invoiced ${money(v, 'amount')}. Review and close it.`,
  ),
  'wo.more_work.vendor': t((v) => `More work needed on ${s(v, 'ref')}`, (v) => `${s(v, 'ref')} was sent back: ${s(v, 'note')}`),
  'wo.closed.tenant': t(
    (v) => `Was "${s(v, 'title')}" fixed?`,
    (v) => `We've marked ${s(v, 'requestRef')} complete. Please confirm it's fixed:`,
  ),
  'wo.closed.owner_summary': t(
    (v) => `Repair completed at ${s(v, 'address')}`,
    (v) => `${s(v, 'ref')} at ${s(v, 'address')} was completed by ${s(v, 'vendor')} for ${money(v, 'amount')}.`,
  ),
  'wo.cancelled.vendor': t((v) => `Job ${s(v, 'ref')} cancelled`, (v) => `${firm(v)} cancelled ${s(v, 'ref')}. No further action needed.`),

  'wo.acceptance_nudge.vendor': t(
    (v) => `Reminder: please accept or decline ${s(v, 'ref')}`,
    (v) => `${s(v, 'ref')} at ${s(v, 'address')} is waiting for your answer:`,
  ),
  'wo.acceptance_escalate.pm': t(
    (v) => `No answer from ${s(v, 'vendor')} on ${s(v, 'ref')}`,
    (v) => `${s(v, 'vendor')} hasn't accepted ${s(v, 'ref')}. Consider reassigning.`,
  ),
  'wo.quote_nudge.vendor': t((v) => `Quote needed for ${s(v, 'ref')}`, (v) => `Please submit your quote for ${s(v, 'ref')}:`),
  'wo.approval_escalate.pm': t(
    (v) => `Owner hasn't approved ${s(v, 'ref')}`,
    (v) => `Approval for ${s(v, 'ref')} (${money(v, 'amount')}) is still pending. Call the owner?`,
  ),
  'wo.appointment_tomorrow.party': t(
    (v) => `Reminder: appointment ${s(v, 'window')}`,
    (v) => `Reminder: ${s(v, 'ref')} at ${s(v, 'address')} is scheduled for ${s(v, 'window')}.`,
  ),
  'wo.review_nudge.pm': t((v) => `${s(v, 'ref')} is waiting for your review`, (v) => `${s(v, 'ref')} was completed and is waiting to be closed.`),
  'wo.overdue.pm': t((v) => `Overdue: ${s(v, 'ref')}`, (v) => `${s(v, 'ref')} at ${s(v, 'address')} is past its expected completion.`),
  'wo.overdue.vendor': t((v) => `Overdue: ${s(v, 'ref')}`, (v) => `${s(v, 'ref')} is past its expected completion. Update the job:`),

  'doc.expiring.vendor': t(
    (v) => `Your ${s(v, 'docType')} on file with ${firm(v)} ${s(v, 'when')}`,
    (v) => `Your ${s(v, 'docType')} ${s(v, 'when')} (${s(v, 'expiresOn')}). Upload the renewal:`,
  ),
  'doc.expiring.pm': t(
    (v) => `${s(v, 'vendor')}'s ${s(v, 'docType')} ${s(v, 'when')}`,
    (v) => `${s(v, 'vendor')}'s ${s(v, 'docType')} ${s(v, 'when')} (${s(v, 'expiresOn')}).`,
  ),

  'vendor.invite': t(
    (v) => `${firm(v)}: please confirm your details`,
    (v) => `${firm(v)} uses this link to send you jobs. Confirm your contact details and upload your insurance certificate, licence and W-9:`,
  ),
  'user.invite': t((v) => `Join ${firm(v)}`, (v) => `${s(v, 'inviter')} invited you to ${firm(v)}. Set your password:`),
  'user.password_reset': t(() => 'Reset your password', () => 'Use this link to reset your password. It expires in 1 hour:'),
  'user.verify_email': t(() => 'Confirm your email for Fixloop', () => 'Confirm this is your email to start using Fixloop. The link expires in 48 hours:'),
} satisfies Record<string, Template>;

export type TemplateName = keyof typeof templates;

export function render(name: string, vars: Vars, url: string | null): Rendered {
  const tpl = (templates as Record<string, Template>)[name];
  if (!tpl) throw new Error(`Unknown template ${name}`);
  return tpl(vars, url);
}
