import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dbCredentials: { url: process.env.DATABASE_OWNER_URL ?? 'postgres://owner:owner@localhost:5433/fixloop' },
  casing: 'snake_case',
  strict: true,
});
