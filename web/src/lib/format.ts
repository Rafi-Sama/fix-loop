/** Formatting and the single source of truth for every enum's display label. */

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const money = (cents: number | null | undefined, whole = false) =>
  cents === null || cents === undefined ? '—' : (whole ? usd0 : usd).format(cents / 100);

/** "$1,250.50" / "1250.5" → 125050; null when not a valid amount. */
export function parseMoney(input: string): number | null {
  const clean = input.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

export const centsToInput = (cents: number | null | undefined) => (cents === null || cents === undefined ? '' : (cents / 100).toFixed(2).replace(/\.00$/, ''));

/** Compact wait: 45m, 5h, 3d 4h, 2w. */
export function duration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || Number.isNaN(hours)) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  const d = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  if (d >= 14) return `${Math.round(d / 7)}w`;
  return h ? `${d}d ${h}h` : `${d}d`;
}

export const hoursSince = (iso: string, now = Date.now()) => (now - new Date(iso).getTime()) / 3_600_000;

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
export function relative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const s = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(s);
  if (abs < 60) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
  return date(iso);
}

export const date = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

export const time = (iso: string, timeZone?: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone });

/** Appointment window, shown in the firm's time zone so it matches emails and texts. */
export function window(startsAt: string, endsAt: string, timeZone?: string): string {
  const day = new Date(startsAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone });
  return `${day}, ${time(startsAt, timeZone)}–${time(endsAt, timeZone)}`;
}

/** A wall-clock date + time in `timeZone` (e.g. the firm's), as an instant. The device's own zone doesn't matter. */
export function zonedTime(day: string, hm: string, timeZone: string): Date {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  const offset = (d: Date) => {
    const parts = fmt.formatToParts(d);
    const n = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((x) => x.type === t)?.value);
    return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - d.getTime();
  };
  const wall = new Date(`${day}T${hm}:00Z`);
  // Second pass settles DST edges, where the offset at the guess differs from the offset at the answer.
  return new Date(wall.getTime() - offset(new Date(wall.getTime() - offset(wall))));
}

export const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

/** Pads a monthly series so empty months show as zero instead of disappearing. Ends at `end` (default: this month). */
export function fillMonths(rows: { month: string; totalCents: number }[], n: number, end = new Date()) {
  const by = new Map(rows.map((r) => [r.month, r.totalCents]));
  const out: { label: string; value: number }[] = [];
  const d = new Date(end.getFullYear(), end.getMonth() - (n - 1), 1);
  for (let i = 0; i < n; i++) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ label: monthLabel(key), value: by.get(key) ?? 0 });
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

/** Calendar months touched by [from, to], inclusive (yyyy-mm-dd strings). */
export const monthSpan = (from: string, to: string) => {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return Math.max(1, Math.min(37, (ty! - fy!) * 12 + (tm! - fm!) + 1));
};

/** Local yyyy-mm-dd for <input type=date>. */
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const phone = (e164: string | null | undefined) => {
  if (!e164) return '—';
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
};

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------- enum labels

export type Priority = 'emergency' | 'high' | 'normal' | 'low';
export const PRIORITIES: Priority[] = ['emergency', 'high', 'normal', 'low'];
export const PRIORITY_LABEL: Record<Priority, string> = { emergency: 'Emergency', high: 'High', normal: 'Normal', low: 'Low' };

export type RequestStatus = 'new' | 'needs_info' | 'in_progress' | 'resolved' | 'closed' | 'cancelled';
export const REQUEST_STATUSES: RequestStatus[] = ['new', 'needs_info', 'in_progress', 'resolved', 'closed', 'cancelled'];
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  new: 'New',
  needs_info: 'Needs info',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export type WoStatus =
  | 'draft'
  | 'awaiting_acceptance'
  | 'awaiting_quote'
  | 'awaiting_approval'
  | 'awaiting_scheduling'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'closed'
  | 'cancelled';
export const WO_STATUSES: WoStatus[] = ['draft', 'awaiting_acceptance', 'awaiting_quote', 'awaiting_approval', 'awaiting_scheduling', 'scheduled', 'in_progress', 'completed', 'closed', 'cancelled'];
export const OPEN_WO: WoStatus[] = WO_STATUSES.filter((s) => s !== 'closed' && s !== 'cancelled');
export const WO_STATUS_LABEL: Record<WoStatus, string> = {
  draft: 'Draft',
  awaiting_acceptance: 'Awaiting acceptance',
  awaiting_quote: 'Awaiting quote',
  awaiting_approval: 'Awaiting approval',
  awaiting_scheduling: 'Awaiting scheduling',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Ready for review',
  closed: 'Closed',
  cancelled: 'Cancelled',
};
/** The main path, in order, for the progress pipe on a work order. */
export const WO_PATH: WoStatus[] = ['draft', 'awaiting_acceptance', 'awaiting_quote', 'awaiting_approval', 'awaiting_scheduling', 'scheduled', 'in_progress', 'completed', 'closed'];

export type Party = 'pm' | 'vendor' | 'tenant' | 'owner';
export const PARTY_LABEL: Record<Party, string> = { pm: 'You', vendor: 'Vendor', tenant: 'Tenant', owner: 'Owner' };

export const PROPERTY_TYPES = ['single_family', 'multi_family', 'condo', 'townhouse', 'mobile_home', 'other'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  single_family: 'Single family',
  multi_family: 'Multi-family',
  condo: 'Condo',
  townhouse: 'Townhouse',
  mobile_home: 'Mobile home',
  other: 'Other',
};

export const OCCUPANCY = ['current', 'notice_given', 'past'] as const;
export type Occupancy = (typeof OCCUPANCY)[number];
export const OCCUPANCY_LABEL: Record<Occupancy, string> = { current: 'Current', notice_given: 'Notice given', past: 'Past' };

export const PERMISSION_LABEL: Record<string, string> = { yes: 'Yes, enter anytime', no: 'No, I must be present', only_if_home: 'Only if I’m home' };

export const BILL_TO_LABEL: Record<string, string> = { owner: 'Owner', tenant: 'Tenant (chargeback)', warranty: 'Warranty' };

export const DOC_TYPE_LABEL: Record<string, string> = { insurance: 'Insurance (COI)', license: 'Licence', w9: 'W-9', other: 'Other' };

export type Compliance = 'ok' | 'expiring' | 'expired' | 'missing';
export const COMPLIANCE_LABEL: Record<Compliance, string> = { ok: 'Compliant', expiring: 'Expiring', expired: 'Expired', missing: 'No insurance' };

export const NO_ACCESS_LABEL: Record<string, string> = { tenant_no_show: 'Tenant no-show', no_permission: 'No permission to enter', vendor_cancelled: 'Vendor cancelled' };

export const CHANNEL_LABEL: Record<string, string> = { app: 'In app', email_link: 'Email link', sms_link: 'SMS link', phone: 'By phone', system: 'Automatic' };

export const label = (s: string) => s.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
