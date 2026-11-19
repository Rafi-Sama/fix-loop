import type { FastifyInstance, FastifyRequest } from 'fastify';
import { withOrg, type Tx } from '../db/client.js';
import { requireVerified, userActor } from '../plugins/auth.js';
import type { Actor } from './actor.js';

/** Run `fn` inside the signed-in user's org (RLS-scoped transaction). */
export function orgTx<T>(app: FastifyInstance, req: FastifyRequest, fn: (tx: Tx, actor: Actor & { type: 'user' }) => Promise<T>) {
  const auth = requireVerified(req);
  return withOrg(app.db, auth.orgId, (tx) => fn(tx, userActor(auth)));
}
