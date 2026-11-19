import { and, eq, lt, or, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { z } from 'zod';

export const uuid = z.uuid();
export const idParams = z.object({ id: z.uuid() });

const trimmed = (max: number) => z.string().trim().min(1).max(max);
export const shortText = trimmed(200);
export const longText = trimmed(5000);
export const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullish();

export const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** US-first E.164 normalisation: "(512) 555-0100" → "+15125550100". */
export const phone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const digits = v.replace(/[^\d+]/g, '');
    const e164 = digits.startsWith('+') ? digits : digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith('1') ? `+${digits}` : null;
    if (!e164 || !/^\+[1-9]\d{7,14}$/.test(e164)) {
      ctx.addIssue({ code: 'custom', message: 'Invalid phone number' });
      return z.NEVER;
    }
    return e164;
  });

export const cents = z.number().int().min(0).max(100_000_000);

/** Keyset pagination over (createdAt desc, id desc). */
export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(200).optional(),
});

export interface Cursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString('base64url');
}

export function decodeCursor(cursor: string | undefined): Cursor | undefined {
  if (!cursor) return undefined;
  const [ts, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const createdAt = new Date(ts ?? '');
  if (!id || Number.isNaN(createdAt.getTime()) || !uuid.safeParse(id).success) return undefined;
  return { createdAt, id };
}

/** Keyset page: `(created_at, id) < cursor`, newest first. */
export function keyset(table: { createdAt: PgColumn; id: PgColumn }, cursor?: string): SQL | undefined {
  const c = decodeCursor(cursor);
  return c ? or(lt(table.createdAt, c.createdAt), and(eq(table.createdAt, c.createdAt), lt(table.id, c.id))) : undefined;
}

/** Callers fetch `limit + 1` rows; the extra one only says whether there is a next page. */
export function page<T extends { createdAt: Date; id: string }>(rows: T[], limit: number) {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
}

/** Escape LIKE wildcards so user search text is matched literally. */
export const likeEscape = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);
