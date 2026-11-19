import { AlertTriangle, CalendarClock, CalendarX, CheckCircle2, FileSignature, Hammer, MapPin, Navigation, Phone, Play, ThumbsDown, ThumbsUp, Upload, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Gallery, Uploader } from '../../components/files';
import { Button, Check, Fields, MoneyField, Notice, SelectField, TextArea, TextField } from '../../components/ui';
import { api } from '../../lib/api';
import { date, DOC_TYPE_LABEL, isoDay, zonedTime, money, NO_ACCESS_LABEL, parseMoney, PERMISSION_LABEL, phone } from '../../lib/format';
import { ACCEPT_DOCS, ACCEPT_IMAGES } from '../../lib/upload';
import { Card, linkUpload, post, useAction, type ViewProps } from './kit';

// ---------------------------------------------------------------- vendor job

const VENDOR_STATUS: Record<string, string> = {
  awaiting_acceptance: 'New job: please accept or decline',
  awaiting_quote: 'Accepted: send your quote',
  awaiting_approval: 'Quote sent: waiting for approval',
  awaiting_scheduling: 'Approved: book a time with the tenant',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed: the manager is reviewing',
  closed: 'Closed. Thank you!',
  cancelled: 'Cancelled',
  draft: 'Not assigned',
};

export function VendorJobView({ token, d, refresh }: ViewProps<'job'>) {
  const a = useAction(refresh);
  const [panel, setPanel] = useState<null | 'decline' | 'quote' | 'schedule' | 'reschedule' | 'no_access' | 'complete'>(null);
  const can = (x: string) => d.actions.includes(x);
  const loc = `${d.location.address}${d.location.unit ? ` #${d.location.unit}` : ''}, ${d.location.city}, ${d.location.state} ${d.location.zip}`;
  const done = (msg: string) => () => { setPanel(null); a.setError(null); setToast(msg); };
  const [toast, setToast] = useState<string | null>(null);

  return (
    <div className="stack">
      <div className="stack-sm">
        <div className="hstack">
          <span className="tag">{d.job.ref}</span>
          {d.job.priority === 'emergency' && <span className="stamp bad">Emergency</span>}
          {d.job.priority === 'high' && <span className="stamp warn">High priority</span>}
        </div>
        <h1>{d.issue.title}</h1>
        <p className="strong" style={{ color: 'var(--ballpoint)' }}>{VENDOR_STATUS[d.job.status] ?? d.job.status}</p>
      </div>
      {toast && <Notice tone="ok" icon={CheckCircle2}>{toast}</Notice>}
      {a.error && <Notice tone="bad">{a.error}</Notice>}

      {can('accept') && !panel && (
        <div className="big-actions">
          <Button variant="primary" size="lg" icon={ThumbsUp} loading={a.busy === 'accept'} onClick={() => a.run('accept', () => post(token, 'accept'), () => setToast('Accepted. Access details are below.'))}>
            Accept job
          </Button>
          {can('start') && (
            <Button size="lg" variant="danger solid" icon={Play} loading={a.busy === 'start'} onClick={() => a.run('start', () => post(token, 'start'), () => setToast('Started. The owner is notified.'))}>
              On my way now (emergency)
            </Button>
          )}
          <Button size="lg" icon={ThumbsDown} onClick={() => setPanel('decline')}>
            Can’t take it
          </Button>
        </div>
      )}
      {!can('accept') && !panel && d.actions.length > 0 && (
        <div className="big-actions">
          {can('quote') && d.job.status === 'awaiting_quote' && <Button variant="primary" size="lg" icon={FileSignature} onClick={() => setPanel('quote')}>Send quote</Button>}
          {can('schedule') && <Button variant="primary" size="lg" icon={CalendarClock} onClick={() => setPanel('schedule')}>Book appointment</Button>}
          {can('start') && <Button variant={d.job.status === 'scheduled' ? 'primary' : 'danger solid'} size="lg" icon={Play} loading={a.busy === 'start'} onClick={() => a.run('start', () => post(token, 'start'), () => setToast('Job started'))}>{d.job.status === 'scheduled' ? 'Start job' : 'On my way now (emergency)'}</Button>}
          {can('complete') && <Button variant="primary" size="lg" icon={Hammer} onClick={() => setPanel('complete')}>Mark complete</Button>}
          {can('reschedule') && <Button size="lg" icon={CalendarClock} onClick={() => setPanel('reschedule')}>Reschedule</Button>}
          {can('no_access') && <Button size="lg" icon={CalendarX} onClick={() => setPanel('no_access')}>Couldn’t get in</Button>}
          {can('quote') && d.job.status !== 'awaiting_quote' && <Button size="lg" icon={FileSignature} onClick={() => setPanel('quote')}>{d.job.status === 'awaiting_approval' ? 'Revise quote' : 'Need approval for more work'}</Button>}
        </div>
      )}

      {panel === 'decline' && <DeclinePanel token={token} onDone={done('Declined. Thanks for letting us know.')} onCancel={() => setPanel(null)} refresh={refresh} />}
      {panel === 'quote' && <QuotePanel token={token} onDone={done('Quote sent for approval.')} onCancel={() => setPanel(null)} refresh={refresh} />}
      {(panel === 'schedule' || panel === 'reschedule') && <SchedulePanel token={token} timeZone={d.org.timezone} availability={d.access?.availability ?? null} onDone={done('Booked. The tenant and manager are notified.')} onCancel={() => setPanel(null)} refresh={refresh} />}
      {panel === 'no_access' && <NoAccessPanel token={token} onDone={done('Recorded. Please book a new time.')} onCancel={() => setPanel(null)} refresh={refresh} />}
      {panel === 'complete' && <CompletePanel token={token} onDone={done('Submitted. The manager will review it.')} onCancel={() => setPanel(null)} refresh={refresh} />}

      {d.appointment && (
        <Card title="Appointment" tone={d.appointment.status === 'tenant_conflict' ? 'risk' : 'vendor'}>
          <p style={{ fontSize: 17, fontWeight: 650 }}>{d.appointment.window}</p>
          {d.appointment.status === 'tenant_conflict' && <Notice tone="bad">The tenant says this time doesn’t work. Please reschedule.</Notice>}
        </Card>
      )}

      <Card title="Where">
        <p style={{ fontSize: 16, fontWeight: 600 }}>{loc}</p>
        <a className="btn sm" href={`https://maps.google.com/?q=${encodeURIComponent(loc)}`} target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-start' }}>
          <Navigation size={14} /> Directions
        </a>
      </Card>

      <Card title="The job">
        <p className="prewrap">{d.issue.description}</p>
        {d.job.requiredWork && (
          <div>
            <span className="f-label">Scope of work</span>
            <p className="prewrap" style={{ color: 'var(--ballpoint)' }}>{d.job.requiredWork}</p>
          </div>
        )}
        <Gallery files={d.issue.photos} token={token} empty="No photos." />
        <div className="hstack small muted">
          {d.job.expectedCompletionAt && <span>Needed by {date(d.job.expectedCompletionAt)}</span>}
          {d.job.approvedAmountCents !== null && <span>· Approved up to {money(d.job.approvedAmountCents)}</span>}
        </div>
      </Card>

      {d.access ? (
        <Card title="Tenant & access" tone="tenant" flush>
          <Fields
            cols={1}
            items={[
              { label: 'Tenant', value: d.access.tenantName },
              { label: 'Phone', value: d.access.tenantPhone && <a href={`tel:${d.access.tenantPhone}`}><Phone size={13} style={{ display: 'inline' }} /> {phone(d.access.tenantPhone)}</a> },
              { label: 'Availability', value: d.access.availability },
              { label: 'Permission to enter', value: d.access.permissionToEnter && PERMISSION_LABEL[d.access.permissionToEnter] },
              { label: 'Access notes', value: d.access.accessNotes },
              { label: 'Pets', value: d.access.pets },
            ]}
          />
        </Card>
      ) : (
        <Notice>Tenant contact and access details appear once you accept the job.</Notice>
      )}

      {(d.quote || d.invoice) && (
        <Card title="Paperwork">
          {d.quote && <p>Quote v{d.quote.version}: <b>{money(d.quote.amountCents)}</b> · {d.quote.status}</p>}
          {d.invoice && <p>Invoice: <b>{money(d.invoice.amountCents)}</b> · {d.invoice.status}</p>}
        </Card>
      )}
      <p className="small muted">
        Questions? Call {d.org.name}
        {d.org.phone && <> at <a href={`tel:${d.org.phone}`}>{phone(d.org.phone)}</a></>}.
      </p>
    </div>
  );
}

interface PanelProps {
  token: string;
  onDone: () => void;
  onCancel: () => void;
  refresh: () => void;
}

function Panel({ title, children, onCancel, submit, busy, disabled, error, danger }: { title: string; children: ReactNode; onCancel: () => void; submit: { label: string; run: () => void }; busy: boolean; disabled?: boolean; error: string | null; danger?: boolean }) {
  return (
    <form className="box lift" onSubmit={(e) => { e.preventDefault(); submit.run(); }}>
      <div className="box-head">
        <h2>{title}</h2>
        <button type="button" className="icon-btn dark" aria-label="Close" onClick={onCancel}>
          <X size={16} />
        </button>
      </div>
      <div className="box-body stack-sm">
        {children}
        {error && <Notice tone="bad">{error}</Notice>}
        <Button type="submit" variant={danger ? 'danger solid' : 'primary'} size="lg" block loading={busy} disabled={disabled}>
          {submit.label}
        </Button>
      </div>
    </form>
  );
}

function DeclinePanel({ token, onDone, onCancel, refresh }: PanelProps) {
  const a = useAction(refresh);
  const [reason, setReason] = useState('');
  const quick = ['Fully booked this week', 'Outside my area', 'Not my trade'];
  return (
    <Panel title="Decline this job" onCancel={onCancel} busy={Boolean(a.busy)} error={a.error} disabled={!reason.trim()} danger submit={{ label: 'Decline job', run: () => a.run('x', () => post(token, 'decline', { reason: reason.trim() }), onDone) }}>
      <div className="chips">
        {quick.map((q) => (
          <button key={q} type="button" className="chip" aria-pressed={reason === q} onClick={() => setReason(q)}>
            {q}
          </button>
        ))}
      </div>
      <TextField label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
    </Panel>
  );
}

function QuotePanel({ token, onDone, onCancel, refresh }: PanelProps) {
  const a = useAction(refresh);
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [file, setFile] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const cents = parseMoney(amount);
  return (
    <Panel title="Your quote" onCancel={onCancel} busy={Boolean(a.busy)} error={a.error} disabled={cents === null || uploading} submit={{ label: 'Send quote', run: () => a.run('x', () => post(token, 'quote', { amountCents: cents, description: desc.trim() || null, ...(file ? { attachmentId: file } : {}) }), onDone) }}>
      <MoneyField label="Total amount" required value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoFocus />
      <TextArea label="What’s included" optional value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={5000} />
      <Uploader accept={ACCEPT_DOCS} multiple={false} label="Attach quote (optional)" {...linkUpload(token, 'quote')} onChange={(ids, b) => { setFile(ids[0]); setUploading(b); }} />
    </Panel>
  );
}

function SchedulePanel({ token, timeZone, availability, onDone, onCancel, refresh }: PanelProps & { timeZone: string; availability: string | null }) {
  const a = useAction(refresh);
  const [day, setDay] = useState(isoDay(new Date(Date.now() + 864e5)));
  const [from, setFrom] = useState('09:00');
  const [to, setTo] = useState('11:00');
  const s = zonedTime(day, from, timeZone);
  const e = zonedTime(day, to, timeZone);
  const bad = !(e > s) ? 'End must be after start' : e.getTime() - s.getTime() > 12 * 3600e3 ? 'Keep the window under 12 hours' : null;
  return (
    <Panel title="Book the appointment" onCancel={onCancel} busy={Boolean(a.busy)} error={a.error} disabled={Boolean(bad)} submit={{ label: 'Confirm time', run: () => a.run('x', () => post(token, 'schedule', { startsAt: s.toISOString(), endsAt: e.toISOString() }), onDone) }}>
      {availability && <Notice>Tenant’s availability: {availability}</Notice>}
      <TextField label="Date" type="date" required min={isoDay(new Date())} value={day} onChange={(x) => setDay(x.target.value)} />
      <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <TextField label="From" type="time" required value={from} onChange={(x) => setFrom(x.target.value)} />
        <TextField label="To" type="time" required value={to} onChange={(x) => setTo(x.target.value)} error={bad} />
      </div>
    </Panel>
  );
}

function NoAccessPanel({ token, onDone, onCancel, refresh }: PanelProps) {
  const a = useAction(refresh);
  const [reason, setReason] = useState('tenant_no_show');
  const [note, setNote] = useState('');
  return (
    <Panel title="Couldn’t get in" onCancel={onCancel} busy={Boolean(a.busy)} error={a.error} danger submit={{ label: 'Report it', run: () => a.run('x', () => post(token, 'no-access', { reason, note: note.trim() || null }), onDone) }}>
      <SelectField label="What happened" value={reason} onChange={(e) => setReason(e.target.value)}>
        {Object.entries(NO_ACCESS_LABEL).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </SelectField>
      <TextField label="Note" optional value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
    </Panel>
  );
}

function CompletePanel({ token, onDone, onCancel, refresh }: PanelProps) {
  const a = useAction(refresh);
  const [photos, setPhotos] = useState<string[]>([]);
  const [inv, setInv] = useState<string | undefined>();
  const [busy, setBusy] = useState({ p: false, i: false });
  const [amount, setAmount] = useState('');
  const [number, setNumber] = useState('');
  const [notes, setNotes] = useState('');
  const cents = parseMoney(amount);
  return (
    <Panel
      title="Finish the job"
      onCancel={onCancel}
      busy={Boolean(a.busy)}
      error={a.error}
      disabled={!photos.length || cents === null || busy.p || busy.i}
      submit={{ label: photos.length ? 'Submit completion' : 'Add at least one photo', run: () => a.run('x', () => post(token, 'complete', { notes: notes.trim() || null, invoiceAmountCents: cents, invoiceNumber: number.trim() || null, ...(inv ? { invoiceAttachmentId: inv } : {}), photoAttachmentIds: photos }), onDone) }}
    >
      <Uploader accept={ACCEPT_IMAGES} capture label="Photos of the finished work" {...linkUpload(token, 'completion_photo')} onChange={(ids, b) => { setPhotos(ids); setBusy((x) => ({ ...x, p: b })); }} />
      <MoneyField label="Invoice amount" required value={amount} onChange={(e) => setAmount(e.target.value)} />
      <TextField label="Invoice number" optional value={number} onChange={(e) => setNumber(e.target.value)} maxLength={100} />
      <TextArea label="Notes for the manager" optional value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} />
      <Uploader accept={ACCEPT_DOCS} multiple={false} label="Invoice file (optional)" {...linkUpload(token, 'invoice')} onChange={(ids, b) => { setInv(ids[0]); setBusy((x) => ({ ...x, i: b })); }} />
    </Panel>
  );
}

// ---------------------------------------------------------------- vendor self-onboarding

export function VendorProfileView({ token, d, refresh }: ViewProps<'vendor_profile'>) {
  const a = useAction(refresh);
  const v = d.vendor;
  const [f, setF] = useState({ contactName: v.contactName ?? '', email: v.email ?? '', phone: v.phone ?? '', address: v.address ?? '', availabilityText: v.availabilityText ?? '', smsConsent: false });
  const [saved, setSaved] = useState<string | null>(null);
  const [doc, setDoc] = useState({ type: 'insurance', expiresOn: '', label: '' });
  const [file, setFile] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [key, setKey] = useState(0);
  const hasInsurance = d.documents.some((x) => x.type === 'insurance');
  const nul = (s: string) => s.trim() || null;

  return (
    <div className="stack">
      <div className="stack-sm">
        <h1>{v.companyName}</h1>
        <p className="muted">{d.org.name} asked you to confirm your details and upload your paperwork. No account needed.</p>
      </div>
      {saved && <Notice tone="ok" icon={CheckCircle2}>{saved}</Notice>}
      {a.error && <Notice tone="bad">{a.error}</Notice>}
      {!hasInsurance && <Notice tone="warn" icon={AlertTriangle}>No insurance certificate on file yet. Please upload your COI so you can be dispatched without delays.</Notice>}

      <form className="box lift" onSubmit={(e) => { e.preventDefault(); a.run('profile', () => api(`/links/${token}/profile`, { method: 'PATCH', body: { contactName: nul(f.contactName), email: nul(f.email), phone: nul(f.phone), address: nul(f.address), availabilityText: nul(f.availabilityText), ...(f.smsConsent ? { smsConsent: true } : {}) } }), () => setSaved('Details saved. Thank you!')); }}>
        <div className="box-head"><h2>Your details</h2></div>
        <div className="box-body stack-sm">
          <TextField label="Contact name" value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} maxLength={200} />
          <TextField label="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <TextField label="Mobile phone" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <TextField label="Business address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} maxLength={500} />
          <TextField label="Availability" value={f.availabilityText} onChange={(e) => setF({ ...f, availabilityText: e.target.value })} maxLength={500} placeholder="Mon–Fri 8–5, emergencies 24/7" />
          <Check label="Text me job links" hint="Message rates may apply. Reply STOP to opt out." checked={f.smsConsent} onChange={(e) => setF({ ...f, smsConsent: e.target.checked })} />
          <Button type="submit" variant="primary" size="lg" block loading={a.busy === 'profile'}>Save details</Button>
        </div>
      </form>

      <section className="box lift">
        <div className="box-head"><h2>Compliance documents</h2></div>
        <div className="box-body stack-sm">
          {d.documents.length > 0 && (
            <ul className="rows">
              {d.documents.map((x) => (
                <li key={x.id} className="row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', padding: '8px 0' }}>
                  <span>{DOC_TYPE_LABEL[x.type] ?? x.type}{x.label && <span className="muted"> · {x.label}</span>}</span>
                  <span className="small muted">{x.expiresOn ? `Expires ${date(x.expiresOn)}` : 'No expiry'}</span>
                </li>
              ))}
            </ul>
          )}
          <form
            className="stack-sm"
            onSubmit={(e) => { e.preventDefault(); a.run('doc', () => post(token, 'documents', { type: doc.type, attachmentId: file, expiresOn: doc.expiresOn || null, label: nul(doc.label) }), () => { setSaved('Document uploaded. Thank you!'); setFile(undefined); setKey((k) => k + 1); setDoc({ type: 'insurance', expiresOn: '', label: '' }); }); }}
          >
            <SelectField label="Document" value={doc.type} onChange={(e) => setDoc({ ...doc, type: e.target.value })}>
              {Object.entries(DOC_TYPE_LABEL).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </SelectField>
            <TextField label="Expires on" type="date" optional={doc.type !== 'insurance'} value={doc.expiresOn} onChange={(e) => setDoc({ ...doc, expiresOn: e.target.value })} />
            <Uploader key={key} accept={ACCEPT_DOCS} multiple={false} label="Choose file (PDF or photo)" {...linkUpload(token, 'document')} onChange={(ids, b) => { setFile(ids[0]); setUploading(b); }} />
            <Button type="submit" size="lg" block icon={Upload} loading={a.busy === 'doc'} disabled={!file || uploading}>Upload document</Button>
          </form>
        </div>
      </section>
      <p className="small muted"><MapPin size={12} style={{ display: 'inline' }} /> Sent by {d.org.name}.</p>
    </div>
  );
}
