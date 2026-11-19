import { useSyncExternalStore } from 'react';

/**
 * Dashboard period shared by the dashboard and the app shell, so both read the same cached query
 * instead of polling two periods. Kept for the browser session only.
 */
const KEY = 'fixloop.dashboardDays';
const read = () => {
  try {
    const n = Number(sessionStorage.getItem(KEY));
    return [7, 30, 90].includes(n) ? n : 30;
  } catch {
    return 30;
  }
};
let days = read();
const listeners = new Set<() => void>();

export function setDashboardDays(n: number) {
  days = n;
  try {
    sessionStorage.setItem(KEY, String(n));
  } catch {
    // Storage can be unavailable (private mode); the in-memory value still works.
  }
  for (const l of listeners) l();
}

export const useDashboardDays = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => days,
  );
