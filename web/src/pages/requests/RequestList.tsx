import { AlertTriangle, Inbox, Plus, ShieldQuestion } from 'lucide-react';
import { PropertySelect } from '../../components/pickers';
import { Box, ButtonLink, Empty, LoadError, LoadMore, Prio, RefTag, ReqStamp, RowsSkeleton, Search } from '../../components/ui';
import { PRIORITIES, PRIORITY_LABEL, relative, REQUEST_STATUS_LABEL, REQUEST_STATUSES, type RequestStatus } from '../../lib/format';
import { useFilters, useSearchFilter } from '../../lib/hooks';
import { flat, useRequests } from '../../lib/queries';
import { Link } from 'react-router';

const OPEN: RequestStatus[] = ['new', 'needs_info', 'in_progress'];

export default function RequestList() {
  const [f, set] = useFilters(['q', 'status', 'priority', 'propertyId'] as const);
  const [text, setText] = useSearchFilter(f.q, (q) => set({ q }));
  const status = f.status === 'open' ? OPEN : f.status ? (f.status.split(',') as RequestStatus[]) : undefined;
  const list = useRequests({ q: f.q, status, priority: f.priority, propertyId: f.propertyId, limit: 30 });
  const rows = flat(list.data);
  const filtered = Boolean(f.q || f.status || f.priority || f.propertyId);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Maintenance requests</h1>
          <p className="sub">Every reported problem, from tenants and from you.</p>
        </div>
        <ButtonLink to="/requests/new" variant="primary" icon={Plus}>
          Log a request
        </ButtonLink>
      </div>
      <search className="toolbar">
        <Search value={text} onChange={setText} placeholder="Search ref, title, tenant, address" />
        <select className="select" aria-label="Status" value={f.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="">All statuses</option>
          <option value="open">Open (new, needs info, in progress)</option>
          {REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {REQUEST_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select className="select" aria-label="Priority" value={f.priority} onChange={(e) => set({ priority: e.target.value })}>
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        <PropertySelect value={f.propertyId} onChange={(propertyId) => set({ propertyId })} />
        {filtered && (
          <button type="button" className="btn ghost sm" onClick={() => { setText(''); set({ q: '', status: '', priority: '', propertyId: '' }); }}>
            Clear filters
          </button>
        )}
      </search>
      <Box flush lift>
        {list.isError ? (
          <LoadError error={list.error} retry={() => list.refetch()} />
        ) : list.isPending ? (
          <RowsSkeleton />
        ) : rows.length === 0 ? (
          <Empty icon={Inbox} title={filtered ? 'No requests match' : 'No requests yet'} action={!filtered && <ButtonLink to="/settings/intake">Share your tenant request link</ButtonLink>}>
            {filtered ? 'Try a different status or clear the filters.' : 'Tenants report issues through your request link, or you can log one for them.'}
          </Empty>
        ) : (
          <ul className="rows" style={{ opacity: list.isPlaceholderData ? 0.6 : 1, transition: 'opacity 150ms' }}>
            {rows.map((r) => (
              <li key={r.id}>
                <Link to={`/requests/${r.id}`} className="row resp" style={{ gridTemplateColumns: '128px minmax(0,1fr) 110px 120px 90px' }}>
                  <RefTag refNo={r.ref} />
                  <div className="min0">
                    <div className="row-title hstack" style={{ flexWrap: 'nowrap' }}>
                      {r.isEmergency && <AlertTriangle size={14} color="var(--serial)" aria-label="Emergency" />}
                      <span className="row-title">{r.title}</span>
                    </div>
                    <div className="row-sub">
                      {r.address}
                      {r.unitLabel !== 'Main' && ` #${r.unitLabel}`} · {r.tenantName ?? 'No tenant'}
                      {!r.verifiedTenant && r.source === 'tenant_link' && (
                        <span title="Submitter didn’t match a tenant record" style={{ color: 'var(--amber)' }}>
                          {' '}
                          <ShieldQuestion size={12} style={{ display: 'inline', verticalAlign: '-2px' }} /> unverified
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="hide-sm">
                    <Prio p={r.priority} />
                  </span>
                  <span className="hide-sm">
                    <ReqStamp s={r.status} />
                  </span>
                  <span className="small muted" style={{ textAlign: 'right' }} title={r.createdAt}>
                    {relative(r.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <LoadMore hasNext={list.hasNextPage} loading={list.isFetchingNextPage} onMore={() => list.fetchNextPage()} />
      </Box>
    </>
  );
}
