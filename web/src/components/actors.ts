import { useTeam } from '../lib/queries';
import type { ActorName } from './Timeline';

/** Resolves timeline actor ids to names from data already on the page plus the cached team list. */
export function useActorName(known: Partial<Record<'vendor' | 'tenant' | 'owner', { id: string; name: string } | null>>): ActorName {
  const team = useTeam();
  return (type, id) => {
    if (type === 'system') return 'Fixloop';
    if (type === 'user') return team.data?.find((u) => u.id === id)?.name ?? 'Your team';
    const k = known[type];
    if (k && (!id || k.id === id)) return k.name;
    return type === 'tenant' && !id ? 'Submitter' : type.charAt(0).toUpperCase() + type.slice(1);
  };
}
