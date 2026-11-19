import { Building2, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { OwnerSelect } from '../../components/pickers';
import { Box, Button, Empty, LoadError, LoadMore, RowsSkeleton, Search, Segmented } from '../../components/ui';
import { plural, PROPERTY_TYPE_LABEL, PROPERTY_TYPES } from '../../lib/format';
import { useFilters, useSearchFilter } from '../../lib/hooks';
import { flat, useProperties } from '../../lib/queries';
import { PropertyDialog } from './forms';

export default function PropertyList() {
  const nav = useNavigate();
  const [f, set] = useFilters(['q', 'type', 'ownerId', 'city', 'open', 'archived', 'new'] as const);
  const [text, setText] = useSearchFilter(f.q, (q) => set({ q }));
  const [cityText, setCity] = useSearchFilter(f.city, (city) => set({ city }));
  const list = useProperties({ q: f.q, type: f.type, ownerId: f.ownerId, city: f.city, hasOpenRequests: f.open || undefined, archived: f.archived === 'true' ? 'true' : 'false', limit: 30 });
  const rows = flat(list.data);
  const filtered = Boolean(f.q || f.type || f.ownerId || f.city || f.open);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Properties</h1>
          <p className="sub">Buildings and homes you manage, with their units.</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => set({ new: '1' })}>
          Add property
        </Button>
      </div>
      <search className="toolbar">
        <Search value={text} onChange={setText} placeholder="Search name or address" />
        <select className="select" aria-label="Type" value={f.type} onChange={(e) => set({ type: e.target.value })}>
          <option value="">All types</option>
          {PROPERTY_TYPES.map((t) => (
            <option key={t} value={t}>
              {PROPERTY_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <OwnerSelect value={f.ownerId} onChange={(ownerId) => set({ ownerId })} />
        <input className="input" style={{ width: 150 }} aria-label="City" placeholder="City" value={cityText} onChange={(e) => setCity(e.target.value)} />
        <select className="select" aria-label="Open requests" value={f.open} onChange={(e) => set({ open: e.target.value })}>
          <option value="">Any requests</option>
          <option value="true">Has open requests</option>
          <option value="false">No open requests</option>
        </select>
        <Segmented label="Archived" value={f.archived === 'true' ? 'true' : 'false'} onChange={(v) => set({ archived: v === 'true' ? 'true' : '' })} options={[{ value: 'false', label: 'Active' }, { value: 'true', label: 'Archived' }]} />
      </search>
      <Box flush lift>
        {list.isError ? (
          <LoadError error={list.error} retry={() => list.refetch()} />
        ) : list.isPending ? (
          <RowsSkeleton />
        ) : rows.length === 0 ? (
          <Empty icon={Building2} title={filtered || f.archived ? 'No properties match' : 'No properties yet'} action={!filtered && !f.archived && <Button variant="primary" icon={Plus} onClick={() => set({ new: '1' })}>Add your first property</Button>}>
            {filtered ? 'Try clearing a filter.' : f.archived ? 'Archived properties appear here.' : 'Add a property and its owner. Single homes get their unit automatically.'}
          </Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Property</th>
                <th className="hide-sm">Type</th>
                <th className="hide-sm">Owner</th>
                <th className="r">Units</th>
              </tr>
            </thead>
            <tbody style={{ opacity: list.isPlaceholderData ? 0.6 : 1 }}>
              {rows.map((p) => (
                <tr key={p.id} onClick={() => nav(`/properties/${p.id}`)} style={{ cursor: 'pointer' }}>
                  <td>
                    <Link to={`/properties/${p.id}`} className="strong" style={{ color: 'var(--ink)', textDecoration: 'none' }}>
                      {p.nameRef}
                    </Link>
                    <div className="row-sub">
                      {p.addressLine}, {p.city}, {p.state} {p.zip}
                    </div>
                  </td>
                  <td className="hide-sm">{PROPERTY_TYPE_LABEL[p.type]}</td>
                  <td className="hide-sm">{p.ownerName}</td>
                  <td className="r">{plural(p.unitCount, 'unit')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <LoadMore hasNext={list.hasNextPage} loading={list.isFetchingNextPage} onMore={() => list.fetchNextPage()} />
      </Box>
      {f.new && <PropertyDialog onClose={() => set({ new: '' })} onSaved={(p) => nav(`/properties/${p.id}`)} />}
    </>
  );
}
