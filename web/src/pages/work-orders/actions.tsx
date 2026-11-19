/** Every work-order command dialog. Each one maps to exactly one API call; the server's state machine has the final say. */
import { AlertTriangle, Check as CheckIcon, MapPin, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Uploader } from '../../components/files';
import { Dialog, useToast } from '../../components/overlay';
import { Check, ComplianceBadge, Empty, MoneyField, Notice, Search, SelectField, TextArea, TextField } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { isoDay, money, zonedTime, NO_ACCESS_LABEL, parseMoney } from '../../lib/format';
import { ACCEPT_DOCS, ACCEPT_IMAGES, type Presigned } from '../../lib/upload';
import { flat, keys, useCategories, useCommand, useOrg, useVendors } from '../../lib/queries';
import type { WoDetail } from '../../lib/types';

interface P {
  w: WoDetail;
  onClose: () => void;
}

/** POST /work-orders/:id/<path>, then refresh this job, lists, the request and the dashboard. */
export function useWoCommand(w: WoDetail, path: string) {
  return useCommand((body: unknown) => api(`/work-orders/${w.id}/${path}`, { method: 'POST', body }), [keys.workOrder(w.id), ['work-orders'], keys.request(w.requestId), ['requests'], ['vendors']]);
}

function useWoUpload(w: WoDetail, kind: 'completion_photo' | 'quote' | 'invoice') {
  const subject = { type: 'work_order', id: w.id } as const;
  return {
    start: (meta: { mime: string; sizeBytes: number }) => api<Presigned>('/files/uploads', { method: 'POST', body: { ...meta, subject, kind } }),
    complete: (id: string) => api(`/files/uploads/${id}/complete`, { method: 'POST', body: { subject } }),
  };
}

const ProxyNote = ({ w }: { w: WoDetail }) =>
  w.vendor ? <Notice>You’re acting on behalf of {w.vendor.companyName}. The timeline records it as “by you on behalf of the vendor”.</Notice> : null;

// ---------------------------------------------------------------- assign

export function AssignDialog({ w, onClose }: P) {
  const toast = useToast();
  const cats = useCategories();
  const [q, setQ] = useState('');
  const [matchOnly, setMatchOnly] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);
  const [override, setOverride] = useState('');
  const [needOverride, setNeedOverride] = useState(false);
  const assign = useWoCommand(w, 'assign');
  const vendors = useVendors({ limit: 100, ...(matchOnly ? { categoryId: w.request.categoryId } : {}), ...(q ? { q } : {}) });
  const zip = w.property.zip.slice(0, 5);
  const city = w.property.city.toLowerCase();
  const rows = useMemo(() => {
    // Coverage first, then compliant vendors: the best dispatch sits on top.
    const rank = { ok: 0, expiring: 1, missing: 2, expired: 3 } as const;
    return flat(vendors.data)
      .map((v) => ({ v, covers: v.coverageZips.includes(zip) || v.coverageCities.includes(city) }))
      .sort((a, b) => Number(b.covers) - Number(a.covers) || rank[a.v.compliance ?? 'missing'] - rank[b.v.compliance ?? 'missing']);
  }, [vendors.data, zip, city]);
  const chosen = rows.find((r) => r.v.id === picked)?.v;
  const risky = chosen && (chosen.compliance === 'expired' || chosen.compliance === 'missing');
  // Mirrors the outbox: SMS only once the firm is registered and the vendor consented.
  const smsOn = useOrg().data?.smsRegistrationStatus === 'approved';
  const channels = chosen ? [chosen.email && 'email', smsOn && chosen.phone && chosen.smsConsentAt && 'text'].filter(Boolean).join(' and ') : '';
  const category = cats.data?.find((c) => c.id === w.request.categoryId)?.name;

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={`Assign a vendor to ${w.ref}`}
      submitLabel={risky ? 'Override and assign' : 'Assign and send job link'}
      danger={Boolean(risky)}
      submitDisabled={!chosen || (Boolean(risky) && !override.trim())}
      onSubmit={async () => {
        try {
          await assign.mutateAsync({ vendorId: picked, overrideReason: override.trim() || null });
        } catch (e) {
          if (e instanceof ApiError && e.detailCode === 'compliance_override_required') setNeedOverride(true);
          throw e;
        }
        toast(channels ? `${chosen!.companyName} assigned. Job link sent by ${channels}.` : `${chosen!.companyName} assigned. No job link sent: no email on file.`);
        onClose();
      }}
    >
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <Search value={q} onChange={setQ} placeholder="Search vendors" />
        <Check label={`Only ${category ?? 'this category'}`} checked={matchOnly} onChange={(e) => setMatchOnly(e.target.checked)} />
      </div>
      <fieldset className="box" style={{ maxHeight: 340, overflowY: 'auto', margin: 0, padding: 0 }} aria-label="Vendors">
        {vendors.isPending ? (
          <p className="box-body muted">Loading vendors…</p>
        ) : rows.length === 0 ? (
          <Empty icon={MapPin} title="No vendors match">
            {matchOnly ? 'Untick the category filter to see everyone.' : 'Add vendors in the Vendors tab first.'}
          </Empty>
        ) : (
          rows.map(({ v, covers }) => (
            <label key={v.id} className="row" style={{ gridTemplateColumns: '22px minmax(0,1fr) auto', background: picked === v.id ? 'var(--ballpoint-tint)' : undefined }}>
              <input
                type="radio"
                name="vendor"
                className="sr-only"
                checked={picked === v.id}
                onChange={() => {
                  setPicked(v.id);
                  setNeedOverride(false);
                }}
              />
              <span className="avatar" style={{ width: 20, height: 20, background: picked === v.id ? 'var(--ballpoint)' : 'var(--sheet-2)', color: '#fff' }}>
                {picked === v.id && <CheckIcon size={12} />}
              </span>
              <div className="min0">
                <div className="row-title">{v.companyName}</div>
                <div className="row-sub">
                  {covers ? `Covers ${w.property.city}` : 'Outside listed coverage'} · {v.availabilityText ?? 'No availability noted'}
                  {!v.active && ' · deactivated'}
                </div>
              </div>
              <ComplianceBadge c={v.compliance} />
            </label>
          ))
        )}
      </fieldset>
      {(risky || needOverride) && (
        <div className="stack-sm">
          <Notice tone="bad" icon={ShieldAlert}>
            <b>{chosen?.companyName}’s insurance is {chosen?.compliance === 'missing' ? 'missing' : 'expired'}.</b> Dispatching an uninsured vendor puts the owner at risk. Type why you’re overriding; it’s logged on the timeline.
          </Notice>
          <TextField label="Override reason" required value={override} onChange={(e) => setOverride(e.target.value)} maxLength={500} placeholder="Renewal confirmed by phone, certificate coming today" />
        </div>
      )}
      {w.vendor === null && chosen && !risky && channels && <p className="small muted">{chosen.companyName} gets the job link by {channels}.</p>}
      {chosen && !channels && (
        <Notice tone="warn" icon={AlertTriangle}>
          {chosen.companyName} has no email on file{chosen.phone ? ' and texting isn’t available yet' : ''}, so we can’t send them the job link. Add an email to the vendor, or phone them and record their steps on this work order.
        </Notice>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------- reasons

export function ReasonDialog({ w, onClose, path, title, submitLabel, lead, success, minLength = 1, danger }: P & { path: 'decline' | 'cancel' | 'more-work'; title: string; submitLabel: string; lead: string; success: string; minLength?: number; danger?: boolean }) {
  const [text, setText] = useState('');
  const toast = useToast();
  const cmd = useWoCommand(w, path);
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      submitLabel={submitLabel}
      danger={danger}
      submitDisabled={text.trim().length < minLength}
      onSubmit={async () => {
        await cmd.mutateAsync(path === 'more-work' ? { note: text.trim() } : { reason: text.trim() });
        toast(success);
        onClose();
      }}
    >
      <p className="muted">{lead}</p>
      {path === 'decline' && <ProxyNote w={w} />}
      <TextArea label={path === 'more-work' ? 'What still needs doing' : 'Reason'} required value={text} onChange={(e) => setText(e.target.value)} maxLength={path === 'more-work' ? 2000 : 200} autoFocus />
    </Dialog>
  );
}

// ---------------------------------------------------------------- quote

export function QuoteDialog({ w, onClose }: P) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [file, setFile] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const cmd = useWoCommand(w, 'quotes');
  const up = useWoUpload(w, 'quote');
  const cents = parseMoney(amount);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Enter the vendor’s quote"
      submitLabel="Submit quote"
      submitDisabled={cents === null || busy}
      onSubmit={async () => {
        await cmd.mutateAsync({ amountCents: cents, description: desc.trim() || null, ...(file ? { attachmentId: file } : {}) });
        toast(`Quote ${money(cents)} recorded`);
        onClose();
      }}
    >
      <ProxyNote w={w} />
      {(w.status === 'scheduled' || w.status === 'in_progress') && <Notice tone="warn">The vendor is on site: the job pauses for approval, then returns to {w.status === 'scheduled' ? 'scheduled' : 'in progress'}.</Notice>}
      <MoneyField label="Amount" required value={amount} onChange={(e) => setAmount(e.target.value)} error={amount && cents === null ? 'Enter an amount like 640 or 640.00' : null} autoFocus />
      <TextArea label="What it covers" optional value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={5000} />
      <Uploader accept={ACCEPT_DOCS} multiple={false} label="Attach the quote (PDF or photo)" {...up} onChange={(ids, b) => { setFile(ids[0]); setBusy(b); }} />
    </Dialog>
  );
}

// ---------------------------------------------------------------- approval

export function DecideDialog({ w, onClose, thresholdCents }: P & { thresholdCents: number }) {
  const toast = useToast();
  const quote = w.quotes.find((q) => q.status === 'pending');
  const over = quote ? quote.amountCents > thresholdCents : false;
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [next, setNext] = useState<'awaiting_quote' | 'draft' | 'cancelled'>('awaiting_quote');
  const [offline, setOffline] = useState(false);
  const [note, setNote] = useState('');
  const cmd = useWoCommand(w, 'quote-decision');
  if (!quote) return null;
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Quote ${money(quote.amountCents)}`}
      submitLabel={decision === 'approve' ? 'Approve quote' : 'Reject quote'}
      danger={decision === 'reject'}
      submitDisabled={decision === 'approve' && over && !offline}
      onSubmit={async () => {
        await cmd.mutateAsync({ decision, ...(decision === 'reject' ? { next } : {}), ownerApprovedOffline: decision === 'approve' && offline, note: note.trim() || null });
        toast(decision === 'approve' ? 'Quote approved. The vendor can schedule.' : 'Quote rejected');
        onClose();
      }}
    >
      {quote.description && <p className="prewrap">{quote.description}</p>}
      <fieldset className="seg" aria-label="Decision">
        <button type="button" aria-pressed={decision === 'approve'} onClick={() => setDecision('approve')}>
          Approve
        </button>
        <button type="button" aria-pressed={decision === 'reject'} onClick={() => setDecision('reject')}>
          Reject
        </button>
      </fieldset>
      {decision === 'approve' ? (
        over ? (
          <div className="stack-sm">
            <Notice tone="warn" icon={AlertTriangle}>
              {money(quote.amountCents)} is above {w.owner.name}’s approval threshold of {money(thresholdCents)}. Send it to the owner, or record that they approved it by phone.
            </Notice>
            <Check label={`${w.owner.name} approved this by phone or in person`} checked={offline} onChange={(e) => setOffline(e.target.checked)} />
          </div>
        ) : (
          <p className="muted small">Within the {money(thresholdCents)} threshold, so your approval is enough.</p>
        )
      ) : (
        <SelectField label="What happens next" value={next} onChange={(e) => setNext(e.target.value as typeof next)}>
          <option value="awaiting_quote">Ask the same vendor for a revised quote</option>
          <option value="draft">Release the vendor and reassign</option>
          <option value="cancelled">Cancel the work order</option>
        </SelectField>
      )}
      <TextField label="Note" optional value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
    </Dialog>
  );
}

// ---------------------------------------------------------------- schedule

export function ScheduleDialog({ w, onClose }: P) {
  const toast = useToast();
  const tomorrow = new Date(Date.now() + 864e5);
  const [day, setDay] = useState(isoDay(tomorrow));
  const [from, setFrom] = useState('09:00');
  const [to, setTo] = useState('11:00');
  const [note, setNote] = useState('');
  const cmd = useWoCommand(w, 'appointments');
  const tz = useOrg().data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const startsAt = zonedTime(day, from, tz);
  const endsAt = zonedTime(day, to, tz);
  const bad = !(endsAt > startsAt) ? 'End must be after start' : endsAt.getTime() - startsAt.getTime() > 12 * 3600e3 ? 'A window can be at most 12 hours' : startsAt.getTime() < Date.now() - 3600e3 ? 'That time has passed' : null;
  return (
    <Dialog
      open
      onClose={onClose}
      title={w.status === 'scheduled' ? 'Reschedule the appointment' : 'Schedule the appointment'}
      submitLabel={w.status === 'scheduled' ? 'Reschedule' : 'Schedule'}
      submitDisabled={Boolean(bad)}
      onSubmit={async () => {
        await cmd.mutateAsync({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), note: note.trim() || null });
        toast('Appointment set. Tenant, vendor and your team are notified.');
        onClose();
      }}
    >
      <ProxyNote w={w} />
      {w.request.availabilityText && <Notice>Tenant’s availability: {w.request.availabilityText}</Notice>}
      <div className="form-grid" style={{ gridTemplateColumns: '1.4fr 1fr 1fr' }}>
        <TextField label="Date" type="date" required value={day} min={isoDay(new Date())} onChange={(e) => setDay(e.target.value)} />
        <TextField label="From" type="time" required value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextField label="To" type="time" required value={to} onChange={(e) => setTo(e.target.value)} error={bad} />
      </div>
      <TextField label="Note" optional value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
    </Dialog>
  );
}

export function NoAccessDialog({ w, onClose }: P) {
  const toast = useToast();
  const [reason, setReason] = useState('tenant_no_show');
  const [note, setNote] = useState('');
  const cmd = useWoCommand(w, 'no-access');
  return (
    <Dialog
      open
      onClose={onClose}
      title="Couldn’t get in"
      submitLabel="Record no access"
      danger
      onSubmit={async () => {
        await cmd.mutateAsync({ reason, note: note.trim() || null });
        toast('Recorded. The job is back to scheduling.');
        onClose();
      }}
    >
      <ProxyNote w={w} />
      <SelectField label="What happened" value={reason} onChange={(e) => setReason(e.target.value)}>
        {Object.entries(NO_ACCESS_LABEL).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </SelectField>
      <TextField label="Note" optional value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
    </Dialog>
  );
}

// ---------------------------------------------------------------- completion (vendor step) and close (PM review)

export function CompleteDialog({ w, onClose }: P) {
  const toast = useToast();
  const [photos, setPhotos] = useState<string[]>([]);
  const [invoiceFile, setInvoiceFile] = useState<string | undefined>();
  const [busy, setBusy] = useState({ p: false, i: false });
  const [amount, setAmount] = useState('');
  const [number, setNumber] = useState('');
  const [notes, setNotes] = useState('');
  const cmd = useWoCommand(w, 'complete');
  const photoUp = useWoUpload(w, 'completion_photo');
  const invUp = useWoUpload(w, 'invoice');
  const cents = parseMoney(amount);
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title="Record completion"
      submitLabel="Mark complete"
      submitDisabled={!photos.length || cents === null || busy.p || busy.i}
      onSubmit={async () => {
        await cmd.mutateAsync({ notes: notes.trim() || null, invoiceAmountCents: cents, invoiceNumber: number.trim() || null, ...(invoiceFile ? { invoiceAttachmentId: invoiceFile } : {}), photoAttachmentIds: photos });
        toast('Marked complete. It’s on your copy for review.');
        onClose();
      }}
    >
      <ProxyNote w={w} />
      <Uploader accept={ACCEPT_IMAGES} label="Completion photos (at least one)" capture {...photoUp} onChange={(ids, b) => { setPhotos(ids); setBusy((x) => ({ ...x, p: b })); }} />
      <div className="form-grid">
        <MoneyField label="Invoice amount" required value={amount} onChange={(e) => setAmount(e.target.value)} error={amount && cents === null ? 'Enter an amount' : null} />
        <TextField label="Invoice number" optional value={number} onChange={(e) => setNumber(e.target.value)} maxLength={100} />
        <TextArea className="full" label="Completion notes" optional value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} />
      </div>
      <Uploader accept={ACCEPT_DOCS} multiple={false} label="Invoice file" {...invUp} onChange={(ids, b) => { setInvoiceFile(ids[0]); setBusy((x) => ({ ...x, i: b })); }} />
    </Dialog>
  );
}

export function CloseDialog({ w, onClose, thresholdCents, overagePct }: P & { thresholdCents: number; overagePct: number }) {
  const toast = useToast();
  const inv = w.invoices.find((i) => i.status === 'submitted');
  const authorised = w.approvedAmountCents ?? w.estimatedCostCents;
  const tolerance = 1 + overagePct / 100;
  const over = inv && authorised !== null ? inv.amountCents > authorised * tolerance : false;
  // Mirrors the server: spend above the owner's threshold needs an approval that covers it, or their offline OK.
  const covered = inv && w.approvedAmountCents !== null ? inv.amountCents <= w.approvedAmountCents * tolerance : false;
  const crosses = inv ? inv.amountCents > thresholdCents && !covered : false;
  const [confirm, setConfirm] = useState(false);
  const [offline, setOffline] = useState(false);
  const [note, setNote] = useState('');
  const cmd = useWoCommand(w, 'close');
  if (!inv) return null;
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Approve & close ${w.ref}`}
      submitLabel="Approve invoice & close"
      submitDisabled={(over && !confirm) || (crosses && !offline)}
      onSubmit={async () => {
        await cmd.mutateAsync({ confirmOverage: confirm, ownerApprovedOffline: offline, note: note.trim() || null });
        toast(`${w.ref} closed. ${money(inv.amountCents)} recorded as an expense.`);
        onClose();
      }}
    >
      <div className="fields" style={{ ['--cols' as string]: 2, border: '1.5px solid var(--rule)' }}>
        <div className="f">
          <span className="f-label">Invoice</span>
          <div className="f-value">{money(inv.amountCents)}</div>
        </div>
        <div className="f">
          <span className="f-label">Authorised</span>
          <div className="f-value">{money(authorised)}</div>
        </div>
      </div>
      {over || crosses ? (
        <div className="stack-sm">
          {over && (
            <>
              <Notice tone="warn" icon={AlertTriangle}>
                The invoice is more than {overagePct}% over the authorised amount.
              </Notice>
              <Check label="I’ve reviewed the overage and accept it" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
            </>
          )}
          {crosses && (
            <>
              <Notice tone="warn" icon={AlertTriangle}>
                {money(inv.amountCents)} is above {w.owner.name}’s {money(thresholdCents)} approval threshold and no owner approval covers it.
              </Notice>
              <Check label={`${w.owner.name} approved this amount by phone or in person`} checked={offline} onChange={(e) => setOffline(e.target.checked)} />
            </>
          )}
        </div>
      ) : (
        <p className="muted">Closing records {money(inv.amountCents)} as the expense, billed to the {w.billTo}, and asks the tenant to confirm the fix.</p>
      )}
      <TextField label="Note" optional value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
    </Dialog>
  );
}
