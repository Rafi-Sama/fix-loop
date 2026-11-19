import type { Tx } from '../db/client.js';
import { events } from '../db/schema/index.js';
import { actorId, type Actor } from './actor.js';

export interface EventInput {
  subjectType: 'request' | 'work_order';
  subjectId: string;
  type: string;
  actor: Actor;
  /** Set when a PM performs a vendor/tenant step on their behalf ("proxy update"). */
  onBehalfOf?: string | null;
  visibility?: 'internal' | 'shared';
  payload?: Record<string, unknown>;
}

export async function recordEvent(tx: Tx, e: EventInput): Promise<void> {
  await tx.insert(events).values({
    orgId: e.actor.orgId,
    subjectType: e.subjectType,
    subjectId: e.subjectId,
    type: e.type,
    actorType: e.actor.type,
    actorId: actorId(e.actor),
    onBehalfOf: e.onBehalfOf ?? null,
    visibility: e.visibility ?? 'shared',
    payload: e.payload ?? {},
  });
}
