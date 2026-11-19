import { eq, sql } from 'drizzle-orm';
import { ts } from '../db/sql.js';
import type { Db } from '../db/client.js';
import { notifications, organizations, users } from '../db/schema/index.js';
import { linkUrl, mintLink } from '../modules/links/links.service.js';
import { PermanentSendError, type Providers } from '../modules/notifications/providers.js';
import { render } from '../modules/notifications/templates.js';

const BATCH = 50;
const MAX_ATTEMPTS = 6;
type Row = typeof notifications.$inferSelect;

/**
 * Claims due outbox rows with SKIP LOCKED (many workers can run safely), then sends outside the
 * claim transaction. A short lease (`locked_until`) recovers rows from a crashed worker.
 * Delivery is at-least-once: a crash between send and mark can repeat one message.
 */
export async function dispatchNotifications(db: Db, providers: Providers, appUrl: string, now = new Date()): Promise<number> {
  const claimed = await db.execute<Record<string, unknown>>(sql`
    update notifications set locked_until = ${ts(new Date(now.getTime() + 120_000))}, attempts = attempts + 1
    where id in (
      select id from notifications
      where status = 'queued' and next_attempt_at <= ${ts(now)} and (locked_until is null or locked_until < ${ts(now)})
      order by next_attempt_at limit ${BATCH}
      for update skip locked)
    returning id`);
  const ids = claimed.map((r) => r.id as string);
  if (ids.length === 0) return 0;
  const rows = await db.query.notifications.findMany({ where: (n, { inArray }) => inArray(n.id, ids) });
  await Promise.all(rows.map((n) => sendOne(db, providers, appUrl, n, now)));
  return rows.length;
}

async function sendOne(db: Db, providers: Providers, appUrl: string, n: Row, now: Date) {
  try {
    // A suspended firm sends nothing (abuse stops at once). Dropped, not held: un-suspending shouldn't flood people.
    const [org] = await db.select({ suspendedAt: organizations.suspendedAt }).from(organizations).where(eq(organizations.id, n.orgId));
    if (org?.suspendedAt) {
      await db.update(notifications).set({ status: 'skipped', lockedUntil: null, lastError: 'firm suspended' }).where(eq(notifications.id, n.id));
      return;
    }
    // A teammate removed after the message was queued shouldn't keep receiving operational mail.
    if (n.recipientType === 'user') {
      const [u] = await db.select({ active: users.active }).from(users).where(eq(users.id, n.recipientId));
      if (!u?.active) {
        await db.update(notifications).set({ status: 'skipped', lockedUntil: null }).where(eq(notifications.id, n.id));
        return;
      }
    }
    // Mint the link at send time so raw tokens never rest in the outbox.
    const url = n.payload.link ? linkUrl(appUrl, await mintLink(db, n.orgId, n.payload.link, now)) : null;
    const msg = render(n.template, n.payload.vars, url);
    const r = n.channel === 'email' ? await providers.email({ to: n.toAddress, subject: msg.subject, text: msg.text, template: n.template }) : await providers.sms(n.toAddress, msg.sms, n.template);
    await db.update(notifications).set({ status: 'sent', sentAt: new Date(), providerId: r.providerId, lockedUntil: null, lastError: null }).where(eq(notifications.id, n.id));
  } catch (e) {
    const permanent = e instanceof PermanentSendError || n.attempts >= MAX_ATTEMPTS;
    // Exponential backoff: 1, 2, 4, 8, 16 minutes.
    const retryAt = new Date(now.getTime() + 60_000 * 2 ** Math.max(0, n.attempts - 1));
    await db
      .update(notifications)
      .set({ status: permanent ? 'failed' : 'queued', nextAttemptAt: retryAt, lockedUntil: null, lastError: String((e as Error).message ?? e).slice(0, 1000) })
      .where(eq(notifications.id, n.id));
  }
}
