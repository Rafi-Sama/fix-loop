import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type Db = PostgresJsDatabase<typeof schema>;
/** A transaction handle; services take this so callers control transaction boundaries. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

export interface Database {
  db: Db;
  close(): Promise<void>;
}

export function createDatabase(url: string, opts: { max?: number; appName?: string } = {}): Database {
  const client = postgres(url, {
    max: opts.max ?? 10,
    idle_timeout: 30,
    connect_timeout: 10,
    // Fail fast instead of piling up behind a runaway query.
    connection: { application_name: opts.appName ?? 'fixloop', statement_timeout: 15_000 },
    // Transaction-mode poolers (PgBouncer, Supavisor) don't support named prepared statements.
    prepare: false,
    onnotice: () => {},
  });
  const db = drizzle(client, { schema, casing: 'snake_case' });
  return { db, close: () => client.end({ timeout: 5 }) };
}

/**
 * Runs `fn` in a transaction whose row-level-security context is `orgId`.
 * `set_config(..., true)` is transaction-local, so it is safe with pooled connections.
 */
export async function withOrg<T>(db: Db, orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return fn(tx);
  });
}
