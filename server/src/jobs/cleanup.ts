import { and, eq, lt, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { accessLinks, attachments, platformSessions, securityEvents, sessions } from '../db/schema/index.js';
import type { Storage } from '../modules/files/storage.js';

const DAY = 86_400_000;

/**
 * Housekeeping, safe to run often:
 * - uploads never confirmed, and public intake drafts never submitted (after 24h)
 * - expired sessions, and links expired for 90+ days (kept a while for audit)
 * - security log entries older than 400 days (a year plus margin for annual reviews)
 */
export async function cleanup(db: Db, storage: Storage, now = new Date()): Promise<{ files: number }> {
  const cutoff = new Date(now.getTime() - DAY);
  const orphans = await db
    .select({ id: attachments.id, fileKey: attachments.fileKey })
    .from(attachments)
    .where(
      and(
        lt(attachments.createdAt, cutoff),
        or(
          eq(attachments.uploaded, false),
          sql`${attachments.subjectType} = 'request' and not exists (select 1 from maintenance_requests r where r.id = ${attachments.subjectId})`,
        ),
      ),
    )
    .limit(500);
  for (const o of orphans) {
    // Delete the object first: a leftover row is retried next run, a leftover object would leak storage.
    await storage.delete(o.fileKey).catch(() => undefined);
    await db.delete(attachments).where(eq(attachments.id, o.id));
  }
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  await db.delete(platformSessions).where(lt(platformSessions.expiresAt, now));
  await db.delete(securityEvents).where(lt(securityEvents.at, new Date(now.getTime() - 400 * DAY)));
  await db.delete(accessLinks).where(lt(accessLinks.expiresAt, new Date(now.getTime() - 90 * DAY)));
  return { files: orphans.length };
}
