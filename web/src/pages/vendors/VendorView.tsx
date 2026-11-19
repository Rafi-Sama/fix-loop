import { ChevronRight, ExternalLink, FilePlus2, Pencil, Power, Send, ShieldCheck, Trash2, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Uploader } from '../../components/files';
import { Dialog, useDialog, useToast } from '../../components/overlay';
import { Box, Button, ComplianceBadge, Empty, Fields, LoadError, Notice, RefTag, Segmented, SelectField, TextField, WoStamp } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { date, DOC_TYPE_LABEL, duration, label, money, phone, relative } from '../../lib/format';
import { keys, useCategories, useCommand, useVendor } from '../../lib/queries';
import { ACCEPT_DOCS, type Presigned } from '../../lib/upload';
import type { VendorDetail, VendorDocument } from '../../lib/types';
import { DetailSkeleton } from '../requests/RequestView';
import { VendorDialog } from './VendorForm';

const daysUntil = (iso: string) => Math.ceil((new Date(`${iso}T23:59:59`).getTime() - Date.now()) / 864e5);

export default function VendorView() {
  const { id = '' } = useParams();
  const q = useVendor(id);
  const v = q.data;
  const cats = useCategories();
  const dlg = useDialog<'edit' | 'doc'>();
  const [jobs, setJobs] = useState<'pending' | 'completed' | 'all'>('pending');
  const toast = useToast();
  const roots = [keys.vendor(id), ['vendors']];
  const invite = useCommand(() => api(`/vendors/${id}/invite`, { method: 'POST' }), roots);
  const toggle = useCommand((active: boolean) => api(`/vendors/${id}`, { method: 'PATCH', body: { active } }), roots);
  const removeDoc = useCommand((docId: string) => api(`/vendors/${id}/documents/${docId}`, { method: 'DELETE' }), roots);
  const editDoc = useCommand((d: { id: string; expiresOn: string | null }) => api(`/vendors/${id}/documents/${d.id}`, { method: 'PATCH', body: { expiresOn: d.expiresOn } }), roots);

  if (q.isError) return <LoadError error={q.error} retry={() => q.refetch()} />;
  if (!v) return <DetailSkeleton />;

  const doneJobs = v.assignedWorkOrders.filter((j) => j.status === 'completed' || j.status === 'closed');
  const openJobs = v.assignedWorkOrders.filter((j) => j.status !== 'completed' && j.status !== 'closed' && j.status !== 'cancelled');
  const list = jobs === 'pending' ? openJobs : jobs === 'completed' ? doneJobs : v.assignedWorkOrders;
  const refOf = new Map(v.assignedWorkOrders.map((w) => [w.id, w.ref]));
  const services = v.categoryIds.map((c) => cats.data?.find((x) => x.id === c)?.name).filter(Boolean);

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/vendors">Vendors</Link>
        <ChevronRight size={13} />
        <span>{v.companyName}</span>
      </nav>
      <div className="page-head">
        <div>
          <div className="hstack" style={{ marginBottom: 6 }}>
            {v.active ? <ComplianceBadge c={v.compliance} /> : <span className="pill">Inactive</span>}
          </div>
          <h1>{v.companyName}</h1>
          <p className="sub">{services.join(' · ') || 'No services listed'}</p>
        </div>
        <div className="actions">
          <Button icon={Pencil} onClick={() => dlg.show('edit')}>
            Edit
          </Button>
          <Button
            icon={Power}
            variant="ghost"
            loading={toggle.isPending}
            onClick={() => toggle.mutateAsync(!v.active).then(() => toast(v.active ? 'Vendor deactivated. Their links stop working.' : 'Vendor reactivated'), (e) => toast(errorMessage(e), 'bad'))}
          >
            {v.active ? 'Deactivate' : 'Reactivate'}
          </Button>
          {v.active && (
            <Button
              variant="primary"
              icon={Send}
              loading={invite.isPending}
              disabled={!v.email && !v.phone}
              title={!v.email && !v.phone ? 'Add an email or phone first' : undefined}
              onClick={() => invite.mutateAsync(undefined).then(() => toast('Invite sent. The link works for 14 days.'), (e) => toast(errorMessage(e), 'bad'))}
            >
              Invite to update details
            </Button>
          )}
        </div>
      </div>

      <div className="tiles" style={{ marginBottom: 20 }}>
        <div className="tile">
          <span className="f-label">Open jobs</span>
          <b>{openJobs.length}</b>
        </div>
        <div className="tile">
          <span className="f-label">Completed</span>
          <b>{doneJobs.length}</b>
        </div>
        <div className="tile">
          <span className="f-label">Median time to accept</span>
          <b>{duration(v.responseTimes?.medianAcceptHours)}</b>
        </div>
        <div className="tile">
          <span className="f-label">Median assign → done</span>
          <b>{duration(v.responseTimes?.medianCompleteHours)}</b>
        </div>
      </div>

      <div className="grid-main">
        <div className="stack">
          <Box title="Compliance documents" lift actions={<Button size="sm" icon={FilePlus2} onClick={() => dlg.show('doc')}>Add document</Button>}>
            {v.compliance === 'missing' && (
              <div style={{ marginBottom: 12 }}>
                <Notice tone="bad">No insurance certificate on file. Assigning this vendor needs a typed override.</Notice>
              </div>
            )}
            {v.documents.length === 0 ? (
              <Empty icon={ShieldCheck} title="No documents yet">Upload a COI, licence or W-9, or invite the vendor to upload their own.</Empty>
            ) : (
              <ul className="rows">
                {v.documents.map((d) => (
                  <DocRow key={d.id} d={d} onDelete={() => removeDoc.mutateAsync(d.id).then(() => toast('Document removed'), (e) => toast(errorMessage(e), 'bad'))} onExpiry={(expiresOn) => editDoc.mutateAsync({ id: d.id, expiresOn }).then(() => toast('Expiry updated. Reminders rescheduled.'), (e) => toast(errorMessage(e), 'bad'))} />
                ))}
              </ul>
            )}
          </Box>

          <Box title="Jobs" flush actions={<Segmented label="Jobs" value={jobs} onChange={setJobs} options={[{ value: 'pending', label: `Open ${openJobs.length}` }, { value: 'completed', label: `Done ${doneJobs.length}` }, { value: 'all', label: 'All' }]} />}>
            {list.length === 0 ? (
              <Empty icon={Wrench} title="No jobs here" />
            ) : (
              <ul className="rows">
                {list.map((w) => (
                  <li key={w.id}>
                    <Link to={`/work-orders/${w.id}`} className="row resp" style={{ gridTemplateColumns: '128px minmax(0,1fr) auto auto' }}>
                      <RefTag refNo={w.ref} />
                      <span className="row-title">{w.description}</span>
                      <WoStamp s={w.status} />
                      <span className="small muted hide-sm">{relative(w.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Box>

          {v.quoteHistory.length > 0 && (
            <Box title="Quote history" flush>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Work order</th>
                    <th>Version</th>
                    <th className="r">Amount</th>
                    <th>Status</th>
                    <th className="r">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {v.quoteHistory.map((x) => (
                    <tr key={x.id}>
                      <td>
                        <Link to={`/work-orders/${x.workOrderId}`} className="mono">
                          {refOf.get(x.workOrderId) ?? 'Work order'}
                        </Link>
                      </td>
                      <td className="mono">v{x.version}</td>
                      <td className="r strong">{money(x.amountCents)}</td>
                      <td>
                        <span className={`pill ${x.status === 'approved' ? 'ok' : x.status === 'declined' ? 'bad' : ''}`}>{label(x.status)}</span>
                      </td>
                      <td className="r small muted">{date(x.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          )}
        </div>

        <aside className="stack">
          <Box title="Contact" tone="vendor" flush>
            <Fields
              cols={1}
              items={[
                { label: 'Contact', value: v.contactName },
                { label: 'Phone', value: v.phone && <a href={`tel:${v.phone}`}>{phone(v.phone)}</a> },
                { label: 'Email', value: v.email && <a href={`mailto:${v.email}`}>{v.email}</a> },
                { label: 'Address', value: v.address },
                { label: 'Text messages', value: v.smsConsentAt ? `Consented ${date(v.smsConsentAt)}` : 'No consent on file' },
              ]}
            />
          </Box>
          <Box title="Coverage & availability" flush>
            <Fields
              cols={1}
              items={[
                { label: 'Cities', value: v.coverageCities.map((c) => c.replace(/\b\w/g, (x) => x.toUpperCase())).join(', ') },
                { label: 'ZIP codes', value: v.coverageZips.join(', ') },
                { label: 'Availability', value: v.availabilityText },
              ]}
            />
          </Box>
          <Box title="Internal notes" flush>
            <Fields cols={1} items={[{ label: 'Only your team sees these', value: v.notes }, { label: 'PMS ID', value: v.externalId }]} />
          </Box>
        </aside>
      </div>

      {dlg.is('edit') && <VendorDialog vendor={v} onClose={dlg.close} />}
      {dlg.is('doc') && <DocDialog v={v} onClose={dlg.close} />}
    </>
  );
}

async function openDoc(vendorId: string, docId: string) {
  // Open the tab synchronously so pop-up blockers allow it, then point it at the signed URL.
  const tab = window.open('', '_blank');
  try {
    const { url } = await api<{ url: string }>(`/vendors/${vendorId}/documents/${docId}/url`);
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch (e) {
    tab?.close();
    throw e;
  }
}

function DocRow({ d, onDelete, onExpiry }: { d: VendorDocument; onDelete: () => void; onExpiry: (v: string | null) => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(d.expiresOn ?? '');
  const left = d.expiresOn ? daysUntil(d.expiresOn) : null;
  const tone = left === null ? '' : left < 0 ? 'bad' : left <= 30 ? 'warn' : 'ok';
  return (
    <li className="row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}>
      <div className="min0">
        <div className="row-title">{DOC_TYPE_LABEL[d.type]}{d.label && <span className="muted" style={{ fontWeight: 400 }}> · {d.label}</span>}</div>
        {editing ? (
          <form className="hstack" style={{ marginTop: 6 }} onSubmit={(e) => { e.preventDefault(); onExpiry(value || null); setEditing(false); }}>
            <input className="input" type="date" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Expiry date" style={{ width: 170, minHeight: 32 }} />
            <button className="btn sm primary" type="submit">Save</button>
            <button className="btn sm ghost" type="button" onClick={() => setEditing(false)}>Cancel</button>
          </form>
        ) : (
          <button type="button" className="btn ghost sm" style={{ padding: 0, height: 'auto', color: 'var(--ink-3)' }} onClick={() => setEditing(true)}>
            {d.expiresOn ? `Expires ${date(d.expiresOn)}` : 'No expiry'} · change
          </button>
        )}
      </div>
      <span className="hstack" style={{ gap: 6 }}>
        <button type="button" className="btn ghost sm" onClick={() => openDoc(d.vendorId, d.id).catch((e) => toast(errorMessage(e), 'bad'))}>
          <ExternalLink size={13} /> View
        </button>
      {left !== null ? <span className={`pill ${tone}`}>{left < 0 ? `Expired ${-left}d ago` : left === 0 ? 'Expires today' : `${left}d left`}</span> : null}
      </span>
      <button type="button" className="icon-btn dark" aria-label={`Remove ${DOC_TYPE_LABEL[d.type]}`} title="Remove" onClick={() => confirm('Remove this document? Its reminders stop too.') && onDelete()}>
        <Trash2 size={15} />
      </button>
    </li>
  );
}

function DocDialog({ v, onClose }: { v: VendorDetail; onClose: () => void }) {
  const toast = useToast();
  const [type, setType] = useState<VendorDocument['type']>('insurance');
  const [labelText, setLabel] = useState('');
  const [expires, setExpires] = useState('');
  const [file, setFile] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const subject = { type: 'vendor', id: v.id } as const;
  const add = useCommand((body: unknown) => api(`/vendors/${v.id}/documents`, { method: 'POST', body }), [keys.vendor(v.id), ['vendors']]);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Add a compliance document"
      submitLabel="Save document"
      submitDisabled={!file || busy}
      onSubmit={async () => {
        await add.mutateAsync({ type, label: labelText.trim() || null, attachmentId: file, expiresOn: expires || null });
        toast(expires ? 'Saved. Reminders set for 30 and 7 days before expiry.' : 'Document saved');
        onClose();
      }}
    >
      <div className="form-grid">
        <SelectField label="Type" value={type} onChange={(e) => setType(e.target.value as VendorDocument['type'])}>
          {Object.entries(DOC_TYPE_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </SelectField>
        <TextField label="Expires on" type="date" optional={type !== 'insurance'} value={expires} onChange={(e) => setExpires(e.target.value)} hint={type === 'w9' ? 'W-9s usually don’t expire.' : undefined} />
        <TextField className="full" label="Label" optional value={labelText} onChange={(e) => setLabel(e.target.value)} maxLength={200} placeholder="General liability, $1M" />
      </div>
      <Uploader
        accept={ACCEPT_DOCS}
        multiple={false}
        label="Upload the file"
        start={(meta) => api<Presigned>('/files/uploads', { method: 'POST', body: { ...meta, subject, kind: 'document' } })}
        complete={(id) => api(`/files/uploads/${id}/complete`, { method: 'POST', body: { subject } })}
        onChange={(ids, b) => { setFile(ids[0]); setBusy(b); }}
      />
    </Dialog>
  );
}
