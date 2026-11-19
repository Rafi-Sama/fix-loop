import { AlertTriangle, ArrowRight, Ban, ChevronRight, CircleHelp, Pencil, Phone, Star, Wrench, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useActorName } from '../../components/actors';
import { AddFiles, Gallery } from '../../components/files';
import { Dialog, useDialog, useToast } from '../../components/overlay';
import { Timeline } from '../../components/Timeline';
import { Box, Button, Fields, LoadError, Notice, Prio, RefTag, ReqStamp, SelectField, Skeleton, TextArea, TextField, WoStamp } from '../../components/ui';
import { api } from '../../lib/api';
import { dateTime, PERMISSION_LABEL, phone, PRIORITIES, PRIORITY_LABEL, relative, type Priority } from '../../lib/format';
import { keys, useCategories, useCommand, useOrg, useOwner, useRequest } from '../../lib/queries';
import type { RequestDetail, WoDetail } from '../../lib/types';
import { WoForm, woBody, woFormFrom, type WoFormValue } from '../work-orders/WoForm';

const CLOSE_REASONS = ['Duplicate request', 'Resolved by tenant', 'Not our responsibility', 'No work needed'];
const CANCEL_REASONS = ['Withdrawn by tenant', 'Entered by mistake'];

type DlgKey = 'convert' | 'info' | 'close' | 'cancel' | 'edit';

export default function RequestView() {
  const { id = '' } = useParams();
  const q = useRequest(id);
  const r = q.data;
  const cats = useCategories();
  const org = useOrg();
  const dlg = useDialog<DlgKey>();
  const toast = useToast();
  const roots = [keys.request(id), ['requests'], ['properties'], ['tenants']];
  const patch = useCommand((body: Record<string, unknown>) => api(`/requests/${id}`, { method: 'PATCH', body }), roots);
  const comment = useCommand((b: { body: string; visibility: string }) => api(`/requests/${id}/comments`, { method: 'POST', body: b }), [keys.request(id)]);
  const actorName = useActorName({ tenant: r?.tenant ? { id: r.tenant.id, name: r.tenant.name } : r?.submitterName ? { id: '', name: r.submitterName } : null });

  if (q.isError) return <LoadError error={q.error} retry={() => q.refetch()} />;
  if (!r) return <DetailSkeleton />;

  const ended = ['resolved', 'closed', 'cancelled'].includes(r.status);
  const category = cats.data?.find((c) => c.id === r.categoryId);
  const openWos = r.workOrders.filter((w) => w.status !== 'closed' && w.status !== 'cancelled');

  const setPriority = (p: Priority) =>
    patch.mutateAsync({ priority: p }).then(
      () => toast(`Priority set to ${PRIORITY_LABEL[p]}`),
      (e) => toast(e.message, 'bad'),
    );

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/requests">Requests</Link>
        <ChevronRight size={13} />
        <span>{r.ref}</span>
      </nav>
      <div className="page-head">
        <div className="stack-sm" style={{ gap: 6 }}>
          <div className="hstack">
            <RefTag refNo={r.ref} />
            <ReqStamp s={r.status} />
            <Prio p={r.priority} />
          </div>
          <h1>{r.title}</h1>
          <p className="sub">
            {r.property.addressLine}
            {r.unit.label !== 'Main' && ` · Unit ${r.unit.label}`} · reported {relative(r.createdAt)} {r.source === 'pm_entered' ? 'by your team' : 'through the request link'}
          </p>
        </div>
        {!ended && (
          <div className="actions">
            {(r.status === 'new' || r.status === 'needs_info') && (
              <Button icon={CircleHelp} onClick={() => dlg.show('info')} disabled={!r.tenant} title={r.tenant ? undefined : 'No verified tenant to ask'}>
                Ask tenant
              </Button>
            )}
            <Button icon={Pencil} onClick={() => dlg.show('edit')}>
              Edit
            </Button>
            {openWos.length === 0 && (
              <>
                <Button icon={XCircle} variant="ghost" onClick={() => dlg.show('close')}>
                  Close
                </Button>
                <Button icon={Ban} variant="ghost" onClick={() => dlg.show('cancel')}>
                  Cancel
                </Button>
              </>
            )}
            <Button variant="primary" icon={Wrench} onClick={() => dlg.show('convert')}>
              {r.workOrders.length ? 'New work order' : 'Convert to work order'}
            </Button>
          </div>
        )}
      </div>

      {r.isEmergency && (
        <div style={{ marginBottom: 18 }}>
          <Notice tone="bad" icon={AlertTriangle}>
            <b>Emergency.</b> {r.emergencyAckAt ? `The tenant acknowledged the 911 / gas-utility instructions ${relative(r.emergencyAckAt)}.` : 'Logged as an emergency.'} Emergencies are never downgraded automatically.
          </Notice>
        </div>
      )}
      {r.status === 'needs_info' && (
        <div style={{ marginBottom: 18 }}>
          <Notice tone="warn">
            <b>Waiting on the tenant</b> since {relative(r.statusChangedAt)}: “{r.infoRequest}”
          </Notice>
        </div>
      )}
      {r.closeReason && (
        <div style={{ marginBottom: 18 }}>
          <Notice>
            {r.status === 'cancelled' ? 'Cancelled' : 'Closed'}: {r.closeReason}
          </Notice>
        </div>
      )}

      <div className="grid-main">
        <div className="stack">
          <Box title="The issue" lift>
            <div className="stack">
              <p className="prewrap" style={{ fontSize: 15 }}>
                {r.description}
              </p>
              <Gallery files={r.attachments} empty="No photos were attached." />
              {!ended && <AddFiles subject={{ type: 'request', id }} kind="issue_photo" onDone={() => q.refetch()} />}
            </div>
          </Box>
          <Box title="Triage" flush>
            <Fields
              cols={3}
              items={[
                { label: 'Category', value: category?.name },
                { label: 'Tenant said', value: r.tenantUrgency ? PRIORITY_LABEL[r.tenantUrgency] : r.source === 'pm_entered' ? 'Logged by your team' : null },
                {
                  label: 'Confirmed priority',
                  value: ended ? (
                    PRIORITY_LABEL[r.priority]
                  ) : (
                    <select className="select" aria-label="Confirmed priority" value={r.priority} onChange={(e) => setPriority(e.target.value as Priority)} disabled={patch.isPending} style={{ minHeight: 32, padding: '3px 30px 3px 8px' }}>
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {PRIORITY_LABEL[p]}
                        </option>
                      ))}
                    </select>
                  ),
                },
              ]}
            />
          </Box>
          <Box title="Access" flush>
            <Fields
              items={[
                { label: 'Availability', value: r.availabilityText },
                { label: 'Permission to enter', value: r.permissionToEnter ? PERMISSION_LABEL[r.permissionToEnter] : null },
                { label: 'Access notes', value: r.accessNotes },
                { label: 'Pets', value: r.pets },
              ]}
            />
          </Box>
          <Box title="Work orders" meta={r.workOrders.length ? `${r.workOrders.length}` : undefined} flush>
            {r.workOrders.length === 0 ? (
              <div className="box-body muted small">No work order yet. Convert this request when you’re ready to dispatch a vendor.</div>
            ) : (
              <ul className="rows">
                {r.workOrders.map((w) => (
                  <li key={w.id}>
                    <Link to={`/work-orders/${w.id}`} className="row" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
                      <RefTag refNo={w.ref} />
                      <WoStamp s={w.status} />
                      <ArrowRight size={16} color="var(--ink-3)" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Box>
          <Box title="Timeline & notes">
            <Timeline events={r.timeline} comments={r.comments} actorName={actorName} onComment={(body, visibility) => comment.mutateAsync({ body, visibility })} />
          </Box>
        </div>

        <div className="stack">
          <Box title={r.tenant ? 'Tenant' : 'Submitter'} tone="tenant" flush>
            <Fields
              cols={1}
              items={[
                { label: 'Name', value: r.tenant ? <Link to={`/tenants/${r.tenant.id}`}>{r.tenant.name}</Link> : r.submitterName },
                { label: 'Phone', value: (r.tenant?.phone ?? r.submitterPhone) && <a href={`tel:${r.tenant?.phone ?? r.submitterPhone}`}>{phone(r.tenant?.phone ?? r.submitterPhone)}</a> },
                { label: 'Email', value: (r.tenant?.email ?? r.submitterEmail) && <a href={`mailto:${r.tenant?.email ?? r.submitterEmail}`}>{r.tenant?.email ?? r.submitterEmail}</a> },
              ]}
            />
            {!r.tenant && r.source === 'tenant_link' && (
              <div className="box-body">
                <Notice tone="warn">Unverified: the submitter’s email or phone didn’t match a current tenant. Check before dispatching.</Notice>
              </div>
            )}
          </Box>
          <Box title="Property" flush>
            <Fields
              cols={1}
              items={[
                { label: 'Address', value: <Link to={`/properties/${r.property.id}`}>{`${r.property.addressLine}${r.unit.label !== 'Main' ? ` #${r.unit.label}` : ''}, ${r.property.city}, ${r.property.state} ${r.property.zip}`}</Link> },
                { label: 'Emergency line', value: (r.property.emergencyPhone ?? org.data?.emergencyPhone) && <a href={`tel:${r.property.emergencyPhone ?? org.data?.emergencyPhone}`}><Phone size={12} style={{ display: 'inline' }} /> {phone(r.property.emergencyPhone ?? org.data?.emergencyPhone)}{!r.property.emergencyPhone && ' (firm)'}</a> },
                { label: 'Property notes', value: r.property.notes },
              ]}
            />
          </Box>
          {r.tenantConfirmed && (
            <Box title="Tenant confirmation">
              <div className="hstack">
                <span className={`pill ${r.tenantConfirmed === 'fixed' ? 'ok' : 'bad'}`}>{r.tenantConfirmed === 'fixed' ? 'Fixed' : 'Not fixed'}</span>
                {r.tenantRating && (
                  <span className="hstack" role="img" aria-label={`${r.tenantRating} out of 5`} style={{ gap: 1, color: '#e2a400' }}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star key={i} size={15} fill={i < r.tenantRating! ? 'currentColor' : 'none'} />
                    ))}
                  </span>
                )}
              </div>
            </Box>
          )}
          <p className="small muted">Last change {dateTime(r.statusChangedAt)}</p>
        </div>
      </div>

      {dlg.is('convert') && <ConvertDialog r={r} open onClose={dlg.close} />}
      <AskDialog id={id} open={dlg.is('info')} onClose={dlg.close} previous={r.infoRequest} />
      <EndDialog id={id} outcome="close" open={dlg.is('close')} onClose={dlg.close} />
      <EndDialog id={id} outcome="cancel" open={dlg.is('cancel')} onClose={dlg.close} />
      {dlg.is('edit') && <EditDialog r={r} open onClose={dlg.close} />}
    </>
  );
}

export function DetailSkeleton() {
  return (
    <div className="stack" role="status" aria-busy="true" aria-label="Loading">
      <Skeleton h={22} w={220} />
      <Skeleton h={34} w="50%" />
      <div className="grid-main">
        <div className="stack">
          <Skeleton h={180} />
          <Skeleton h={120} />
        </div>
        <Skeleton h={260} />
      </div>
    </div>
  );
}

function ConvertDialog({ r, open, onClose }: { r: RequestDetail; open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const org = useOrg();
  const owner = useOwner(r.property.ownerId);
  const [v, setV] = useState<WoFormValue>(() => woFormFrom({ description: r.title, priority: r.priority }));
  const create = useCommand((body: Record<string, unknown>) => api<WoDetail>(`/requests/${r.id}/work-orders`, { method: 'POST', body }), [['requests'], ['work-orders']]);
  const threshold = owner.data?.approvalThresholdCents ?? org.data?.defaultApprovalThresholdCents;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={`Work order for ${r.ref}`}
      submitLabel="Create work order"
      onSubmit={async () => {
        const body = woBody(v, 'create');
        if (typeof body === 'string') throw new Error(body);
        const wo = await create.mutateAsync(body);
        toast(`${wo.ref} created. Next: assign a vendor.`);
        nav(`/work-orders/${wo.id}`);
      }}
    >
      <WoForm value={v} onChange={setV} thresholdCents={threshold} />
    </Dialog>
  );
}

function AskDialog({ id, open, onClose, previous }: { id: string; open: boolean; onClose: () => void; previous: string | null }) {
  const [question, setQuestion] = useState('');
  const toast = useToast();
  const ask = useCommand((question: string) => api(`/requests/${id}/needs-info`, { method: 'POST', body: { question } }), [keys.request(id), ['requests']]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Ask the tenant"
      submitLabel="Send question"
      submitDisabled={question.trim().length < 3}
      onSubmit={async () => {
        await ask.mutateAsync(question.trim());
        toast('Question sent. The clock now waits on the tenant.');
        setQuestion('');
        onClose();
      }}
    >
      <p className="muted">The tenant gets a link to answer and add photos. The request shows “Waiting on tenant” until they reply.</p>
      {previous && <Notice>Last question: “{previous}”</Notice>}
      <TextArea label="Question" required minLength={3} maxLength={1000} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Could you send a photo of the leak and the shut-off valve under the sink?" autoFocus />
    </Dialog>
  );
}

function EndDialog({ id, outcome, open, onClose }: { id: string; outcome: 'close' | 'cancel'; open: boolean; onClose: () => void }) {
  const reasons = outcome === 'close' ? CLOSE_REASONS : CANCEL_REASONS;
  const [pick, setPick] = useState(reasons[0]!);
  const [other, setOther] = useState('');
  const toast = useToast();
  const end = useCommand((reason: string) => api(`/requests/${id}/${outcome}`, { method: 'POST', body: { reason } }), [keys.request(id), ['requests']]);
  const reason = pick === 'Other' ? other.trim() : other.trim() ? `${pick}: ${other.trim()}` : pick;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={outcome === 'close' ? 'Close request' : 'Cancel request'}
      submitLabel={outcome === 'close' ? 'Close request' : 'Cancel request'}
      danger
      submitDisabled={!reason}
      onSubmit={async () => {
        await end.mutateAsync(reason.slice(0, 200));
        toast(outcome === 'close' ? 'Request closed' : 'Request cancelled');
        onClose();
      }}
    >
      <p className="muted">{outcome === 'close' ? 'Closing means no work is needed.' : 'Cancelling means the request was withdrawn.'} A reason is required and goes on the timeline.</p>
      <SelectField label="Reason" value={pick} onChange={(e) => setPick(e.target.value)}>
        {[...reasons, 'Other'].map((x) => (
          <option key={x}>{x}</option>
        ))}
      </SelectField>
      <TextField label={pick === 'Other' ? 'Describe the reason' : 'Details'} optional={pick !== 'Other'} required={pick === 'Other'} value={other} onChange={(e) => setOther(e.target.value)} maxLength={150} />
    </Dialog>
  );
}

function EditDialog({ r, open, onClose }: { r: RequestDetail; open: boolean; onClose: () => void }) {
  const cats = useCategories();
  const toast = useToast();
  const [v, setV] = useState({ title: r.title, description: r.description, categoryId: r.categoryId, availabilityText: r.availabilityText ?? '', accessNotes: r.accessNotes ?? '' });
  const save = useCommand((body: Record<string, unknown>) => api(`/requests/${r.id}`, { method: 'PATCH', body }), [keys.request(r.id), ['requests']]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title="Edit request"
      onSubmit={async () => {
        // Send only what changed so the timeline records a precise edit.
        const changed = Object.fromEntries(Object.entries(v).filter(([k, x]) => x !== ((r as unknown as Record<string, unknown>)[k] ?? '')));
        if (Object.keys(changed).length === 0) return onClose();
        await save.mutateAsync(changed);
        toast('Request updated');
        onClose();
      }}
    >
      <div className="form-grid">
        <TextField className="full" label="Title" required maxLength={200} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
        <TextArea className="full" label="Description" required maxLength={5000} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
        <SelectField label="Category" value={v.categoryId} onChange={(e) => setV({ ...v, categoryId: e.target.value })}>
          {cats.data?.map((c) => (
            <option key={c.id} value={c.id} disabled={!c.active && c.id !== r.categoryId}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <TextField label="Availability" optional value={v.availabilityText} onChange={(e) => setV({ ...v, availabilityText: e.target.value })} maxLength={1000} />
        <TextArea className="full" label="Access notes" optional value={v.accessNotes} onChange={(e) => setV({ ...v, accessNotes: e.target.value })} maxLength={1000} />
      </div>
    </Dialog>
  );
}
