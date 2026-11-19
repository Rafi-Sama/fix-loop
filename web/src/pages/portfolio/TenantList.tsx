import { Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { PropertySelect } from '../../components/pickers';
import { Box, Button, Empty, LoadError, LoadMore, RowsSkeleton, Search } from '../../components/ui';
import { OCCUPANCY, OCCUPANCY_LABEL, phone } from '../../lib/format';
import { useFilters, useSearchFilter } from '../../lib/hooks';
import { flat, useTenants } from '../../lib/queries';
import { TenantDialog } from './forms';

export default function TenantList() {
  const nav = useNavigate();
  const [f, set] = useFilters(['q', 'propertyId', 'status'] as const);
  const [text, setText] = useSearchFilter(f.q, (q) => set({ q }));
  const [adding, setAdding] = useState(false);
  const list = useTenants({ q: f.q, propertyId: f.propertyId, status: f.status, limit: 30 });
  const rows = flat(list.data);
  const filtered = Boolean(f.q || f.propertyId || f.status);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tenants</h1>
          <p className="sub">Residents report and track repairs through links. No accounts, no passwords.</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
          Add tenant
        </Button>
      </div>
      <search className="toolbar">
        <Search value={text} onChange={setText} placeholder="Search name, email, phone" />
        <PropertySelect value={f.propertyId} onChange={(propertyId) => set({ propertyId })} />
        <select className="select" aria-label="Occupancy" value={f.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="">Any occupancy</option>
          {OCCUPANCY.map((o) => (
            <option key={o} value={o}>
              {OCCUPANCY_LABEL[o]}
            </option>
          ))}
        </select>
      </search>
      <Box flush lift>
        {list.isError ? (
          <LoadError error={list.error} retry={() => list.refetch()} />
        ) : list.isPending ? (
          <RowsSkeleton />
        ) : rows.length === 0 ? (
          <Empty icon={Users} title={filtered ? 'No tenants match' : 'No tenants yet'}>
            {filtered ? 'Try clearing a filter.' : 'Tenants who aren’t on file can still report through a property’s request link; they show as unverified.'}
          </Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Home</th>
                <th className="hide-sm">Contact</th>
                <th className="r">Occupancy</th>
              </tr>
            </thead>
            <tbody style={{ opacity: list.isPlaceholderData ? 0.6 : 1 }}>
              {rows.map((t) => (
                <tr key={t.id} onClick={() => nav(`/tenants/${t.id}`)} style={{ cursor: 'pointer' }}>
                  <td>
                    <Link to={`/tenants/${t.id}`} className="strong" style={{ color: 'var(--ink)', textDecoration: 'none' }}>
                      {t.name}
                    </Link>
                  </td>
                  <td>
                    {t.propertyName}
                    {t.unitLabel !== 'Main' && <span className="muted"> · {t.unitLabel}</span>}
                  </td>
                  <td className="hide-sm small">
                    {t.email ?? ''}
                    {t.phone && <div className="muted">{phone(t.phone)}</div>}
                  </td>
                  <td className="r">
                    <span className={`pill ${t.occupancyStatus === 'current' ? 'ok' : t.occupancyStatus === 'notice_given' ? 'warn' : ''}`}>{OCCUPANCY_LABEL[t.occupancyStatus]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <LoadMore hasNext={list.hasNextPage} loading={list.isFetchingNextPage} onMore={() => list.fetchNextPage()} />
      </Box>
      {adding && <TenantDialog propertyId={f.propertyId || undefined} onClose={() => setAdding(false)} />}
    </>
  );
}
