import { sql } from 'drizzle-orm';
import { timestamp, uuid } from 'drizzle-orm/pg-core';

export const id = () => uuid().primaryKey().default(sql`gen_random_uuid()`);
export const orgId = () => uuid().notNull();
export const tstz = () => timestamp({ withTimezone: true, mode: 'date' });

export const timestamps = {
  // Millisecond precision, like a JS Date: list cursors carry created_at, and microseconds made rows that
  // shared a millisecond (one transaction, bulk inserts) vanish from the next page.
  createdAt: timestamp({ withTimezone: true, mode: 'date', precision: 3 }).notNull().defaultNow(),
  updatedAt: tstz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
