import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Ban, ChevronRight, Pencil, Phone, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useActorName } from '../../components/actors';
import { AddFiles, Gallery } from '../../components/files';
import { useDialog } from '../../components/overlay';
import { Timeline } from '../../components/Timeline';
import { Box, Button, Fields, LoadError, Prio, RefTag } from '../../components/ui';
import { useDashboardDays } from '../../lib/prefs';
import { api } from '../../lib/api';
import { BILL_TO_LABEL, CHANNEL_LABEL, dateTime, label, money, NO_ACCESS_LABEL, PERMISSION_LABEL, phone, relative, window as apptWindow } from '../../lib/format';
import { useStepKeys } from '../../lib/hooks';
import { keys, useCommand, useOrg, useWorkOrder } from '../../lib/queries';
import type { Dashboard } from '../../lib/types';
import { DetailSkeleton } from '../requests/RequestView';
import { AssignDialog, CloseDialog, CompleteDialog, DecideDialog, NoAccessDialog, QuoteDialog, ReasonDialog, ScheduleDialog } from './actions';
import { EditDialog, Pipe, VendorCard, YourMove } from './parts';

export type DlgKey = 'assign' | 'decline' | 'cancel' | 'more' | 'quote' | 'decide' | 'schedule' | 'noaccess' | 'complete' | 'close' | 'edit';

export default function WorkOrderView() {
  const { id = '' } = useParams();
  const q = useWorkOrder(id);
  const w = q.data;
  const org = useOrg();
  const dlg = useDialog<DlgKey>();
  const [prev, next] = useQueueNeighbours(id);
  const actorName = useActorName({
    vendor: w?.vendor ? { id: w.vendor.id, name: w.vendor.companyName } : null,
    tenant: w?.tenant ? { id: w.tenant.id, name: w.tenant.name } : null,
    owner: w ? { id: w.owner.id, name: w.owner.name } : null,
  });
  const comment = useCommand((b: { body: string; visibility: string }) => api(`/work-orders/${id}/comments`, { method: 'POST', body: b }), [keys.workOrder(id)]);

  if (q.isError) return <LoadError error={q.error} retry={() => q.refetch()} />;
  if (!w) return <DetailSkeleton />;

  const threshold = w.owner.approvalThresholdCents ?? org.data?.defaultApprovalThresholdCents ?? 0;
  const open = w.status !== 'closed' && w.status !== 'cancelled';
  const late = open && w.status !== 'completed' && w.expectedCompletionAt !== null && new Date(w.expectedCompletionAt) < new Date();
  const appt = w.appointments.find((a) => a.status === 'scheduled' || a.status === 'tenant_conflict');
  const invoice = w.invoices.find((i) => i.status !== 'rejected');
  const photos = w.attachments.filter((a) => a.kind === 'issue_photo');
  const workFiles = w.attachments.filter((a) => a.kind !== 'issue_photo');

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/work-orders">Work orders</Link>
        <ChevronRight size={13} />
        <span>{w.ref}</span>
        <span style={{ marginLeft: 'auto' }} className="hstack no-print">
          <button type="button" className="btn ghost sm" disabled={!prev} onClick={prev ?? undefined} title="Previous in your queue (K)">
            <ArrowLeft size={14} /> Prev
          </button>
          <button type="button" className="btn ghost sm" disabled={!next} onClick={next ?? undefined} title="Next in your queue (J)">
            Next <ArrowRight size={14} />
          </button>
        </span>
      </nav>
      <div className="page-head">
        <div className="stack-sm" style={{ gap: 6 }}>
          <div className="hstack">
            <RefTag refNo={w.ref} />
            <Prio p={w.priority} />
            <span className="small muted">
              from <Link to={`/requests/${w.requestId}`}>{w.request.ref}</Link>
            </span>
          </div>
          <h1>{w.description}</h1>
          <p className="sub">
            {w.property.addressLine}
            {w.unit.label !== 'Main' && ` · Unit ${w.unit.label}`}, {w.property.city} · created {relative(w.createdAt)}
          </p>
        </div>
        {open && (
          <div className="actions">
            <Button icon={Pencil} onClick={() => dlg.show('edit')}>
              Edit
            </Button>
            <Button icon={Ban} variant="ghost" onClick={() => dlg.show('cancel')}>
              Cancel job
            </Button>
          </div>
        )}
      </div>

      <Pipe w={w} />

      <div className="grid-main" style={{ marginTop: 20 }}>
        <div className="stack">
          <YourMove w={w} show={dlg.show} late={late} appt={appt ? apptWindow(appt.startsAt, appt.endsAt, org.data?.timezone) : null} thresholdCents={threshold} />

          {w.status === 'completed' && (
            <Box title="Completion report" tone="you" lift>
              <div className="stack">
                <Fields
                  cols={3}
                  items={[
                    { label: 'Invoice', value: invoice ? money(invoice.amountCents) : null },
                    { label: 'Invoice #', value: invoice?.invoiceNumber },
                    { label: 'Authorised', value: money(w.approvedAmountCents ?? w.estimatedCostCents) },
                    { label: 'Vendor’s notes', value: w.completionNotes, wide: true },
                  ]}
                />
                <Gallery files={workFiles} />
              </div>
            </Box>
          )}

          <Box title="The issue">
            <div className="stack">
              <p className="prewrap">{w.request.description}</p>
              {w.requiredWork && (
                <div>
                  <span className="f-label">Scope of work (vendor sees this)</span>
                  <p className="prewrap" style={{ color: 'var(--ballpoint)' }}>
                    {w.requiredWork}
                  </p>
                </div>
              )}
              <Gallery files={photos} empty="No issue photos." />
            </div>
          </Box>

          {w.quotes.length > 0 && (
            <Box title="Quotes" meta={`${w.quotes.length} version${w.quotes.length > 1 ? 's' : ''}`} flush>
              <div className="table-wrap"><table className="tbl">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Amount</th>
                    <th>Details</th>
                    <th>Status</th>
                    <th className="r">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {w.quotes.map((x) => (
                    <tr key={x.id}>
                      <td className="mono">v{x.version}</td>
                      <td className="strong">{money(x.amountCents)}</td>
                      <td className="small" style={{ maxWidth: 320 }}>
                        {x.description ?? '—'}
                      </td>
                      <td>
                        <span className={`pill ${x.status === 'approved' ? 'ok' : x.status === 'declined' ? 'bad' : x.status === 'pending' ? 'info' : ''}`}>{label(x.status)}</span>
                      </td>
                      <td className="r small muted">{relative(x.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </Box>
          )}

          {w.approvals.length > 0 && (
            <Box title="Approval history" flush>
              <ul className="rows">
                {w.approvals.map((a) => (
                  <li key={a.id} className="row" style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto' }}>
                    {a.decision === 'approved' ? <ThumbsUp size={16} color="var(--ok)" /> : a.decision === 'declined' ? <ThumbsDown size={16} color="var(--serial)" /> : <Phone size={16} color="var(--amber)" />}
                    <div className="min0">
                      <div className="strong">
                        {label(a.decision)} {money(a.amountCents)} by {a.approverType === 'auto' ? 'auto-approval' : a.approverType === 'owner' ? w.owner.name : 'your team'}
                      </div>
                      <div className="row-sub">
                        {CHANNEL_LABEL[a.channel] ?? a.channel}
                        {a.note && ` · “${a.note}”`}
                      </div>
                    </div>
                    <span className="small muted">{dateTime(a.decidedAt)}</span>
                  </li>
                ))}
              </ul>
            </Box>
          )}

          {w.status !== 'completed' && workFiles.length > 0 && (
            <Box title="Job files">
              <Gallery files={workFiles} />
            </Box>
          )}

          <Box title="Timeline & communications">
            <Timeline events={w.timeline} comments={w.comments} communications={w.communications} actorName={actorName} onComment={(body, visibility) => comment.mutateAsync({ body, visibility })} />
          </Box>
        </div>

        <aside className="stack">
          <VendorCard w={w} onAssign={() => dlg.show('assign')} />
          <Box title="Tenant & access" tone="tenant" flush>
            <Fields
              cols={1}
              items={[
                { label: 'Tenant', value: w.tenant ? <Link to={`/tenants/${w.tenant.id}`}>{w.tenant.name}</Link> : (w.request.submitterName ?? 'None') },
                { label: 'Phone', value: (w.tenant?.phone ?? w.request.submitterPhone) && <a href={`tel:${w.tenant?.phone ?? w.request.submitterPhone}`}>{phone(w.tenant?.phone ?? w.request.submitterPhone)}</a> },
                { label: 'Availability', value: w.request.availabilityText },
                { label: 'Permission to enter', value: w.request.permissionToEnter && PERMISSION_LABEL[w.request.permissionToEnter] },
                { label: 'Access notes', value: w.request.accessNotes },
                { label: 'Pets', value: w.request.pets },
              ]}
            />
          </Box>
          <Box title="Money" flush>
            <Fields
              items={[
                { label: 'Estimate', value: money(w.estimatedCostCents) },
                { label: 'Approved', value: money(w.approvedAmountCents) },
                { label: 'Invoice', value: invoice ? money(invoice.amountCents) : null },
                { label: 'Bill to', value: BILL_TO_LABEL[w.billTo] },
                { label: 'Owner approval above', value: money(threshold, true), wide: true },
              ]}
            />
          </Box>
          <Box title="Schedule" flush>
            <Fields
              cols={1}
              items={[
                { label: 'Appointment', value: appt ? apptWindow(appt.startsAt, appt.endsAt, org.data?.timezone) : null },
                appt?.status === 'tenant_conflict' && { label: 'Tenant', value: <span style={{ color: 'var(--serial)' }}>Can’t make this time{appt.note ? `: “${appt.note}”` : ''}</span> },
                { label: 'Expected completion', value: w.expectedCompletionAt && <span style={{ color: late ? 'var(--serial)' : undefined }}>{dateTime(w.expectedCompletionAt)}{late && ' · overdue'}</span> },
                w.appointments.some((a) => a.status === 'no_access') && { label: 'Missed visits', value: w.appointments.filter((a) => a.status === 'no_access').map((a) => `${NO_ACCESS_LABEL[a.noAccessReason ?? ''] ?? 'No access'} (${dateTime(a.startsAt)})`).join('\n') },
              ]}
            />
          </Box>
          <Box title="Property & owner" tone="owner" flush>
            <Fields
              cols={1}
              items={[
                { label: 'Property', value: <Link to={`/properties/${w.property.id}`}>{w.property.nameRef}</Link> },
                { label: 'Owner', value: w.owner.name },
                { label: 'Owner contact', value: [w.owner.email, phone(w.owner.phone ?? undefined) === '—' ? null : phone(w.owner.phone)].filter(Boolean).join(' · ') },
                { label: 'Approvals', value: w.owner.notifyMode === 'direct' ? 'One-tap email link' : 'You forward to the owner' },
              ]}
            />
          </Box>
          {open && (
            <Box title="Add files">
              <AddFiles subject={{ type: 'work_order', id }} kind="document" label="Upload a document" onDone={() => q.refetch()} />
            </Box>
          )}
        </aside>
      </div>

      {dlg.is('assign') && <AssignDialog w={w} onClose={dlg.close} />}
      {dlg.is('decline') && <ReasonDialog w={w} onClose={dlg.close} path="decline" title="Vendor declined" submitLabel="Record decline" lead="The job goes back to draft so you can reassign it." success="Decline recorded. Reassign when ready." />}
      {dlg.is('cancel') && <ReasonDialog w={w} onClose={dlg.close} path="cancel" title={`Cancel ${w.ref}`} submitLabel="Cancel work order" lead="The vendor is told the job is off and their link stops working." success="Work order cancelled" danger />}
      {dlg.is('more') && <ReasonDialog w={w} onClose={dlg.close} path="more-work" title="Send back for more work" submitLabel="Send to vendor" lead="The invoice is set aside and the job returns to in progress. The vendor gets your note with their link." success="Sent back to the vendor" minLength={3} />}
      {dlg.is('quote') && <QuoteDialog w={w} onClose={dlg.close} />}
      {dlg.is('decide') && <DecideDialog w={w} onClose={dlg.close} thresholdCents={threshold} />}
      {dlg.is('schedule') && <ScheduleDialog w={w} onClose={dlg.close} />}
      {dlg.is('noaccess') && <NoAccessDialog w={w} onClose={dlg.close} />}
      {dlg.is('complete') && <CompleteDialog w={w} onClose={dlg.close} />}
      {dlg.is('close') && <CloseDialog w={w} onClose={dlg.close} thresholdCents={threshold} overagePct={org.data?.invoiceOveragePct ?? 10} />}
      {dlg.is('edit') && <EditDialog w={w} onClose={dlg.close} thresholdCents={threshold} />}
    </>
  );
}

/** Prev/next job in the dashboard queue order (from cache; no extra request). J/K step through it. */
function useQueueNeighbours(id: string): [(() => void) | null, (() => void) | null] {
  const qc = useQueryClient();
  const nav = useNavigate();
  const d = qc.getQueryData<Dashboard>(keys.dashboard(useDashboardDays()));
  const ids = d ? [...d.queue.atRisk, ...d.queue.you, ...d.queue.vendor, ...d.queue.owner].map((x) => x.id) : [];
  const i = ids.indexOf(id);
  const prevId = i > 0 ? ids[i - 1] : null;
  const nextId = i >= 0 && i < ids.length - 1 ? ids[i + 1] : !ids.length || i >= 0 ? null : ids[0];
  const prev = useCallback(() => prevId && nav(`/work-orders/${prevId}`), [prevId, nav]);
  const next = useCallback(() => nextId && nav(`/work-orders/${nextId}`), [nextId, nav]);
  useStepKeys(prevId ? prev : null, nextId ? next : null);
  return [prevId ? prev : null, nextId ? next : null];
}