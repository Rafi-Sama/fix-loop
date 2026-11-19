
import { AlertTriangle, Ban, CalendarClock, CalendarX, CheckCircle2, ClipboardCheck, DoorClosed, FileSignature, Hammer, Play, Send, ThumbsDown, ThumbsUp, Undo2, UserPlus, UserX } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Dialog, useToast } from '../../components/overlay';
import { Box, Button, ComplianceBadge, Fields, Notice, PartyChip } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { duration, hoursSince, money, PARTY_LABEL, phone, relative, WO_PATH, WO_STATUS_LABEL, type WoStatus } from '../../lib/format';
import { keys, useCommand } from '../../lib/queries';
import type { WoDetail } from '../../lib/types';
import { useWoCommand } from './actions';
import { WoForm, woBody, woFormFrom } from './WoForm';
import type { DlgKey } from './WorkOrderView';


/** The pipe: the main path with this job's position, coloured by who holds it now. */
export function Pipe({ w }: { w: WoDetail }) {
  const now = useRef<HTMLLIElement>(null);
  // On phones the pipe scrolls sideways; keep the current step in view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-centre whenever the status (and so the current step) changes.
  useEffect(() => {
    now.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [w.status]);
  if (w.status === 'cancelled')
    return (
      <Notice tone="bad" icon={Ban}>
        <b>Cancelled</b> {relative(w.statusChangedAt)}
        {w.cancelReason && `: ${w.cancelReason}`}
      </Notice>
    );
  const withQuote = w.quoteRequired || w.quotes.length > 0;
  const path = WO_PATH.filter((s) => withQuote || (s !== 'awaiting_quote' && s !== 'awaiting_approval'));
  // An on-site quote pauses a scheduled/in-progress job; show it at the approval step.
  const at = path.indexOf(w.status);
  const party = w.waitingOn === 'pm' ? 'you' : (w.waitingOn ?? '');
  const short: Partial<Record<WoStatus, string>> = { awaiting_acceptance: 'Accept', awaiting_quote: 'Quote', awaiting_approval: 'Approval', awaiting_scheduling: 'Book time', completed: 'Review' };
  return (
    <ol className="pipe" aria-label={`Status: ${WO_STATUS_LABEL[w.status]}`}>
      {path.map((s, i) => (
        <li key={s} className={`pipe-step ${i < at || w.status === 'closed' ? 'done' : ''} ${i === at && w.status !== 'closed' ? `now ${party}` : ''}`} aria-current={i === at ? 'step' : undefined} ref={i === at ? now : undefined}>
          {short[s] ?? WO_STATUS_LABEL[s]}
        </li>
      ))}
    </ol>
  );
}

export function YourMove({ w, show, late, appt, thresholdCents }: { w: WoDetail; show: (k: DlgKey) => void; late: boolean; appt: string | null; thresholdCents: number }) {
  const toast = useToast();
  const accept = useWoCommand(w, 'accept');
  const start = useWoCommand(w, 'start');
  const unassign = useWoCommand(w, 'unassign');
  const resend = useWoCommand(w, 'resend-link');
  const sendOwner = useWoCommand(w, 'send-to-owner');
  const run = (m: { mutateAsync: (b: unknown) => Promise<unknown> }, ok: string) => () => m.mutateAsync({}).then(() => toast(ok), (e) => toast(errorMessage(e), 'bad'));

  if (w.status === 'closed')
    return (
      <Notice tone="ok" icon={CheckCircle2}>
        <b>Closed</b> {relative(w.closedAt)}. Expense recorded and the tenant was asked to confirm the fix.
      </Notice>
    );
  if (w.status === 'cancelled') return null;

  const who = w.waitingOn;
  const since = duration(hoursSince(w.statusChangedAt));
  const emergency = w.priority === 'emergency';
  const pq = w.quotes.find((q) => q.status === 'pending');
  let headline = '';
  let body: ReactNode = null;
  const primary: ReactNode[] = [];
  const proxy: ReactNode[] = [];

  switch (w.status) {
    case 'draft':
      headline = 'Assign a vendor';
      body = 'The vendor gets a one-tap job link. The acceptance clock starts on assignment.';
      primary.push(<Button key="a" variant="primary" icon={UserPlus} onClick={() => show('assign')}>Assign vendor</Button>);
      break;
    case 'awaiting_acceptance':
      headline = `Waiting for ${w.vendor?.companyName ?? 'the vendor'} to accept`;
      body = 'They were sent a job link. Reminders go out automatically; if they call you instead, record it here.';
      primary.push(<Button key="r" icon={Send} onClick={run(resend, 'Job link re-sent')} loading={resend.isPending}>Resend link</Button>);
      primary.push(<Button key="u" icon={UserX} variant="ghost" onClick={run(unassign, 'Vendor unassigned')} loading={unassign.isPending}>Unassign</Button>);
      proxy.push(<Button key="ac" size="sm" icon={ThumbsUp} onClick={run(accept, 'Accepted on the vendor’s behalf')} loading={accept.isPending}>Accept</Button>);
      proxy.push(<Button key="de" size="sm" icon={ThumbsDown} onClick={() => show('decline')}>Decline</Button>);
      if (emergency) proxy.push(<Button key="st" size="sm" icon={Play} onClick={run(start, 'Emergency job started')} loading={start.isPending}>Start now</Button>);
      break;
    case 'awaiting_quote':
      headline = `Waiting for ${w.vendor?.companyName ?? 'the vendor'}’s quote`;
      body = 'The vendor submits it from their job link.';
      primary.push(<Button key="r" icon={Send} onClick={run(resend, 'Job link re-sent')} loading={resend.isPending}>Resend link</Button>);
      proxy.push(<Button key="q" size="sm" icon={FileSignature} onClick={() => show('quote')}>Enter quote</Button>);
      break;
    case 'awaiting_approval':
      if (w.approvalPendingWith === 'owner') {
        headline = `Waiting for ${w.owner.name} to approve ${pq ? money(pq.amountCents) : 'the quote'}`;
        body = w.owner.notifyMode === 'direct' ? 'They have a one-tap approval link by email. If they answer by phone, record it.' : 'This owner wants you to forward approvals. Record their answer once you have it.';
        primary.push(<Button key="d" variant="primary" icon={ClipboardCheck} onClick={() => show('decide')}>Record decision</Button>);
      } else {
        const over = pq ? pq.amountCents > thresholdCents : false;
        headline = `Decide on the ${pq ? money(pq.amountCents) : ''} quote`;
        body = over ? `Above ${w.owner.name}’s ${money(thresholdCents, true)} threshold: send it to the owner, or approve with their offline OK.` : `Within the ${money(thresholdCents, true)} threshold, so you can approve it.`;
        if (over) primary.push(<Button key="o" variant="primary" icon={Send} onClick={run(sendOwner, w.owner.notifyMode === 'direct' ? 'Sent to the owner for approval' : 'Marked as waiting on the owner')} loading={sendOwner.isPending}>Send to owner</Button>);
        primary.push(<Button key="d" variant={over ? undefined : 'primary'} icon={ClipboardCheck} onClick={() => show('decide')}>{over ? 'Decide anyway' : 'Approve or reject'}</Button>);
      }
      if (w.resumeStatus) body = <>{body} The vendor is on site; approval returns the job to {WO_STATUS_LABEL[w.resumeStatus].toLowerCase()}.</>;
      break;
    case 'awaiting_scheduling':
      headline = 'Waiting for the vendor to book a time';
      body = 'The vendor arranges a time with the tenant and enters it on their link.';
      primary.push(<Button key="r" icon={Send} onClick={run(resend, 'Job link re-sent')} loading={resend.isPending}>Resend link</Button>);
      proxy.push(<Button key="s" size="sm" icon={CalendarClock} onClick={() => show('schedule')}>Schedule</Button>);
      if (emergency) proxy.push(<Button key="st" size="sm" icon={Play} onClick={run(start, 'Emergency job started')} loading={start.isPending}>Start now</Button>);
      break;
    case 'scheduled':
      headline = `Booked: ${appt ?? 'appointment set'}`;
      body = 'Day-before reminders go to the tenant and vendor.';
      proxy.push(<Button key="st" size="sm" icon={Play} onClick={run(start, 'Marked as started')} loading={start.isPending}>Start job</Button>);
      proxy.push(<Button key="rs" size="sm" icon={CalendarClock} onClick={() => show('schedule')}>Reschedule</Button>);
      proxy.push(<Button key="na" size="sm" icon={CalendarX} onClick={() => show('noaccess')}>No access</Button>);
      proxy.push(<Button key="q" size="sm" icon={FileSignature} onClick={() => show('quote')}>Quote on site</Button>);
      break;
    case 'in_progress':
      headline = `${w.vendor?.companyName ?? 'The vendor'} is working on it`;
      body = 'They submit photos, notes and the invoice when done.';
      proxy.push(<Button key="c" size="sm" icon={Hammer} onClick={() => show('complete')}>Record completion</Button>);
      proxy.push(<Button key="q" size="sm" icon={FileSignature} onClick={() => show('quote')}>Quote extra work</Button>);
      break;
    case 'completed':
      headline = 'Review the work and close';
      body = 'Check the photos and invoice below. Closing records the expense and asks the tenant to confirm.';
      primary.push(<Button key="c" variant="primary" icon={DoorClosed} onClick={() => show('close')}>Approve & close</Button>);
      primary.push(<Button key="m" icon={Undo2} onClick={() => show('more')}>Request more work</Button>);
      break;
  }

  const tone = who === 'pm' ? 'you' : who ?? undefined;
  return (
    <section className={`box lift ${late ? 'risk' : ''}`} aria-label="Next step">
      <div className={`band ${late ? 'risk' : tone}`} style={{ clipPath: 'none' }}>
        {late && <AlertTriangle size={15} />}
        {who ? `Waiting on ${PARTY_LABEL[who].toLowerCase()}` : WO_STATUS_LABEL[w.status]}
        <span className="since">
          {late ? 'overdue · ' : ''}
          {since} in this step
        </span>
      </div>
      <div className="box-body stack-sm">
        <h2 style={{ fontSize: 19 }}>{headline}</h2>
        {body && <p className="muted">{body}</p>}
        {primary.length > 0 && <div className="btn-row" style={{ marginTop: 4 }}>{primary}</div>}
        {proxy.length > 0 && (
          <div className="hstack" style={{ borderTop: '1px dashed var(--hair)', paddingTop: 10, marginTop: 4 }}>
            <span className="small muted">Vendor called you? Do it for them:</span>
            {proxy}
          </div>
        )}
      </div>
    </section>
  );
}

export function VendorCard({ w, onAssign }: { w: WoDetail; onAssign: () => void }) {
  const v = w.vendor;
  return (
    <Box title="Vendor" tone="vendor" flush actions={v && <ComplianceBadge c={v.compliance} />}>
      {v ? (
        <Fields
          cols={1}
          items={[
            { label: 'Company', value: <Link to={`/vendors/${v.id}`}>{v.companyName}</Link> },
            { label: 'Contact', value: v.contactName },
            { label: 'Phone', value: v.phone && <a href={`tel:${v.phone}`}>{phone(v.phone)}</a> },
            { label: 'Email', value: v.email },
            { label: 'Assigned', value: w.assignedAt && relative(w.assignedAt) },
            { label: 'Accepted', value: w.acceptedAt && relative(w.acceptedAt) },
          ]}
        />
      ) : (
        <div className="box-body stack-sm">
          <PartyChip party={null} label="No vendor assigned" />
          {w.status === 'draft' && (
            <Button size="sm" icon={UserPlus} onClick={onAssign}>
              Assign vendor
            </Button>
          )}
        </div>
      )}
    </Box>
  );
}

export function EditDialog({ w, onClose, thresholdCents }: { w: WoDetail; onClose: () => void; thresholdCents: number }) {
  const toast = useToast();
  const [v, setV] = useState(() => woFormFrom(w));
  const save = useCommand((body: Record<string, unknown>) => api(`/work-orders/${w.id}`, { method: 'PATCH', body }), [keys.workOrder(w.id), ['work-orders']]);
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={`Edit ${w.ref}`}
      onSubmit={async () => {
        const body = woBody(v, 'patch');
        if (typeof body === 'string') throw new Error(body);
        await save.mutateAsync(body);
        toast('Work order updated');
        onClose();
      }}
    >
      <WoForm value={v} onChange={setV} thresholdCents={thresholdCents} />
    </Dialog>
  );
}
