import { and, eq, isNull } from 'drizzle-orm';
import type { Tx } from '../db/client.js';
import { reminders } from '../db/schema/index.js';

export interface ReminderInput {
  type: string;
  dueAt: Date;
  expectedStatus: string | null;
}

/** Cancel all pending reminders for a subject and schedule `next` in the same transaction. */
export async function replaceReminders(
  tx: Tx,
  orgId: string,
  subject: { type: 'request' | 'work_order' | 'vendor_document'; id: string },
  next: ReminderInput[],
  now = new Date(),
): Promise<void> {
  await tx
    .update(reminders)
    .set({ cancelledAt: now })
    .where(
      and(
        eq(reminders.orgId, orgId),
        eq(reminders.subjectId, subject.id),
        isNull(reminders.firedAt),
        isNull(reminders.cancelledAt),
      ),
    );
  if (next.length) {
    await tx.insert(reminders).values(
      next.map((r) => ({ orgId, type: r.type, subjectType: subject.type, subjectId: subject.id, expectedStatus: r.expectedStatus, dueAt: r.dueAt })),
    );
  }
}
