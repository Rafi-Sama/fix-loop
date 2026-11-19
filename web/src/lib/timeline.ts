/** Turns timeline events and notification templates into plain sentences. */
import { label, money, NO_ACCESS_LABEL, WO_STATUS_LABEL, type WoStatus } from './format';
import type { TimelineEvent } from './types';

const p = (e: TimelineEvent, k: string) => e.payload[k];
const amount = (e: TimelineEvent) => (typeof p(e, 'amountCents') === 'number' ? money(p(e, 'amountCents') as number) : '');

export function describeEvent(e: TimelineEvent): string {
  switch (e.type) {
    case 'request.created':
      return p(e, 'isEmergency') ? 'Emergency request submitted' : 'Request submitted';
    case 'request.updated':
      return `Request edited (${Object.keys((p(e, 'changes') as object) ?? {}).map((k) => label(k.replace(/Id$/, '')).toLowerCase()).join(', ')})`;
    case 'request.needs_info':
      return `Asked the tenant: “${String(p(e, 'question') ?? '')}”`;
    case 'request.info_received':
      return 'Tenant answered the question';
    case 'request.converted':
      return `Converted to work order ${String(p(e, 'ref') ?? '')}`;
    case 'request.closed':
      return `Closed: ${String(p(e, 'reason') ?? '')}`;
    case 'request.cancelled':
      return `Cancelled: ${String(p(e, 'reason') ?? '')}`;
    case 'request.confirmed_fixed':
      return p(e, 'rating') ? `Tenant confirmed it’s fixed (${String(p(e, 'rating'))}/5)` : 'Tenant confirmed it’s fixed';
    case 'request.reopened':
      return 'Tenant says it’s not fixed: request reopened';
    case 'wo.created':
      return 'Work order created';
    case 'wo.updated':
      return 'Work order details edited';
    case 'wo.assigned':
      return p(e, 'complianceOverride') ? `Vendor assigned, compliance overridden: “${String(p(e, 'complianceOverride'))}”` : 'Vendor assigned and job link sent';
    case 'wo.unassigned':
      return 'Vendor unassigned';
    case 'wo.declined':
      return `Vendor declined: “${String(p(e, 'reason') ?? '')}”`;
    case 'wo.accepted':
      return 'Vendor accepted the job';
    case 'wo.link_resent':
      return 'Job link re-sent to the vendor';
    case 'wo.quote_submitted':
      return `Quote v${String(p(e, 'version') ?? 1)} submitted: ${amount(e)}`;
    case 'wo.approval_requested':
      return p(e, 'mode') === 'pm_forwards' ? 'Marked for owner approval (you forward it)' : 'Quote sent to the owner for approval';
    case 'wo.quote_approved':
      return `Quote approved${p(e, 'approverType') === 'auto' ? ' automatically (under threshold)' : p(e, 'approverType') === 'owner' ? ' by the owner' : ''}: ${amount(e)}`;
    case 'wo.quote_rejected':
      return `Quote rejected, next: ${WO_STATUS_LABEL[p(e, 'next') as WoStatus]?.toLowerCase() ?? 'revised quote'}`;
    case 'wo.quote_declined':
      return `Owner declined the quote${p(e, 'note') ? `: “${String(p(e, 'note'))}”` : ''}`;
    case 'wo.quote_call_me':
      return `Owner asked for a call${p(e, 'note') ? `: “${String(p(e, 'note'))}”` : ''}`;
    case 'wo.scheduled':
      return `Appointment scheduled`;
    case 'wo.rescheduled':
      return 'Appointment rescheduled';
    case 'wo.tenant_conflict':
      return `Tenant can’t make that time${p(e, 'note') ? `: “${String(p(e, 'note'))}”` : ''}`;
    case 'wo.no_access':
      return `No access: ${NO_ACCESS_LABEL[String(p(e, 'reason'))] ?? 'unknown'}`;
    case 'wo.started':
      return p(e, 'emergencyFastPath') ? 'Emergency: vendor started on the way' : 'Repair started';
    case 'wo.completed':
      return `Repair completed, invoice ${amount(e)}`;
    case 'wo.more_work_requested':
      return `Sent back for more work: “${String(p(e, 'note') ?? '')}”`;
    case 'wo.closed':
      return `Closed, expense recorded ${amount(e)}`;
    case 'wo.cancelled':
      return `Cancelled: ${String(p(e, 'reason') ?? '')}`;
    case 'wo.overdue':
      return 'Past the expected completion date';
    default:
      return label(e.type.split('.').slice(1).join(' ') || e.type);
  }
}

/** Notification template → who got what. */
export function describeTemplate(t: string): string {
  const [scope, ...rest] = t.split('.');
  const audience = rest.at(-1);
  const what = rest.slice(0, -1).join(' ').replaceAll('_', ' ');
  const to = audience === 'pm' ? 'team' : audience === 'party' ? 'everyone involved' : audience?.split('_')[0]; // owner_summary → owner
  return `${label(what || scope || t)} → ${to}`;
}
