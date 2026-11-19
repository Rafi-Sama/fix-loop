import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../../db/client.js';
import { attachments } from '../../db/schema/index.js';
import { assertFound, badRequest, conflict, notFound } from '../../lib/errors.js';
import type { Actor } from '../../shared/actor.js';
import { actorId } from '../../shared/actor.js';
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, type Storage } from './storage.js';

export type AttachmentKind = (typeof attachments.$inferSelect)['kind'];
export type AttachmentSubject = { type: 'request' | 'work_order' | 'vendor'; id: string };

export const uploadRequest = z.object({
  mime: z.enum(ALLOWED_MIME),
  sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
});

/** Step 1: reserve an attachment row and hand back a presigned POST scoped to exactly one key. */
export async function startUpload(
  tx: Tx,
  storage: Storage,
  actor: Actor,
  subject: AttachmentSubject,
  kind: AttachmentKind,
  input: z.infer<typeof uploadRequest>,
) {
  const id = randomUUID();
  // Key is server-chosen: clients can never write outside their org's prefix.
  const fileKey = `${actor.orgId}/${subject.type}/${subject.id}/${id}`;
  await tx.insert(attachments).values({
    id,
    orgId: actor.orgId,
    subjectType: subject.type,
    subjectId: subject.id,
    kind,
    fileKey,
    mime: input.mime,
    sizeBytes: input.sizeBytes,
    uploadedByType: actor.type,
    uploadedById: actorId(actor),
  });
  const upload = await storage.presignUpload(fileKey, input.mime);
  return { attachmentId: id, upload };
}

/** Step 2: verify the object really landed in storage with the declared type before it counts. */
export async function completeUpload(tx: Tx, storage: Storage, attachmentId: string, subject: AttachmentSubject) {
  const [a] = await tx
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, attachmentId), eq(attachments.subjectType, subject.type), eq(attachments.subjectId, subject.id)))
    .for('update');
  assertFound(a, 'Upload');
  if (a.uploaded) return a;
  const head = await storage.head(a.fileKey);
  if (!head) throw conflict('File has not been uploaded yet');
  if (head.size > MAX_UPLOAD_BYTES || head.mime !== a.mime) throw badRequest('Uploaded file does not match what was declared');
  const [done] = await tx.update(attachments).set({ uploaded: true, sizeBytes: head.size }).where(eq(attachments.id, a.id)).returning();
  return done!;
}

/** Confirmed uploads among `ids` that belong to `subject` and have one of `kinds`. */
export async function confirmedAttachments(tx: Tx, subject: AttachmentSubject, ids: string[], kinds: AttachmentKind[]) {
  if (ids.length === 0) return [];
  const rows = await tx
    .select()
    .from(attachments)
    .where(
      and(
        inArray(attachments.id, ids),
        eq(attachments.subjectType, subject.type),
        eq(attachments.subjectId, subject.id),
        inArray(attachments.kind, kinds),
        eq(attachments.uploaded, true),
      ),
    );
  if (rows.length !== new Set(ids).size) throw badRequest('One or more files are missing or not uploaded');
  return rows;
}

type Signable = { id: string; kind: AttachmentKind; mime: string; fileKey: string };
const sign = (storage: Storage, a: Signable) => storage.presignDownload(a.fileKey, a.mime.startsWith('image/') ? undefined : `${a.kind}-${a.id}.pdf`);

/** Adds a signed `url` to each file (local HMAC, no network), so a gallery needs no request per thumbnail. Drops the storage key. */
export const withUrls = <T extends Signable>(storage: Storage, rows: T[]) =>
  Promise.all(rows.map(async ({ fileKey, ...a }) => ({ ...a, url: await sign(storage, { ...a, fileKey }) })));

export async function listAttachments(tx: Tx, storage: Storage, subject: AttachmentSubject, kinds?: AttachmentKind[]) {
  const rows = await tx
    .select({ id: attachments.id, kind: attachments.kind, mime: attachments.mime, sizeBytes: attachments.sizeBytes, createdAt: attachments.createdAt, fileKey: attachments.fileKey })
    .from(attachments)
    .where(
      and(
        eq(attachments.subjectType, subject.type),
        eq(attachments.subjectId, subject.id),
        eq(attachments.uploaded, true),
        kinds ? inArray(attachments.kind, kinds) : undefined,
      ),
    );
  return withUrls(storage, rows);
}

export async function downloadUrl(tx: Tx, storage: Storage, attachmentId: string, allowedSubjects?: AttachmentSubject[]) {
  const [a] = await tx.select().from(attachments).where(and(eq(attachments.id, attachmentId), eq(attachments.uploaded, true)));
  assertFound(a, 'File');
  if (allowedSubjects && !allowedSubjects.some((s) => s.type === a.subjectType && s.id === a.subjectId)) throw notFound('File');
  return sign(storage, a);
}
