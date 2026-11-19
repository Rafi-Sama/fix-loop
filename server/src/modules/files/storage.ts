import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from '../../config/env.js';

export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const SIGN_BUCKET_MS = 5 * 60_000;

export interface PresignedUpload {
  url: string;
  fields: Record<string, string>;
  expiresInSeconds: number;
}

export interface Storage {
  presignUpload(key: string, mime: AllowedMime, maxBytes?: number): Promise<PresignedUpload>;
  head(key: string): Promise<{ size: number; mime: string | undefined } | null>;
  presignDownload(key: string, filename?: string): Promise<string>;
  delete(key: string): Promise<void>;
  ensureBucket(): Promise<void>;
}

export function createStorage(env: Env): Storage {
  const s3 = new S3Client({
    region: env.S3_REGION,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });
  const Bucket = env.S3_BUCKET;

  return {
    async presignUpload(key, mime, maxBytes = MAX_UPLOAD_BYTES) {
      const expiresInSeconds = 600;
      // The policy pins key, exact content type and size range: S3 itself rejects anything else.
      const { url, fields } = await createPresignedPost(s3, {
        Bucket,
        Key: key,
        Conditions: [['content-length-range', 1, maxBytes], ['eq', '$Content-Type', mime]],
        Fields: { 'Content-Type': mime },
        Expires: expiresInSeconds,
      });
      return { url, fields, expiresInSeconds };
    },
    async head(key) {
      try {
        const r = await s3.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { size: r.ContentLength ?? 0, mime: r.ContentType };
      } catch (e) {
        const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status === 404 || status === 403) return null;
        throw e;
      }
    },
    presignDownload(key, filename) {
      return getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket,
          Key: key,
          // Force download for non-images so a crafted PDF/HTML can't render inline on our domain.
          ...(filename ? { ResponseContentDisposition: `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"` } : {}),
        }),
        // Signing time is bucketed so repeat fetches return the same URL and the browser's image cache hits.
        // Every URL stays valid for at least 10 minutes after it is handed out.
        { expiresIn: 900, signingDate: new Date(Math.floor(Date.now() / SIGN_BUCKET_MS) * SIGN_BUCKET_MS) },
      );
    },
    async delete(key) {
      await s3.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
    async ensureBucket() {
      try {
        await s3.send(new HeadBucketCommand({ Bucket }));
      } catch {
        await s3.send(new CreateBucketCommand({ Bucket }));
      }
    },
  };
}
