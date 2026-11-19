import { HardHat, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Box, Button, ComplianceBadge, Empty, LoadError, LoadMore, RowsSkeleton, Search, Segmented } from '../../components/ui';
import { phone } from '../../lib/format';
import { useFilters, useSearchFilter } from '../../lib/hooks';
import { flat, useCategories, useVendors } from '../../lib/queries';
import { VendorDialog } from './VendorForm';

export default function VendorList() {
  const nav = useNavigate();
  const cats = useCategories();
  const [f, set] = useFilters(['q', 'categoryId', 'loc', 'active', 'new'] as const);
  const [text, setText] = useSearchFilter(f.q, (q) => set({ q }));
  const [loc, setLoc] = useSearchFilter(f.loc, (v) => set({ loc: v }));
  // One location box: five digits filters by ZIP, anything else by city.
  const isZip = /^\d{5}$/.test(f.loc);
  const list = useVendors({ q: f.q, categoryId: f.categoryId, zip: isZip ? f.loc : undefined, city: !isZip && f.loc ? f.loc.toLowerCase() : undefined, active: f.active || 'true', limit: 30 });
  const rows = flat(list.data);
  const catName = (id: string) => cats.data?.find((c) => c.id === id)?.name;
  const filtered = Boolean(f.q || f.categoryId || f.loc);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Vendors</h1>
          <p className="sub">Contractors run every job from a link. Their insurance is checked when you assign them.</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => set({ new: '1' })}>
          Add vendor
        </Button>
      </div>
      <search className="toolbar">
        <Search value={text} onChange={setText} placeholder="Search company or contact" />
        <select className="select" aria-label="Service" value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
          <option value="">All services</option>
          {cats.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input className="input" style={{ width: 170 }} aria-label="Coverage ZIP or city" placeholder="ZIP or city covered" value={loc} onChange={(e) => setLoc(e.target.value)} />
        <Segmented label="Status" value={f.active || 'true'} onChange={(v) => set({ active: v === 'true' ? '' : v })} options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }, { value: 'all', label: 'All' }]} />
      </search>
      <Box flush lift>
        {list.isError ? (
          <LoadError error={list.error} retry={() => list.refetch()} />
        ) : list.isPending ? (
          <RowsSkeleton />
        ) : rows.length === 0 ? (
          <Empty icon={HardHat} title={filtered ? 'No vendors match' : 'No vendors yet'} action={!filtered && <Button variant="primary" icon={Plus} onClick={() => set({ new: '1' })}>Add a vendor</Button>}>
            {filtered ? 'Try another service or location.' : 'Add the contractors you dispatch to. They never need an account.'}
          </Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Vendor</th>
                <th className="hide-sm">Services</th>
                <th className="hide-sm">Covers</th>
                <th className="r">Insurance</th>
              </tr>
            </thead>
            <tbody style={{ opacity: list.isPlaceholderData ? 0.6 : 1 }}>
              {rows.map((v) => (
                <tr key={v.id} onClick={() => nav(`/vendors/${v.id}`)} style={{ cursor: 'pointer', opacity: v.active ? 1 : 0.55 }}>
                  <td>
                    <Link to={`/vendors/${v.id}`} className="strong" style={{ color: 'var(--ink)', textDecoration: 'none' }}>
                      {v.companyName}
                    </Link>
                    <div className="row-sub">{[v.contactName, v.phone && phone(v.phone)].filter(Boolean).join(' · ') || 'No contact details'}</div>
                  </td>
                  <td className="hide-sm small">{v.categoryIds.map(catName).filter(Boolean).join(', ') || '—'}</td>
                  <td className="hide-sm small" style={{ textTransform: 'capitalize' }}>
                    {[...v.coverageCities, ...v.coverageZips].slice(0, 4).join(', ') || '—'}
                  </td>
                  <td className="r">
                    {v.active ? <ComplianceBadge c={v.compliance} /> : <span className="pill">Inactive</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <LoadMore hasNext={list.hasNextPage} loading={list.isFetchingNextPage} onMore={() => list.fetchNextPage()} />
      </Box>
      {f.new && <VendorDialog onClose={() => set({ new: '' })} onSaved={(v) => nav(`/vendors/${v.id}`)} />}
    </>
  );
}
