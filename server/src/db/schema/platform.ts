// Fixloop's own operators. Kept apart from firm users: a firm-level compromise can't reach them,
// and they sign in with a separate cookie, password + authenticator code.
import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps, tstz } from './_shared.js';

export const platformAdmins = pgTable(
  'platform_admins',
  {
    id: id(),
    email: text().notNull(),
    name: text().notNull(),
    passwordHash: text().notNull(),
    totpSecret: text().notNull(),
    // Last accepted TOTP time step: a code can't be replayed inside its 30-second window.
    totpLastStep: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    failedLogins: integer().notNull().default(0),
    lockedUntil: tstz(),
    lastLoginAt: tstz(),
    ...timestamps,
  },
  (t) => [uniqueIndex('platform_admins_email_uq').on(sql`lower(${t.email})`)],
);

export const platformSessions = pgTable(
  'platform_sessions',
  {
    id: id(),
    adminId: uuid()
      .notNull()
      .references(() => platformAdmins.id, { onDelete: 'cascade' }),
    tokenHash: text().notNull(),
    ip: text(),
    userAgent: text(),
    expiresAt: tstz().notNull(),
    lastSeenAt: tstz().notNull().defaultNow(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [uniqueIndex('platform_sessions_token_uq').on(t.tokenHash), index('platform_sessions_admin_idx').on(t.adminId)],
);

// Append-only security log (the API role can't update or delete it). No FKs: entries outlive the rows they describe.
export const securityEvents = pgTable(
  'security_events',
  {
    id: id(),
    // Millisecond precision, like created_at elsewhere: keyset cursors carry it as a JS Date.
    at: timestamp({ withTimezone: true, mode: 'date', precision: 3 }).notNull().defaultNow(),
    type: text().notNull(),
    orgId: uuid(),
    userId: uuid(),
    platformAdminId: uuid(),
    // Attempted email for failed sign-ins where no account matched.
    email: text(),
    ip: text(),
    userAgent: text(),
    detail: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [
    // Every listing pages on (at, id) newest first, so each index ends with both: no sort at any size.
    // Ascending on purpose: read backwards they give ORDER BY at DESC, id DESC. Drizzle's .desc() emits
    // DESC NULLS LAST, which doesn't match DESC (nulls first) and left these indexes unused.
    index('security_events_at_idx').on(t.at, t.id),
    index('security_events_org_idx').on(t.orgId, t.at, t.id),
    index('security_events_user_idx').on(t.userId, t.at, t.id),
    index('security_events_type_idx').on(t.type, t.at, t.id),
    // "Contains" search on email and IP. This table has no RLS, so trigram indexes are usable here.
    index('security_events_email_trgm').using('gin', sql`${t.email} gin_trgm_ops`),
    index('security_events_ip_trgm').using('gin', sql`${t.ip} gin_trgm_ops`),
    // "This user's events" also matches actions done TO them (team/platform events store targetUserId).
    index('security_events_target_idx').on(sql`(${t.detail}->>'targetUserId')`).where(sql`(${t.detail}->>'targetUserId') is not null`),
  ],
);
