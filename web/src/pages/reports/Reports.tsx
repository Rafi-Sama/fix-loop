import { ArrowDown, ArrowUp, BarChart3, Building2, Download, FileSpreadsheet, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router';
import { Donut, Ranked, SERIES, Trend } from '../../components/charts';
import { Gallery } from '../../components/files';
import { Dialog, useToast } from '../../components/overlay';
import { OwnerSelect, PropertySelect } from '../../components/pickers';
import { Box, Check, Empty, LoadError, Skeleton } from '../../components/ui';
import { api, apiUrl, type Query } from '../../lib/api';
import { BILL_TO_LABEL, date, duration, fillMonths, isoDay, money, monthSpan } from '../../lib/format';
import { useFilters } from '../../lib/hooks';
import { useReport, useUser } from '../../lib/queries';

const TABS = [
  { id: 'summary', label: 'Maintenance summary' },
  { id: 'vendors', label: 'Vendor performance' },
  { id: 'financial', label: 'Financial' },
  { id: 'property', label: 'Property report' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const daysAgo = (n: number) => isoDay(new Date(Date.now() - n * 864e5));

export default function Reports() {
  const { tab = 'summary' } = useParams();
  const me = useUser();
  const [f, set] = useFilters(['from', 'to', 'propertyId', 'ownerId'] as const);
  const from = f.from || daysAgo(90);
  const to = f.to || isoDay(new Date());
  const q: Query = { from, to, propertyId: f.propertyId, ownerId: f.ownerId };
  const current = (TABS.find((t) => t.id === tab)?.id ?? 'summary') as Tab;
  const [exporting, setExporting] = useState(false);
  const csvPath = current === 'property' ? (f.propertyId ? `/reports/properties/${f.propertyId}` : null) : `/reports/${current}`;

  return (
    <>
      <div className="print-only" style={{ marginBottom: 16 }}>
        <h1>
          {me.org.name} · {TABS.find((t) => t.id === current)!.label}
        </h1>
        <p>
          {date(from)} – {date(to)}
        </p>
      </div>
      <div className="page-head no-print">
        <div>
          <h1>Reports</h1>
          <p className="sub">Every number here filters by date, property and owner, exports to CSV, and prints to PDF.</p>
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={() => setExporting(true)}>
            <FileSpreadsheet size={15} /> Expenses for my PMS
          </button>
          {csvPath && (
            <a className="btn" href={apiUrl(csvPath, { ...q, format: 'csv' })} download>
              <Download size={15} /> CSV
            </a>
          )}
          <button type="button" className="btn primary" onClick={() => window.print()}>
            <Printer size={15} /> Print / PDF
          </button>
        </div>
      </div>
      <nav className="tabs" aria-label="Reports">
        {TABS.map((t) => (
          <NavLink key={t.id} to={`/reports/${t.id}${location.search}`} className={() => (t.id === current ? 'active' : '')}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <div className="toolbar">
        <label className="hstack small">
          From <input className="input" type="date" value={from} max={to} onChange={(e) => set({ from: e.target.value })} style={{ width: 160 }} />
        </label>
        <label className="hstack small">
          To <input className="input" type="date" value={to} min={from} onChange={(e) => set({ to: e.target.value })} style={{ width: 160 }} />
        </label>
        <fieldset className="seg" aria-label="Quick range">
          {[30, 90, 365].map((n) => (
            <button key={n} type="button" aria-pressed={!f.to && from === daysAgo(n)} onClick={() => set({ from: daysAgo(n), to: '' })}>
              {n === 365 ? '12 months' : `${n} days`}
            </button>
          ))}
        </fieldset>
        <PropertySelect value={f.propertyId} onChange={(propertyId) => set({ propertyId })} all={current === 'property' ? 'Choose a property' : 'All properties'} />
        <OwnerSelect value={f.ownerId} onChange={(ownerId) => set({ ownerId })} />
      </div>
      {current === 'summary' && <Summary q={q} />}
      {current === 'vendors' && <VendorPerf q={q} />}
      {current === 'financial' && <Financial q={q} />}
      {current === 'property' && <PropertyReport q={q} />}
      {exporting && <ExpenseExport q={q} onClose={() => setExporting(false)} />}
    </>
  );
}

const Loading = () => (
  <div className="grid-2">
    <Skeleton h={220} />
    <Skeleton h={220} />
  </div>
);

function Summary({ q }: { q: Query }) {
  const r = useReport<Record<string, number | null>>('summary', '/reports/summary', q);
  if (r.isError) return <LoadError error={r.error} retry={() => r.refetch()} />;
  if (!r.data) return <Loading />;
  const d = r.data;
  const total = d.totalRequests ?? 0;
  const other = Math.max(0, total - (d.completedRequests ?? 0) - (d.pendingRequests ?? 0));
  return (
    <div className="stack">
      <div className="tiles">
        {[
          ['Total requests', String(total)],
          ['Completed', String(d.completedRequests ?? 0)],
          ['Pending', String(d.pendingRequests ?? 0)],
          ['Overdue', String(d.overdueRequests ?? 0)],
          ['Avg request → close', duration(d.avgCompletionHours)],
          ['Median request → close', duration(d.medianCompletionHours)],
          ['Median approval time', duration(d.medianApprovalHours)],
        ].map(([l, v]) => (
          <div key={l} className="tile">
            <span className="f-label">{l}</span>
            <b className={l === 'Overdue' && v !== '0' ? 'bad' : undefined}>{v}</b>
          </div>
        ))}
      </div>
      <Box title="Where requests ended up">
        {total === 0 ? (
          <Empty icon={BarChart3} title="No requests in this period" />
        ) : (
          <Donut
            total={String(total)}
            caption="requests"
            data={[
              { name: 'Completed', value: d.completedRequests ?? 0, color: SERIES[5]! },
              { name: 'Pending', value: d.pendingRequests ?? 0, color: SERIES[0]! },
              { name: 'Closed / cancelled', value: other, color: '#b9b3a3' },
            ]}
          />
        )}
      </Box>
      <p className="small muted">The 5-day target for normal repairs sits under the ~6.8 days after which tenant satisfaction drops.</p>
    </div>
  );
}

interface VendorRow {
  vendorId: string;
  vendor: string;
  jobsAssigned: number;
  jobsCompleted: number;
  avgResponseHours: number | null;
  avgCompletionHours: number | null;
  overdueJobs: number;
}

function VendorPerf({ q }: { q: Query }) {
  const r = useReport<{ items: VendorRow[] }>('vendors', '/reports/vendors', q);
  const [sort, setSort] = useState<{ k: keyof VendorRow; desc: boolean }>({ k: 'jobsAssigned', desc: true });
  const rows = useMemo(() => {
    const xs = [...(r.data?.items ?? [])];
    return xs.sort((a, b) => {
      const x = a[sort.k] ?? -1;
      const y = b[sort.k] ?? -1;
      return (x < y ? -1 : x > y ? 1 : 0) * (sort.desc ? -1 : 1);
    });
  }, [r.data, sort]);
  if (r.isError) return <LoadError error={r.error} retry={() => r.refetch()} />;
  if (!r.data) return <Loading />;
  if (!rows.length) return <Box><Empty icon={BarChart3} title="No vendor activity in this period" /></Box>;
  const head = (k: keyof VendorRow, l: string, right = true) => (
    <th className={right ? 'r' : undefined} aria-sort={sort.k === k ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <button type="button" onClick={() => setSort({ k, desc: sort.k === k ? !sort.desc : true })}>
        {l}
        {sort.k === k && (sort.desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
      </button>
    </th>
  );
  return (
    <div className="stack">
      <div className="grid-2">
        <Box title="Jobs completed">
          <Ranked data={rows.map((v) => ({ label: v.vendor, value: v.jobsCompleted }))} format={String} />
        </Box>
        <Box title="Average time to accept">
          <Ranked data={rows.filter((v) => v.avgResponseHours !== null).map((v) => ({ label: v.vendor, value: v.avgResponseHours! }))} format={duration} color={SERIES[1]} />
        </Box>
      </div>
      <Box flush>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                {head('vendor', 'Vendor', false)}
                {head('jobsAssigned', 'Assigned')}
                {head('jobsCompleted', 'Completed')}
                {head('avgResponseHours', 'Avg response')}
                {head('avgCompletionHours', 'Avg completion')}
                {head('overdueJobs', 'Overdue')}
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.vendorId}>
                  <td>
                    <Link to={`/vendors/${v.vendorId}`}>{v.vendor}</Link>
                  </td>
                  <td className="r">{v.jobsAssigned}</td>
                  <td className="r">{v.jobsCompleted}</td>
                  <td className="r">{duration(v.avgResponseHours)}</td>
                  <td className="r">{duration(v.avgCompletionHours)}</td>
                  <td className="r" style={{ color: v.overdueJobs ? 'var(--serial)' : undefined, fontWeight: v.overdueJobs ? 700 : undefined }}>
                    {v.overdueJobs}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Box>
    </div>
  );
}

interface Fin {
  totalCents: number;
  byProperty: { propertyId: string; property: string; totalCents: number }[];
  byCategory: { category: string; totalCents: number }[];
  byVendor: { vendor: string | null; totalCents: number }[];
  monthly: { month: string; totalCents: number }[];
}

function Financial({ q }: { q: Query }) {
  const r = useReport<Fin>('financial', '/reports/financial', q);
  if (r.isError) return <LoadError error={r.error} retry={() => r.refetch()} />;
  if (!r.data) return <Loading />;
  const d = r.data;
  if (!d.totalCents) return <Box><Empty icon={BarChart3} title="No expenses in this period">Expenses are recorded when you close a work order.</Empty></Box>;
  // Six validated hues; the tail folds into "Other" instead of generating new colours.
  const cats = d.byCategory.slice(0, 5).map((c, i) => ({ name: c.category, value: c.totalCents, color: SERIES[i]! }));
  const rest = d.byCategory.slice(5).reduce((s, c) => s + c.totalCents, 0);
  if (rest) cats.push({ name: 'Other', value: rest, color: SERIES[5]! });
  return (
    <div className="stack">
      <div className="tiles">
        <div className="tile">
          <span className="f-label">Total spend</span>
          <b>{money(d.totalCents, true)}</b>
        </div>
        <div className="tile">
          <span className="f-label">Properties</span>
          <b>{d.byProperty.length}</b>
        </div>
        <div className="tile">
          <span className="f-label">Avg per month</span>
          <b>{money(d.totalCents / monthSpan(q.from as string, q.to as string), true)}</b>
        </div>
      </div>
      <Box title="Monthly spending trend">
        <Trend data={fillMonths(d.monthly, monthSpan(q.from as string, q.to as string), new Date(`${q.to as string}T12:00:00`))} format={(n) => money(n, true)} />
      </Box>
      <div className="grid-2">
        <Box title="By category">
          <Donut total={money(d.totalCents, true)} caption="total" data={cats} format={(n) => money(n, true)} />
        </Box>
        <Box title="By vendor">
          <Ranked data={d.byVendor.map((v) => ({ label: v.vendor ?? 'No vendor', value: v.totalCents }))} format={(n) => money(n, true)} color={SERIES[4]} />
        </Box>
      </div>
      <Box title="By property" flush>
        <table className="tbl">
          <thead>
            <tr>
              <th>Property</th>
              <th className="r">Spend</th>
              <th className="r hide-sm">Share</th>
            </tr>
          </thead>
          <tbody>
            {d.byProperty.map((p) => (
              <tr key={p.propertyId}>
                <td>
                  <Link to={`/reports/property?propertyId=${p.propertyId}`}>{p.property}</Link>
                </td>
                <td className="r strong">{money(p.totalCents)}</td>
                <td className="r hide-sm" style={{ width: 200 }}>
                  <div className="meter">
                    <i style={{ width: `${(p.totalCents / d.totalCents) * 100}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </div>
  );
}

interface PropReport {
  property: { id: string; nameRef: string; address: string };
  totalCents: number;
  jobs: { workOrderId: string; ref: string; unit: string; issue: string; repair: string; completionNotes: string | null; vendor: string | null; vendorPhone: string | null; completedAt: string | null; costCents: number | null; billTo: string | null; files: { id: string; kind: 'completion_photo' | 'invoice'; mime: string; url: string }[] }[];
}

function PropertyReport({ q }: { q: Query }) {
  const id = q.propertyId as string | undefined;
  const r = useReport<PropReport>(`property-${id}`, `/reports/properties/${id}`, { from: q.from, to: q.to }, Boolean(id));
  if (!id) return <Box><Empty icon={Building2} title="Choose a property">This is the owner-facing record: every closed job with costs, photos and invoices.</Empty></Box>;
  if (r.isError) return <LoadError error={r.error} retry={() => r.refetch()} />;
  if (!r.data) return <Loading />;
  const d = r.data;
  return (
    <div className="stack">
      <Box title={d.property.nameRef} meta={d.property.address} lift>
        <div className="spread">
          <span>{d.jobs.length} completed jobs</span>
          <b style={{ fontSize: 20 }}>{money(d.totalCents)}</b>
        </div>
      </Box>
      {d.jobs.length === 0 ? (
        <Box><Empty icon={BarChart3} title="No completed jobs in this period" /></Box>
      ) : (
        d.jobs.map((j) => (
          <Box key={j.workOrderId} title={j.ref} meta={`${j.unit === 'Main' ? '' : `Unit ${j.unit} · `}${date(j.completedAt)}`} actions={<b>{money(j.costCents)}</b>}>
            <div className="stack-sm">
              <div className="strong">{j.issue}</div>
              <div>{j.repair}</div>
              {j.completionNotes && <div className="muted prewrap">{j.completionNotes}</div>}
              <div className="small muted">
                {j.vendor ?? 'No vendor'}
                {j.billTo && ` · billed to ${BILL_TO_LABEL[j.billTo]?.toLowerCase() ?? j.billTo}`}
              </div>
              <Gallery files={j.files} empty="No photos or invoice." />
            </div>
          </Box>
        ))
      )}
    </div>
  );
}

function ExpenseExport({ q, onClose }: { q: Query; onClose: () => void }) {
  const toast = useToast();
  const [unexported, setUnexported] = useState(true);
  const [mark, setMark] = useState(true);
  const query = { ...q, unexportedOnly: String(unexported) };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Expenses for bill entry"
      submitLabel="Download CSV"
      onSubmit={async () => {
        // Marking is a write (POST); a plain download stays a read-only GET.
        const csv = mark ? await api<string>('/reports/expenses/export', { method: 'POST', query }) : await api<string>('/reports/expenses.csv', { query });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = `expenses-${isoDay(new Date())}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast(mark ? 'Downloaded and marked as exported' : 'Downloaded');
        onClose();
      }}
    >
      <p className="muted">A CSV of closed work orders formatted for importing bills into your PMS, with your PMS property and vendor IDs.</p>
      <Check label="Only expenses I haven’t exported yet" checked={unexported} onChange={(e) => setUnexported(e.target.checked)} />
      <Check label="Mark these as exported" hint="So next month’s export only has new bills." checked={mark} onChange={(e) => setMark(e.target.checked)} />
    </Dialog>
  );
}
