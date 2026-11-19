import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabase } from './client.js';

export const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));

export async function runMigrations(ownerUrl: string): Promise<void> {
  const { db, close } = createDatabase(ownerUrl, { max: 1, appName: 'fixloop-migrate' });
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_OWNER_URL;
  if (!url) throw new Error('DATABASE_OWNER_URL is required');
  await runMigrations(url);
  console.info('migrations applied');
}
