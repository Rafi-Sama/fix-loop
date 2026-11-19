import postgres from 'postgres';
import { runMigrations } from '../src/db/migrate.js';

const OWNER_URL = 'postgres://owner:owner@localhost:5433/fixloop_test';

export default async function setup() {
  // Fresh schema every run so migrations themselves are tested.
  const sql = postgres(OWNER_URL, { max: 1, onnotice: () => {} });
  await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;');
  await sql.end();
  await runMigrations(OWNER_URL);
}
