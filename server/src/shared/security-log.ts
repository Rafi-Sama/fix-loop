import type { DbOrTx } from '../db/client.js';
import { securityEvents } from '../db/schema/index.js';

/** Every type written to the security log. The superadmin console filters on these. */
export const SECURITY_EVENT_TYPES = [
  'auth.signup',
  'auth.login',
  'auth.login_failed',
  'auth.locked',
  'auth.logout',
  'auth.logout_others',
  'auth.password_changed',
  'auth.password_reset_requested',
  'auth.password_set',
  'auth.email_verified',
  'auth.verification_sent',
  'team.invited',
  'team.role_changed',
  'team.deactivated',
  'team.reactivated',
  'platform.login',
  'platform.login_failed',
  'platform.locked',
  'platform.logout',
  'platform.org_suspended',
  'platform.org_unsuspended',
  'platform.user_deactivated',
  'platform.user_reactivated',
  'platform.sessions_revoked',
  'platform.user_unlocked',
  'platform.verification_resent',
  'platform.email_marked_verified',
  'platform.admin_created',
  'platform.admin_reset',
  'platform.admin_disabled',
  'platform.admin_enabled',
] as const;
export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

export interface RequestMeta {
  ip: string;
  userAgent?: string | undefined;
}

export interface SecurityEventInput {
  type: SecurityEventType;
  orgId?: string | null;
  userId?: string | null;
  platformAdminId?: string | null;
  email?: string | null;
  meta?: RequestMeta;
  detail?: Record<string, unknown>;
}

/** Append one entry. Pass the transaction when the change it records can still roll back. */
export async function logSecurity(db: DbOrTx, e: SecurityEventInput): Promise<void> {
  await db.insert(securityEvents).values({
    type: e.type,
    orgId: e.orgId ?? null,
    userId: e.userId ?? null,
    platformAdminId: e.platformAdminId ?? null,
    email: e.email?.toLowerCase().slice(0, 254) ?? null,
    ip: e.meta?.ip ?? null,
    userAgent: e.meta?.userAgent?.slice(0, 300) ?? null,
    detail: e.detail ?? {},
  });
}

/** IP and user agent of a Fastify request, in the shape the log stores. */
export const requestMeta = (req: { ip: string; headers: Record<string, unknown> }): RequestMeta => ({
  ip: req.ip,
  userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
});
