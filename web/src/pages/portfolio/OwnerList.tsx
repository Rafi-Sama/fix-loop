import { Briefcase, Building2, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Box, Button, Empty, LoadError, LoadMore, RowsSkeleton, Search } from '../../components/ui';
import { money, phone } from '../../lib/format';
import { useFilters, useSearchFilter } from '../../lib/hooks';
import { flat, useOrg, useOwners } from '../../lib/queries';
import type { Owner } from '../../lib/types';
import { OwnerDialog } from './forms';

export default function OwnerList() {
  const [f, set] = useFilters(['q'] as const);
  const [text, setText] = useSearchFilter(f.q, (q) => set({ q }));
  const list = useOwners({ q: f.q, limit: 30 });
  const org = useOrg();
  const [editing, setEditing] = useState<Owner | 'new' | null>(null);
  const rows = flat(list.data);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Owners</h1>
          <p className="sub">Who approves quotes, and above what amount. Owners never need an account.</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
          Add owner
        </Button>
      </div>
      <search className="toolbar">
        <Search value={text} onChange={setText} placeholder="Search owners" />
      </search>
      <Box flush lift>
        {list.isError ? (
          <LoadError error={list.error} retry={() => list.refetch()} />
        ) : list.isPending ? (
          <RowsSkeleton />
        ) : rows.length === 0 ? (
          <Empty icon={Briefcase} title={f.q ? 'No owners match' : 'No owners yet'}>
            {f.q ? 'Try another name.' : 'Add owners here or while adding a property.'}
          </Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Owner</th>
                <th className="hide-sm">Contact</th>
                <th>Approval above</th>
                <th className="hide-sm">Approvals</th>
                <th className="r">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td className="strong">{o.name}</td>
                  <td className="hide-sm small">
                    {o.email ?? '—'}
                    {o.phone && <div className="muted">{phone(o.phone)}</div>}
                  </td>
                  <td>{o.approvalThresholdCents !== null ? money(o.approvalThresholdCents, true) : <span className="muted">Default {money(org.data?.defaultApprovalThresholdCents, true)}</span>}</td>
                  <td className="hide-sm">{o.notifyMode === 'direct' ? <span className="pill info">One-tap link</span> : <span className="pill">You forward</span>}</td>
                  <td className="r">
                    <span className="hstack" style={{ justifyContent: 'flex-end' }}>
                      <Link className="btn ghost sm" to={`/properties?ownerId=${o.id}`}>
                        <Building2 size={14} /> Properties
                      </Link>
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(o)}>
                        Edit
                      </Button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <LoadMore hasNext={list.hasNextPage} loading={list.isFetchingNextPage} onMore={() => list.fetchNextPage()} />
      </Box>
      {editing && <OwnerDialog owner={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
