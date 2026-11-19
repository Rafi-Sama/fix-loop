import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { id, orgId, tstz } from './_shared.js';
import { organizations } from './identity.js';

export const channel = pgEnum('channel', ['email', 'sms']);
export const notificationStatus = pgEnum('notification_status', ['queued', 'sent', 'failed', 'skipped']);
export const recipientType = pgEnum('recipient_type', ['user', 'vendor', 'tenant', 'owner']);

const org = () => orgId().references(() => organizations.id, { onDelete: 'cascade' });

/**
 * Transactional outbox. Rows are written in the same transaction as the state change that caused
 * them and delivered by the worker, so a crash never loses or duplicates-without-trace a message.
 * Payloads never contain raw link tokens: `link` describes the link and the worker mints it at send time.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    orgId: org(),
    channel: channel().notNull(),
    recipientType: recipientType().notNull(),
    recipientId: uuid().notNull(),
    toAddress: text().notNull(),
    template: text().notNull(),
    payload: jsonb().$type<NotificationPayload>().notNull(),
    subjectType: text({ enum: ['request', 'work_order', 'vendor', 'user'] }).notNull(),
    subjectId: uuid().notNull(),
    status: notificationStatus().notNull().default('queued'),
    attempts: integer().notNull().default(0),
    nextAttemptAt: tstz().notNull().defaultNow(),
    lockedUntil: tstz(),
    lastError: text(),
    providerId: text(),
    sentAt: tstz(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    index('notifications_due_idx').on(t.nextAttemptAt).where(sql`${t.status} = 'queued'`),
    index('notifications_subject_idx').on(t.orgId, t.subjectType, t.subjectId, t.createdAt),
  ],
);

/** Scheduled follow-ups. A reminder fires only if its subject is still in `expectedStatus`. */
export const reminders = pgTable(
  'reminders',
  {
    id: id(),
    orgId: org(),
    type: text().notNull(),
    subjectType: text({ enum: ['request', 'work_order', 'vendor_document'] }).notNull(),
    subjectId: uuid().notNull(),
    expectedStatus: text(),
    dueAt: tstz().notNull(),
    firedAt: tstz(),
    cancelledAt: tstz(),
    lockedUntil: tstz(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    index('reminders_due_idx').on(t.dueAt).where(sql`${t.firedAt} is null and ${t.cancelledAt} is null`),
    index('reminders_subject_idx').on(t.orgId, t.subjectId).where(sql`${t.firedAt} is null and ${t.cancelledAt} is null`),
  ],
);

export interface LinkSpec {
  purpose: 'job' | 'approval' | 'request_track' | 'my_requests' | 'vendor_profile' | 'needs_info' | 'confirm_fix' | 'user_invite' | 'password_reset' | 'email_verify';
  subjectType: 'vendor' | 'tenant' | 'owner' | 'user';
  subjectId: string;
  scopeId: string;
  ttlHours: number;
}

export interface NotificationPayload {
  vars: Record<string, string | number | null>;
  link?: LinkSpec;
}
