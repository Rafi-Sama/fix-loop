import { sql } from 'drizzle-orm';
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { createDatabase } from './db/client.js';
import { createStorage } from './modules/files/storage.js';

const { db, close } = createDatabase(env.DATABASE_URL, { max: env.DB_POOL_MAX, appName: 'fixloop-api' });
// Refuse to serve if the API role could bypass row-level security (superuser, BYPASSRLS, or table owner).
const [role] = await db.execute<{ unsafe: boolean }>(sql`
  select r.rolsuper or r.rolbypassrls or exists (select 1 from pg_tables where schemaname = 'public' and tableowner = current_user) as unsafe
  from pg_roles r where r.rolname = current_user`);
if (role?.unsafe && env.NODE_ENV === 'production') throw new Error('DATABASE_URL role can bypass row-level security; use the app_user role');
if (role?.unsafe) console.warn('WARNING: DATABASE_URL role can bypass row-level security');

const storage = createStorage(env);
if (env.NODE_ENV !== 'production') await storage.ensureBucket();

const app = await buildApp({ config: env, db, storage });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  // Stop accepting connections, let in-flight requests finish, then release the pool.
  await app.close();
  await close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Dev listens on localhost only: the browser and phones reach it through Vite's proxy, so the API needn't be on the LAN.
await app.listen({ port: env.PORT, host: env.HOST ?? (env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost') });
