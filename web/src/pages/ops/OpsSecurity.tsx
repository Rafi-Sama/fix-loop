import { ShieldAlert, UserCog } from 'lucide-react';
import { Link } from 'react-router';
import { Box, Check, Empty, LoadError, LoadMore, RowsSkeleton, Search, Segmented } from '../../components/ui';
import { dateTime, relative } from '../../lib/format';
import { useFilters, useSearchFilter } from '../../lib/hooks';
import { flat } from '../../lib/queries';
import { eventDetail, eventLabel, isFailure, useAdmins, useEvents, type SecurityEvent } from './ops';

/** Short browser + OS from a user agent, enough to tell devices apart. */
const device = (ua: string | null) => {
  if (!ua) return null;
  if (ua.startsWith('superadmin-cli')) return 'Command line';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return [browser, os].filter(Boolean).join(' on ');
};

export function EventsTable({ list, showFirm = true, empty }: { list: ReturnType<typeof useEvents>; showFirm?: boolean; empty: string }) {
  const rows = flat(list.data);
  if (list.isError) return <LoadError error={list.error} retry={() => list.refetch()} />;
  if (list.isPending) return <RowsSkeleton />;
  if (rows.length === 0) return <Empty icon={ShieldAlert} title="No events">{empty}</Empty>;
  return (
    <>
      <table className="tbl">
        <thead>
          <tr>
            <th>When</th>
            <th>Event</th>
            <th className="hide-sm">Who</th>
            {showFirm && <th className="hide-sm">Firm</th>}
            <th className="hide-sm">From</th>
          </tr>
        </thead>
        <tbody style={{ opacity: list.isPlaceholderData ? 0.6 : 1 }}>
          {rows.map((e: SecurityEvent) => (
            <tr key={e.id}>
              <td className="small" style={{ whiteSpace: 'nowrap' }} title={dateTime(e.createdAt)}>{relative(e.createdAt)}</td>
              <td>
                <span className="strong" style={isFailure(e.type) ? { color: 'var(--serial)' } : undefined}>{eventLabel(e.type)}</span>
                {eventDetail(e) && <div className="row-sub">{eventDetail(e)}</div>}
                <div className="row-sub show-sm">{[e.platformAdminEmail ?? e.userEmail ?? e.email, showFirm && e.orgName].filter(Boolean).join(' · ')}</div>
              </td>
              <td className="hide-sm small">
                {e.platformAdminEmail ? <span title="Fixloop staff">{e.platformAdminEmail}</span> : (e.userEmail ?? e.email ?? '—')}
              </td>
              {showFirm && <td className="hide-sm small">{e.orgId && e.orgName ? <Link to={`/ops/firms/${e.orgId}`}>{e.orgName}</Link> : '—'}</td>}
              <td className="hide-sm small">
                <span className="mono">{e.ip ?? '—'}</span>
                {device(e.userAgent) && <div className="row-sub">{device(e.userAgent)}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <LoadMore hasNext={list.hasNextPage} loading={list.isFetchingNextPage} onMore={() => list.fetchNextPage()} />
    </>
  );
}

export function SecurityLog() {
  const [f, set] = useFilters(['q', 'type', 'failuresOnly', 'orgId', 'userId'] as const);
  const [text, setText] = useSearchFilter(f.q, (q) => set({ q }));
  const group = (['auth', 'team', 'platform'].includes(f.type) ? f.type : f.type ? 'exact' : 'all') as 'all' | 'auth' | 'team' | 'platform' | 'exact';
  const list = useEvents({ q: f.q, type: f.type || undefined, failuresOnly: f.failuresOnly === 'true' || undefined, orgId: f.orgId || undefined, userId: f.userId || undefined, limit: 50 });
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Security log</h1>
          <p className="sub">Sign-ins, lockouts, team changes and every superadmin action. Kept 400 days; the app can add entries but never change or delete them.</p>
        </div>
      </div>
      <search className="toolbar">
        <Search value={text} onChange={setText} placeholder="Email, IP address or firm" />
        <Segmented
          label="Kind"
          value={group === 'exact' ? 'all' : group}
          onChange={(v) => set({ type: v === 'all' ? '' : v })}
          options={[{ value: 'all', label: 'Everything' }, { value: 'auth', label: 'Sign-in' }, { value: 'team', label: 'Team' }, { value: 'platform', label: 'Fixloop staff' }]}
        />
        <Check label="Failures only" checked={f.failuresOnly === 'true'} onChange={(e) => set({ failuresOnly: e.target.checked ? 'true' : '' })} />
      </search>
      {(group === 'exact' || f.orgId || f.userId) && (
        <p className="small muted" style={{ marginBottom: 12 }}>
          Filtered{group === 'exact' && <> to “{eventLabel(f.type)}”</>}
          {f.orgId && ' to one firm'}
          {f.userId && ' to one user'}. <button type="button" className="btn ghost sm" onClick={() => set({ type: group === 'exact' ? '' : f.type, orgId: '', userId: '' })}>Clear</button>
        </p>
      )}
      <Box flush lift>
        <EventsTable list={list} empty={f.q || f.type || f.failuresOnly ? 'Nothing matches these filters.' : 'Events appear as people sign in and change things.'} />
      </Box>
    </>
  );
}

export function Admins() {
  const q = useAdmins();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Superadmins</h1>
          <p className="sub">
            Managed from the server with <span className="mono">pnpm superadmin add | reset | disable</span>, never from the browser.
          </p>
        </div>
      </div>
      <Box flush lift>
        {q.isError ? (
          <LoadError error={q.error} retry={() => q.refetch()} />
        ) : q.isPending ? (
          <RowsSkeleton n={2} />
        ) : q.data.length === 0 ? (
          <Empty icon={UserCog} title="No superadmins">Run pnpm superadmin add on the server.</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th className="hide-sm">Last sign-in</th>
                <th className="r">Status</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((a) => (
                <tr key={a.id}>
                  <td>
                    <span className="strong">{a.name}</span>
                    <div className="row-sub">{a.email}</div>
                  </td>
                  <td className="hide-sm small">{a.lastLoginAt ? relative(a.lastLoginAt) : 'Never'}</td>
                  <td className="r">{a.active ? <span className="pill ok">Active</span> : <span className="pill">Disabled</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Box>
    </>
  );
}
