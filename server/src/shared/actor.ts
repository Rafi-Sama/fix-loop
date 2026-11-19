/** Who performed an action. Every write to the timeline records one. */
export type Actor =
  | { type: 'user'; id: string; orgId: string; role: 'admin' | 'manager' }
  | { type: 'vendor'; id: string; orgId: string }
  | { type: 'tenant'; id: string | null; orgId: string }
  | { type: 'owner'; id: string; orgId: string }
  | { type: 'system'; orgId: string };

export const actorId = (a: Actor): string | null => (a.type === 'system' ? null : a.id);
