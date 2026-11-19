import { Wrench } from 'lucide-react';
import { Link } from 'react-router';
import { PropertySelect } from '../../components/pickers';
import { Box, Empty, LoadError, LoadMore, PartyChip, Prio, RefTag, RowsSkeleton, Search, WoStamp } from '../../components/ui';
import { duration, hoursSince, OPEN_WO, PRIORITIES, PRIORITY_LABEL, WO_STATUS_LABEL, WO_STATUSES, date, type WoStatus } from '../../lib/format';
import { useFilters, useSearchFilter } from '../../lib/hooks';
import { flat, useVendors, useWorkOrders } from '../../lib/queries';

export default function WorkOrderList() {
  const [f, set] = useFilters(['q', 'status', 'priority', 'propertyId', 'vendorId'] as const);
  const [text, setText] = useSearchFilter(f.q, (q) => set({ q }));
  const status = f.status === 'open' ? OPEN_WO : f.status ? (f.status.split(',') as WoStatus[]) : undefined;
  const list = useWorkOrders({ q: f.q, status, priority: f.priority, propertyId: f.propertyId, vendorId: f.vendorId, limit: 30 });
  const vendors = useVendors({ limit: 100, active: 'all' });
  const rows = flat(list.data);
  const filtered = Boolean(f.q || f.status || f.priority || f.propertyId || f.vendorId);
  const now = Date.now();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Work orders</h1>
          <p className="sub">Jobs dispatched to vendors. Create one from a request.</p>
        </div>
      </div>
      <search className="toolbar">
        <Search value={text} onChange={setText} placeholder="Search ref, description, address" />
        <select className="select" aria-label="Status" value={f.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="">All statuses</option>
          <option value="open">All open</option>
          <option value="scheduled,in_progress">Scheduled or in progress</option>
          {WO_STATUSES.map((s) => (
            <option key={s} value={s}>
              {WO_STATUS_LABEL[s]}
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
        <select className="select" aria-label="Vendor" value={f.vendorId} onChange={(e) => set({ vendorId: e.target.value })}>
          <option value="">All vendors</option>
          {flat(vendors.data).map((v) => (
            <option key={v.id} value={v.id}>
              {v.companyName}
            </option>
          ))}
        </select>
        {filtered && (
          <button type="button" className="btn ghost sm" onClick={() => { setText(''); set({ q: '', status: '', priority: '', propertyId: '', vendorId: '' }); }}>
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
          <Empty icon={Wrench} title={filtered ? 'No work orders match' : 'No work orders yet'}>
            {filtered ? 'Try another status or clear the filters.' : 'Open a request and convert it into a work order to dispatch a vendor.'}
          </Empty>
        ) : (
          <ul className="rows" style={{ opacity: list.isPlaceholderData ? 0.6 : 1, transition: 'opacity 150ms' }}>
            {rows.map((w) => {
              const open = OPEN_WO.includes(w.status);
              const late = open && w.status !== 'completed' && w.expectedCompletionAt !== null && new Date(w.expectedCompletionAt).getTime() < now;
              return (
                <li key={w.id}>
                  <Link to={`/work-orders/${w.id}`} className="row resp" style={{ gridTemplateColumns: '128px minmax(0,1fr) 150px 110px 160px 84px' }}>
                    <RefTag refNo={w.ref} />
                    <div className="min0">
                      <div className="row-title">{w.description}</div>
                      <div className="row-sub">
                        {w.address}
                        {w.unitLabel !== 'Main' && ` #${w.unitLabel}`} · {w.vendorName ?? 'No vendor yet'}
                      </div>
                    </div>
                    <span className="hide-sm">{open ? <PartyChip party={w.waitingOn} /> : <span className="muted small">—</span>}</span>
                    <span className="hide-sm">
                      <Prio p={w.priority} />
                    </span>
                    <span className="hide-sm">
                      <WoStamp s={w.status} />
                    </span>
                    <div style={{ textAlign: 'right' }}>
                      <div className={late ? 'num late' : 'num'}>{open ? duration(hoursSince(w.statusChangedAt, now)) : date(w.statusChangedAt)}</div>
                      {late && <div className="small" style={{ color: 'var(--serial)' }}>overdue</div>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <LoadMore hasNext={list.hasNextPage} loading={list.isFetchingNextPage} onMore={() => list.fetchNextPage()} />
      </Box>
    </>
  );
}
