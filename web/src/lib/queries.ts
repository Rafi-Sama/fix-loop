/** Every server read goes through these hooks, so each resource has one query key and one cache entry. */
import { keepPreviousData, MutationCache, QueryCache, QueryClient, useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api, ApiError, type Query } from './api';
import type {
  Category,
  Dashboard,
  Me,
  OrgSettings,
  Owner,
  Page,
  PropertyDetail,
  PropertyRow,
  RequestDetail,
  RequestRow,
  Session,
  TeamUser,
  TenantDetail,
  TenantRow,
  VendorDetail,
  Vendor,
  WoDetail,
  WoRow,
} from './types';

export const keys = {
  me: ['me'] as const,
  org: ['org'] as const,
  categories: ['categories'] as const,
  team: ['team'] as const,
  sessions: ['sessions'] as const,
  dashboard: (days: number) => ['dashboard', days] as const,
  requests: (q: Query) => ['requests', 'list', q] as const,
  request: (id: string) => ['requests', id] as const,
  workOrders: (q: Query) => ['work-orders', 'list', q] as const,
  workOrder: (id: string) => ['work-orders', id] as const,
  properties: (q: Query) => ['properties', 'list', q] as const,
  property: (id: string) => ['properties', id] as const,
  unitHistory: (id: string) => ['units', id] as const,
  owners: (q: Query) => ['owners', 'list', q] as const,
  owner: (id: string) => ['owners', id] as const,
  tenants: (q: Query) => ['tenants', 'list', q] as const,
  tenant: (id: string) => ['tenants', id] as const,
  vendors: (q: Query) => ['vendors', 'list', q] as const,
  vendor: (id: string) => ['vendors', id] as const,
  report: (name: string, q: Query) => ['reports', name, q] as const,
};

/** Set when the server ended the session (not a sign-out here), so the sign-in page can say why it appeared. */
export const sessionLost = { flag: false };

/**
 * A 401 on any call means the session ended (expired, signed out elsewhere, user deactivated, firm suspended).
 * Drop every cached firm record and flip `me` to null; the auth gate then sends the user to sign in.
 */
function onSessionLost(e: unknown) {
  if (!(e instanceof ApiError) || e.status !== 401 || !queryClient.getQueryData(keys.me)) return;
  sessionLost.flag = true;
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
  queryClient.setQueryData(keys.me, null);
}

export const queryClient: QueryClient = new QueryClient({
  // Superadmin console queries ('ops') have their own session; a 401 there must not sign the firm user out.
  queryCache: new QueryCache({ onError: (e, q) => q.queryKey[0] !== 'ops' && onSessionLost(e) }),
  mutationCache: new MutationCache({ onError: onSessionLost }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2,
    },
    mutations: { retry: false },
  },
});


// ---------------------------------------------------------------- session & org

export const useMe = () =>
  useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api<Me>('/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60_000,
  });

/** Signed-in user; only call below the auth gate. */
let lastUser: Me | null = null;
export function useUser(): Me {
  const { data } = useMe();
  if (data) lastUser = data;
  // When the session ends, a page can re-render once before the gate redirects; keep the last user for that render instead of crashing.
  if (!lastUser) throw new Error('useUser outside the auth gate');
  return lastUser;
}

export const useOrg = () => useQuery({ queryKey: keys.org, queryFn: () => api<OrgSettings>('/org'), staleTime: 5 * 60_000 });
export const useCategories = () => useQuery({ queryKey: keys.categories, queryFn: () => api<Category[]>('/org/categories'), staleTime: 5 * 60_000 });
export const useTeam = () => useQuery({ queryKey: keys.team, queryFn: () => api<TeamUser[]>('/org/users'), staleTime: 5 * 60_000 });
export const useSessions = () => useQuery({ queryKey: keys.sessions, queryFn: () => api<Session[]>('/auth/sessions') });

// ---------------------------------------------------------------- lists (keyset pagination)

export function useList<T>(key: QueryKey, path: string, q: Query, enabled = true) {
  return useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam, signal }) => api<Page<T>>(path, { query: { ...q, cursor: pageParam ?? undefined }, signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export const flat = <T,>(data: { pages: Page<T>[] } | undefined): T[] => data?.pages.flatMap((p) => p.items) ?? [];

export const useRequests = (q: Query) => useList<RequestRow>(keys.requests(q), '/requests', q);
export const useWorkOrders = (q: Query) => useList<WoRow>(keys.workOrders(q), '/work-orders', q);
export const useProperties = (q: Query) => useList<PropertyRow>(keys.properties(q), '/properties', q);
export const useOwners = (q: Query) => useList<Owner>(keys.owners(q), '/owners', q);
export const useTenants = (q: Query, enabled = true) => useList<TenantRow>(keys.tenants(q), '/tenants', q, enabled);
export const useVendors = (q: Query) => useList<Vendor>(keys.vendors(q), '/vendors', q);

// ---------------------------------------------------------------- details

export const useDashboard = (days: number) =>
  useQuery({ queryKey: keys.dashboard(days), queryFn: () => api<Dashboard>('/dashboard', { query: { days } }), refetchInterval: 60_000, placeholderData: keepPreviousData });
export const useRequest = (id: string) => useQuery({ queryKey: keys.request(id), queryFn: () => api<RequestDetail>(`/requests/${id}`), enabled: Boolean(id) })
export const useWorkOrder = (id: string) => useQuery({ queryKey: keys.workOrder(id), queryFn: () => api<WoDetail>(`/work-orders/${id}`), enabled: Boolean(id) })
export const useProperty = (id: string) => useQuery({ queryKey: keys.property(id), queryFn: () => api<PropertyDetail>(`/properties/${id}`), enabled: Boolean(id) })
export const useOwner = (id: string) => useQuery({ queryKey: keys.owner(id), queryFn: () => api<Owner>(`/owners/${id}`), enabled: Boolean(id) })
export const useTenant = (id: string) => useQuery({ queryKey: keys.tenant(id), queryFn: () => api<TenantDetail>(`/tenants/${id}`), enabled: Boolean(id) })
export const useVendor = (id: string) => useQuery({ queryKey: keys.vendor(id), queryFn: () => api<VendorDetail>(`/vendors/${id}`), enabled: Boolean(id) })
export const useReport = <T,>(name: string, path: string, q: Query, enabled = true) =>
  useQuery({ queryKey: keys.report(name, q), queryFn: () => api<T>(path, { query: q }), placeholderData: keepPreviousData, enabled });

// ---------------------------------------------------------------- mutations

/**
 * A server command plus the cache roots it touches. Roots are prefixes (['work-orders'] refreshes lists and details),
 * and the dashboard is always refreshed because almost every command moves its counts.
 */
export function useCommand<V, R = unknown>(fn: (v: V) => Promise<R>, roots: readonly (readonly unknown[])[] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all([...roots, ['dashboard']].map((k) => qc.invalidateQueries({ queryKey: k }))),
  });
}
