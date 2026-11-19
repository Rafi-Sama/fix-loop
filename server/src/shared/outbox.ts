import { and, eq, isNotNull } from 'drizzle-orm';
import type { Tx } from '../db/client.js';
import { notifications, organizations, users, type LinkSpec } from '../db/schema/index.js';
import type { TemplateName } from '../modules/notifications/templates.js';

type Vars = Record<string, string | number | null>;

export interface Party {
  type: 'user' | 'vendor' | 'tenant' | 'owner';
  id: string;
  email: string | null;
  phone: string | null;
  smsConsentAt?: Date | null;
}

export interface NotifyInput {
  orgId: string;
  to: Party;
  template: TemplateName;
  vars: Vars;
  subject: { type: 'request' | 'work_order' | 'vendor' | 'user'; id: string };
  /** The worker mints this link at send time; raw tokens never sit in the outbox. */
  link?: Omit<LinkSpec, 'subjectType' | 'subjectId'>;
  /** Also send by SMS when the party has a phone, gave consent, and the org's SMS is approved. */
  sms?: boolean;
  /** Skip email (SMS-only reminders). */
  emailOff?: boolean;
}

type Row = typeof notifications.$inferInsert;

// PM users opted in by being staff; external parties need recorded consent (TCPA / 10DLC).
const smsOk = (to: Party, smsEnabled: boolean) => smsEnabled && Boolean(to.phone) && (to.type === 'user' || Boolean(to.smsConsentAt));

/** Whether `notify` would send this party anything (for messages that offer SMS). */
export const canReach = (to: Party, smsEnabled: boolean): boolean => Boolean(to.email) || smsOk(to, smsEnabled);

function rowsFor(n: NotifyInput, smsEnabled: boolean): Row[] {
  const link: LinkSpec | undefined = n.link ? { ...n.link, subjectType: n.to.type, subjectId: n.to.id } : undefined;
  const base = {
    orgId: n.orgId,
    recipientType: n.to.type,
    recipientId: n.to.id,
    template: n.template,
    payload: { vars: n.vars, ...(link ? { link } : {}) },
    subjectType: n.subject.type,
    subjectId: n.subject.id,
  } as const;
  const rows: Row[] = [];
  if (n.to.email && !n.emailOff) rows.push({ ...base, channel: 'email', toAddress: n.to.email });
  if (n.sms && smsOk(n.to, smsEnabled)) rows.push({ ...base, channel: 'sms', toAddress: n.to.phone! });
  return rows;
}

/** Writes outbox rows inside the caller's transaction. */
export async function notify(tx: Tx, n: NotifyInput, smsEnabled: boolean): Promise<void> {
  const rows = rowsFor(n, smsEnabled);
  if (rows.length) await tx.insert(notifications).values(rows);
}

/** Notify every active manager of the org, in one insert. */
export async function notifyManagers(
  tx: Tx,
  orgId: string,
  smsEnabled: boolean,
  n: Omit<NotifyInput, 'orgId' | 'to'>,
): Promise<void> {
  const staff = await tx
    .select({ id: users.id, email: users.email, phone: users.phone })
    .from(users)
    .where(and(eq(users.orgId, orgId), eq(users.active, true), isNotNull(users.passwordHash)));
  const rows = staff.flatMap((u) => rowsFor({ ...n, orgId, to: { type: 'user', ...u } }, smsEnabled));
  if (rows.length) await tx.insert(notifications).values(rows);
}

export async function orgSmsEnabled(tx: Tx, orgId: string): Promise<boolean> {
  const [o] = await tx
    .select({ s: organizations.smsRegistrationStatus })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  return o?.s === 'approved';
}
