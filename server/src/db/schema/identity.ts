// Identity tables are read before an org context exists (login, session lookup, public links),
// so they are NOT under row-level security. Every query against them is scoped in code.
import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps, tstz } from './_shared.js';

export const userRole = pgEnum('user_role', ['admin', 'manager']);
export const linkSubjectType = pgEnum('link_subject_type', ['vendor', 'tenant', 'owner', 'user']);
export const linkPurpose = pgEnum('link_purpose', [
  'job',
  'approval',
  'request_track',
  'my_requests',
  'vendor_profile',
  'needs_info',
  'confirm_fix',
  'user_invite',
  'password_reset',
  'email_verify',
]);

export const organizations = pgTable(
  'organizations',
  {
    id: id(),
    name: text().notNull(),
    // Public intake URL segment: /public/orgs/:slug
    slug: text().notNull(),
    phone: text(),
    emergencyPhone: text(),
    address: text(),
    logoKey: text(),
    timezone: text().notNull().default('America/New_York'),
    defaultApprovalThresholdCents: integer().notNull().default(30000),
    autoApproveUnderThreshold: boolean().notNull().default(false),
    emergencySpendLimitCents: integer().notNull().default(50000),
    invoiceOveragePct: integer().notNull().default(10),
    slaConfig: jsonb().$type<SlaConfig>().notNull().default(sql`'{}'::jsonb`),
    reminderConfig: jsonb().$type<ReminderConfig>().notNull().default(sql`'{}'::jsonb`),
    emergencyKeywords: text()
      .array()
      .notNull()
      .default(sql`ARRAY['gas','smell gas','flood','flooding','sparks','smoke','fire','no heat','carbon monoxide','sewage']::text[]`),
    smsRegistrationStatus: text({ enum: ['none', 'pending', 'approved', 'rejected'] }).notNull().default('none'),
    // Set by a Fixloop superadmin: sign-in, links, intake and outbound messages all stop.
    suspendedAt: tstz(),
    suspendedReason: text(),
    ...timestamps,
  },
  (t) => [uniqueIndex('organizations_slug_uq').on(t.slug)],
);

export const users = pgTable(
  'users',
  {
    id: id(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text().notNull(),
    name: text().notNull(),
    phone: text(),
    role: userRole().notNull().default('manager'),
    // null until an invited user sets a password
    passwordHash: text(),
    active: boolean().notNull().default(true),
    failedLogins: integer().notNull().default(0),
    lockedUntil: tstz(),
    // null until the user proves the address (signup link, invite or password reset).
    emailVerifiedAt: tstz(),
    notificationPrefs: jsonb().$type<Record<string, boolean>>().notNull().default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (t) => [uniqueIndex('users_email_uq').on(sql`lower(${t.email})`), index('users_org_idx').on(t.orgId)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orgId: uuid().notNull(),
    tokenHash: text().notNull(),
    userAgent: text(),
    ip: text(),
    expiresAt: tstz().notNull(),
    lastSeenAt: tstz().notNull().defaultNow(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [uniqueIndex('sessions_token_uq').on(t.tokenHash), index('sessions_user_idx').on(t.userId)],
);

// No-login links for vendors, tenants and owners. Only the SHA-256 of the token is stored.
export const accessLinks = pgTable(
  'access_links',
  {
    id: id(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tokenHash: text().notNull(),
    subjectType: linkSubjectType().notNull(),
    subjectId: uuid().notNull(),
    purpose: linkPurpose().notNull(),
    // The single object this link may act on (work order, request, quote, vendor).
    scopeId: uuid().notNull(),
    expiresAt: tstz().notNull(),
    revokedAt: tstz(),
    usedAt: tstz(),
    lastUsedAt: tstz(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('access_links_token_uq').on(t.tokenHash),
    index('access_links_scope_idx').on(t.orgId, t.scopeId),
  ],
);

export type Priority = 'emergency' | 'high' | 'normal' | 'low';
export type SlaConfig = Partial<Record<Priority, { assignHours: number; completeHours: number }>>;
export type ReminderConfig = Partial<Record<string, number>>;
