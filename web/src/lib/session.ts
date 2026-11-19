import { api } from './api';
import { keys, queryClient } from './queries';

/** End this device's session and drop every cached server read before leaving the app. */
export async function signOut(go: (path: string, opts: { replace: boolean }) => void) {
  await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
  queryClient.clear();
  queryClient.setQueryData(keys.me, null);
  go('/login', { replace: true });
}
