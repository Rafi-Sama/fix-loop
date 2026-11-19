import { sql } from 'drizzle-orm';

/** A Date as a timestamptz parameter inside raw `sql` templates (postgres.js can't serialise Date there). */
export const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;
