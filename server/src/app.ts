import cookie from '@fastify/cookie';
import { sql } from 'drizzle-orm';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Env } from './config/env.js';
import type { Db } from './db/client.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import type { Storage } from './modules/files/storage.js';
import { filesRoutes } from './modules/files/files.routes.js';
import { linkRoutes } from './modules/links/links.routes.js';
import { orgRoutes } from './modules/org/org.routes.js';
import { platformRoutes } from './modules/platform/platform.routes.js';
import { portfolioRoutes } from './modules/portfolio/portfolio.routes.js';
import { publicRoutes } from './modules/public/public.routes.js';
import { reportRoutes } from './modules/reports/reports.routes.js';
import { requestRoutes } from './modules/requests/requests.routes.js';
import { vendorRoutes } from './modules/vendors/vendors.routes.js';
import { workOrderRoutes } from './modules/work-orders/work-orders.routes.js';
import { authPlugin } from './plugins/auth.js';
import { errorsPlugin } from './plugins/errors.js';
import { securityPlugin } from './plugins/security.js';

export interface AppDeps {
  config: Env;
  db: Db;
  storage: Storage;
}

declare module 'fastify' {
  interface FastifyInstance extends AppDeps {}
}

export type App = FastifyInstance;

export async function buildApp(deps: AppDeps, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const production = deps.config.NODE_ENV === 'production';
  const app = Fastify({
    logger: opts.logger === false ? false : {
      level: deps.config.LOG_LEVEL,
      // Never log credentials, session cookies or link tokens.
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
      serializers: { req: (r) => ({ method: r.method, url: r.url.replace(/\/links\/[^/?]+/, '/links/[token]'), id: r.id }) },
      ...(production ? {} : { transport: { target: 'pino-pretty' } }),
    },
    // Files go straight to S3, so JSON bodies can stay small.
    bodyLimit: 1024 * 1024,
    // Trust exactly TRUST_PROXY hops of X-Forwarded-For, never more.
    trustProxy: (_addr: string, hop: number) => hop < deps.config.TRUST_PROXY,
    requestIdHeader: 'x-request-id',
    // Two lines per request drown everything else in `pnpm dev`; errors are still logged.
    logController: new LogController({ disableRequestLogging: !production && !['debug', 'trace'].includes(deps.config.LOG_LEVEL) }),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('config', deps.config);
  app.decorate('db', deps.db);
  app.decorate('storage', deps.storage);

  await app.register(errorsPlugin);
  await app.register(cookie);
  await app.register(authPlugin);
  await app.register(securityPlugin);

  // Liveness (process up) vs readiness (can serve: DB reachable). Load balancers should use /ready.
  app.get('/health', { config: { rateLimit: false } }, async () => ({ ok: true }));
  app.get('/ready', { config: { rateLimit: false } }, async (_req, reply) => {
    try {
      await deps.db.execute(sql`select 1`);
      return { ok: true };
    } catch {
      return reply.status(503).send({ ok: false });
    }
  });

  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(orgRoutes, { prefix: '/org' });
  await app.register(platformRoutes, { prefix: '/platform' });
  await app.register(portfolioRoutes);
  await app.register(vendorRoutes, { prefix: '/vendors' });
  await app.register(requestRoutes, { prefix: '/requests' });
  await app.register(workOrderRoutes, { prefix: '/work-orders' });
  await app.register(dashboardRoutes, { prefix: '/dashboard' });
  await app.register(reportRoutes, { prefix: '/reports' });
  await app.register(filesRoutes, { prefix: '/files' });
  await app.register(publicRoutes, { prefix: '/public' });
  await app.register(linkRoutes, { prefix: '/links' });

  return app;
}
