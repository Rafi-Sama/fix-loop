/** Two-step presigned upload: reserve on the API, POST the bytes straight to S3, then confirm. */
import { ApiError } from './api';

export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'] as const;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const ACCEPT_IMAGES = 'image/jpeg,image/png,image/webp,image/heic';
export const ACCEPT_DOCS = `${ACCEPT_IMAGES},application/pdf`;

export interface Presigned {
  attachmentId: string;
  upload: { url: string; fields: Record<string, string> };
}

export function checkFile(file: File): string | null {
  if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) return `${file.name}: use JPG, PNG, WebP, HEIC or PDF`;
  if (file.size > MAX_UPLOAD_BYTES) return `${file.name} is over 15 MB`;
  if (file.size === 0) return `${file.name} is empty`;
  return null;
}

export async function uploadFile(
  file: File,
  start: (meta: { mime: string; sizeBytes: number }) => Promise<Presigned>,
  complete: (attachmentId: string) => Promise<unknown>,
): Promise<string> {
  const problem = checkFile(file);
  if (problem) throw new ApiError(400, 'bad_file', problem);
  const { attachmentId, upload } = await start({ mime: file.type, sizeBytes: file.size });
  const form = new FormData();
  for (const [k, v] of Object.entries(upload.fields)) form.append(k, v);
  form.append('file', file);
  const res = await fetch(upload.url, { method: 'POST', body: form });
  if (!res.ok) throw new ApiError(res.status, 'upload_failed', `Upload of ${file.name} failed`);
  await complete(attachmentId);
  return attachmentId;
}
