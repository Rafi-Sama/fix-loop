import type { FastifyError, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';

/** One error shape for every failure: { error: { code, message, details? } }. Never leaks stack traces. */
export const errorsPlugin = fp(async (app: FastifyInstance) => {
  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.status(400).send({
        error: {
          code: 'validation_failed',
          message: 'Request validation failed',
          details: err.validation.map((v) => ({ path: v.instancePath, message: v.message })),
        },
      });
    }
    if (isResponseSerializationError(err)) {
      req.log.error({ err, issues: err.cause.issues }, 'response serialization failed');
      return reply.status(500).send({ error: { code: 'internal', message: 'Internal error' } });
    }
    // Postgres constraint violations that slip past service checks.
    // Drizzle wraps driver errors; the Postgres error (with its SQLSTATE) is the cause.
    const pg = ((err as { cause?: unknown }).cause ?? err) as { code?: string; constraint_name?: string };
    if (pg.code === '23505') {
      // Constraint names describe the schema; keep them in the log, not the response.
      req.log.info({ constraint: pg.constraint_name }, 'unique violation');
      return reply.status(409).send({ error: { code: 'conflict', message: 'Already exists' } });
    }
    if (pg.code === '23503') return reply.status(400).send({ error: { code: 'bad_reference', message: 'Referenced record not found' } });
    if (pg.code === '57014') {
      req.log.error({ err }, 'statement timeout');
      return reply.status(503).send({ error: { code: 'timeout', message: 'Request took too long, try again' } });
    }
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    if (status === 500) req.log.error({ err }, 'unhandled error');
    return reply.status(status).send({
      error: { code: status === 500 ? 'internal' : (err.code ?? 'error').toLowerCase(), message: status === 500 ? 'Internal error' : err.message },
    });
  });

  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: 'not_found', message: 'Route not found' } }));
});
