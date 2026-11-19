// Data layer for the Fixloop superadmin console (/ops). Query keys all start with 'ops' so a 401 here
// never signs a firm user out of the main app (see queries.ts).
import { useQuery } from '@tanstack/react-query';
import { api, ApiError, type Query } from '../../lib/api';
import { useList } from '../../lib/queries';

export interface OpsMe { id: string; email: string; name: string }
export interface Overview { firms: number; suspended: number; newFirms7d: number; users: number; unverifiedUsers: number; activeUsers24h: number; failedLogins24h: number; lockouts24h: number; platformFailures24h: number }
export interface FirmRow { id: string; name: string; slug: string; createdAt: string; suspendedAt: string | null; users: number; unverified: number; adminEmail: string | null; lastActiveAt: string | null; doors: number; openWorkOrders: number; requests30d: number }
export interface FirmUser { id: string; name: string; email: string; role: 'admin' | 'manager'; active: boolean; invitePending: boolean; emailVerifiedAt: string | null; failedLogins: number; lockedUntil: string | null; createdAt: string; lastSeenAt: string | null; activeSessions: number }
export interface Firm extends Omit<FirmRow, 'users' | 'unverified' | 'adminEmail' | 'lastActiveAt'> { phone: string | null; timezone: string; suspendedReason: string | null; smsRegistrationStatus: string; users: FirmUser[] }
export interface SecurityEvent { id: string; createdAt: string; type: string; orgId: string | null; orgName: string | null; userId: string | null; userEmail: string | null; platformAdminEmail: string | null; email: string | null; ip: string | null; userAgent: string | null; detail: Record<string, unknown> }
export interface Admin { id: string; email: string; name: string; active: boolean; lastLoginAt: string | null; createdAt: string; activeSessions: number }

export const opsKeys = {
  me: ['ops', 'me'] as const,
  overview: ['ops', 'overview'] as const,
  firms: (q: Query) => ['ops', 'firms', q] as const,
  firm: (id: string) => ['ops', 'firm', id] as const,
  events: (q: Query) => ['ops', 'events', q] as const,
  admins: ['ops', 'admins'] as const,
};

export const useOpsMe = () =>
  useQuery({
    queryKey: opsKeys.me,
    queryFn: () => api<OpsMe>('/platform/me').catch((e) => (e instanceof ApiError && e.status === 401 ? null : Promise.reject(e))),
    staleTime: 60_000,
  });
export const useOverview = () => useQuery({ queryKey: opsKeys.overview, queryFn: () => api<Overview>('/platform/overview'), refetchInterval: 60_000 });
export const useFirms = (q: Query) => useList<FirmRow>(opsKeys.firms(q), '/platform/orgs', q);
export const useFirm = (id: string) => useQuery({ queryKey: opsKeys.firm(id), queryFn: () => api<Firm>(`/platform/orgs/${id}`) });
export const useEvents = (q: Query) => useList<SecurityEvent>(opsKeys.events(q), '/platform/security-events', q);
export const useAdmins = () => useQuery({ queryKey: opsKeys.admins, queryFn: () => api<Admin[]>('/platform/admins') });

/** Plain-English label for each security event type; unknown types show as-is. */
const EVENT_LABEL: Record<string, string> = {
  'auth.signup': 'Firm signed up',
  'auth.login': 'Signed in',
  'auth.login_failed': 'Sign-in failed',
  'auth.locked': 'Account locked (10 failures)',
  'auth.logout': 'Signed out',
  'auth.logout_others': 'Signed out other devices',
  'auth.password_changed': 'Password changed',
  'auth.password_reset_requested': 'Password reset requested',
  'auth.password_set': 'Password set from link',
  'auth.email_verified': 'Email confirmed',
  'auth.verification_sent': 'Confirmation email re-sent',
  'team.invited': 'Teammate invited',
  'team.role_changed': 'Role changed',
  'team.deactivated': 'Teammate deactivated',
  'team.reactivated': 'Teammate reactivated',
  'platform.login': 'Superadmin signed in',
  'platform.login_failed': 'Superadmin sign-in failed',
  'platform.locked': 'Superadmin locked (5 failures)',
  'platform.logout': 'Superadmin signed out',
  'platform.org_suspended': 'Firm suspended',
  'platform.org_unsuspended': 'Firm un-suspended',
  'platform.user_deactivated': 'User deactivated by Fixloop',
  'platform.user_reactivated': 'User reactivated by Fixloop',
  'platform.sessions_revoked': 'Sessions ended by Fixloop',
  'platform.user_unlocked': 'Account unlocked by Fixloop',
  'platform.verification_resent': 'Confirmation re-sent by Fixloop',
  'platform.email_marked_verified': 'Email marked confirmed by Fixloop',
  'platform.admin_created': 'Superadmin created',
  'platform.admin_reset': 'Superadmin credentials reset',
  'platform.admin_disabled': 'Superadmin disabled',
  'platform.admin_enabled': 'Superadmin enabled',
};
export const eventLabel = (t: string) => EVENT_LABEL[t] ?? t;
export const isFailure = (t: string) => t.endsWith('login_failed') || t.endsWith('.locked');

const REASON: Record<string, string> = { unknown_email: 'no such account', bad_password: 'wrong password', bad_code: 'wrong or reused code', code_reused: 'code reused', locked: 'while locked', deactivated: 'deactivated user', invite_pending: 'invite not accepted', org_suspended: 'firm suspended' };
/** One short line from an event's detail: the reason, a role change, counts. */
export function eventDetail(e: SecurityEvent): string {
  const d = e.detail;
  const parts: string[] = [];
  if (typeof d.reason === 'string') parts.push(REASON[d.reason] ?? `“${d.reason}”`);
  if (d.from && d.to) parts.push(`${d.from} → ${d.to}`);
  if (typeof d.sessionsEnded === 'number') parts.push(`${d.sessionsEnded} session${d.sessionsEnded === 1 ? '' : 's'} ended`);
  if (typeof d.via === 'string') parts.push(d.via === 'user_invite' ? 'invite' : 'reset');
  if (d.matched === false) parts.push('no matching account');
  return parts.join(' · ');
}
