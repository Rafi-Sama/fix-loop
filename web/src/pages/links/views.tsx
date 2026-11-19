import { CalendarX, Check as CheckIcon, CheckCircle2, PhoneCall, Star, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { useState } from 'react';
import { Gallery, Uploader } from '../../components/files';
import { Button, Notice, TextArea, TextField } from '../../components/ui';
import { date, money, phone, relative } from '../../lib/format';
import { ACCEPT_IMAGES } from '../../lib/upload';
import { Card, linkUpload, post, useAction, type Of, type ViewProps } from './kit';

// ---------------------------------------------------------------- owner approval

export function ApprovalView({ token, d }: ViewProps<'approval'>) {
  // No refresh after deciding: the server revokes the approval link, so a refetch would show "expired".
  const a = useAction(() => {});
  const [note, setNote] = useState('');
  const [decided, setDecided] = useState<string | null>(null);
  const decide = (decision: 'approved' | 'declined' | 'call_me') => a.run(decision, () => post(token, 'decide', { decision, note: note.trim() || null }), () => setDecided(decision));
  return (
    <div className="stack">
      <div className="stack-sm">
        <h1>Approve a repair</h1>
        <p className="muted">
          {d.property.address}
          {d.property.unit && ` #${d.property.unit}`}, {d.property.city}
        </p>
      </div>
      {decided ? (
        <Notice tone="ok" icon={CheckCircle2}>
          {decided === 'approved' ? 'Approved. The vendor can schedule the work.' : decided === 'declined' ? 'Declined. Your property manager will follow up.' : 'Got it. Your property manager will call you.'}
        </Notice>
      ) : !d.pending ? (
        <Notice>This approval has already been handled. Nothing more to do.</Notice>
      ) : null}
      {d.quote && (
        <section className="box lift owner">
          <div className="band owner" style={{ clipPath: 'none' }}>
            Quote{d.vendor && ` from ${d.vendor.companyName}`}
          </div>
          <div className="box-body stack-sm">
            <div style={{ fontSize: 34, fontWeight: 760, fontStretch: '90%' }}>{money(d.quote.amountCents)}</div>
            {d.quote.description && <p className="prewrap">{d.quote.description}</p>}
          </div>
        </section>
      )}
      <Card title="The issue">
        <h3>{d.issue.title}</h3>
        <p className="prewrap">{d.issue.description}</p>
        <Gallery files={d.issue.photos} token={token} empty="No photos." />
      </Card>
      {d.pending && !decided && (
        <div className="stack-sm">
          <TextField label="Note to your manager" optional value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          {a.error && <Notice tone="bad">{a.error}</Notice>}
          <div className="big-actions">
            <Button variant="primary" size="lg" icon={CheckIcon} loading={a.busy === 'approved'} disabled={Boolean(a.busy)} onClick={() => decide('approved')}>
              Approve {d.quote && money(d.quote.amountCents)}
            </Button>
            <Button size="lg" icon={PhoneCall} loading={a.busy === 'call_me'} disabled={Boolean(a.busy)} onClick={() => decide('call_me')}>
              Call me first
            </Button>
            <Button size="lg" variant="danger" icon={X} loading={a.busy === 'declined'} disabled={Boolean(a.busy)} onClick={() => decide('declined')}>
              Decline
            </Button>
          </div>
        </div>
      )}
      <p className="small muted">Sent by {d.org.name}. No account needed.</p>
    </div>
  );
}

// ---------------------------------------------------------------- tenant

export function TrackView({ token, d, refresh }: ViewProps<'request_track' | 'needs_info' | 'confirm_fix'>) {
  const r = d.request;
  const a = useAction(refresh);
  const [msg, setMsg] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [fixed, setFixed] = useState<boolean | null>(null);
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');

  return (
    <div className="stack">
      <div className="stack-sm">
        <span className="tag" style={{ alignSelf: 'flex-start' }}>{r.ref}</span>
        <h1>{r.title}</h1>
        <p className="muted">Reported {relative(r.createdAt)}</p>
      </div>
      <section className="box lift">
        <div className="band" style={{ clipPath: 'none' }}>Status</div>
        <div className="box-body">
          <p style={{ fontSize: 20, fontWeight: 700 }}>{r.status}</p>
        </div>
      </section>
      {msg && <Notice tone="ok" icon={CheckCircle2}>{msg}</Notice>}
      {a.error && <Notice tone="bad">{a.error}</Notice>}

      {d.purpose === 'needs_info' && r.question && (
        <form className="box lift" onSubmit={(e) => { e.preventDefault(); a.run('answer', () => post(token, 'answer', { answer: answer.trim(), photoIds: photos }), () => setMsg('Thanks! Your manager has your answer.')); }}>
          <div className="band tenant" style={{ clipPath: 'none' }}>Your manager asked</div>
          <div className="box-body stack-sm">
            <p style={{ fontSize: 16 }}>“{r.question}”</p>
            <TextArea label="Your answer" required value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={5000} />
            <Uploader accept={ACCEPT_IMAGES} capture label="Add photos" {...linkUpload(token, 'issue_photo')} onChange={(ids, b) => { setPhotos(ids); setUploading(b); }} />
            <Button type="submit" variant="primary" size="lg" block loading={a.busy === 'answer'} disabled={!answer.trim() || uploading}>
              Send answer
            </Button>
          </div>
        </form>
      )}

      {d.appointment && (
        <Card title="Appointment" tone="vendor">
          <p style={{ fontSize: 17, fontWeight: 650 }}>{d.appointment.window}</p>
          {d.appointment.status === 'tenant_conflict' ? (
            <p className="small muted">You said this time doesn’t work. The repair person will offer a new one.</p>
          ) : d.purpose === 'request_track' && conflict === null ? (
            <Button icon={CalendarX} onClick={() => setConflict('')} style={{ alignSelf: 'flex-start' }}>
              This time doesn’t work
            </Button>
          ) : d.purpose === 'request_track' ? (
            <form className="stack-sm" onSubmit={(e) => { e.preventDefault(); a.run('conflict', () => post(token, 'conflict', { note: conflict?.trim() || null }), () => { setConflict(null); setMsg('Thanks. We’ve asked for a new time.'); }); }}>
              <TextField label="What times work better?" optional value={conflict ?? ''} onChange={(e) => setConflict(e.target.value)} maxLength={1000} />
              <Button type="submit" variant="primary" loading={a.busy === 'conflict'}>Ask for a new time</Button>
            </form>
          ) : null}
        </Card>
      )}

      {d.purpose === 'confirm_fix' && r.awaitingConfirmation && (
        <form className="box lift" onSubmit={(e) => { e.preventDefault(); fixed !== null && a.run('confirm', () => post(token, 'confirm', { fixed, ...(rating ? { rating } : {}), note: note.trim() || null }), () => setMsg(fixed ? 'Thanks for confirming!' : 'Sorry about that. We’ve reopened your request.')); }}>
          <div className="band owner" style={{ clipPath: 'none' }}>Was it fixed?</div>
          <div className="box-body stack-sm">
            <div className="big-actions" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <Button size="lg" variant={fixed === true ? 'primary' : undefined} icon={ThumbsUp} onClick={() => setFixed(true)} aria-pressed={fixed === true}>
                Yes, fixed
              </Button>
              <Button size="lg" variant={fixed === false ? 'danger solid' : undefined} icon={ThumbsDown} onClick={() => setFixed(false)} aria-pressed={fixed === false}>
                Not fixed
              </Button>
            </div>
            {fixed !== null && (
              <>
                <div>
                  <span className="lbl small strong">How did it go? (optional)</span>
                  <fieldset className="stars" aria-label="Rating">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={n <= rating} onClick={() => setRating(n === rating ? 0 : n)}>
                        <Star size={30} fill={n <= rating ? 'currentColor' : 'none'} />
                      </button>
                    ))}
                  </fieldset>
                </div>
                <TextArea label={fixed ? 'Anything to add?' : 'What’s still wrong?'} optional={fixed} required={!fixed} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
                <Button type="submit" variant="primary" size="lg" block loading={a.busy === 'confirm'}>
                  Send
                </Button>
              </>
            )}
          </div>
        </form>
      )}

      {d.purpose === 'confirm_fix' && !r.awaitingConfirmation && !msg && <Notice icon={CheckCircle2}>There’s nothing to confirm on this request right now.</Notice>}

      {d.purpose === 'request_track' && (
        <Card title="Add more photos">
          <Uploader accept={ACCEPT_IMAGES} capture label="Add photos" {...linkUpload(token, 'issue_photo')} onChange={(ids, b) => !b && ids.length > 0 && setMsg(`${ids.length} photo${ids.length > 1 ? 's' : ''} added to your request.`)} />
        </Card>
      )}
      <p className="small muted">
        Questions? Call {d.org.name}
        {d.org.phone && <> at <a href={`tel:${d.org.phone}`}>{phone(d.org.phone)}</a></>}.
      </p>
    </div>
  );
}

export function MyRequestsView({ d }: { d: Of<'my_requests'> }) {
  return (
    <div className="stack">
      <h1>Your requests</h1>
      {d.requests.length === 0 ? (
        <Notice>No requests yet.</Notice>
      ) : (
        <ul className="rows box lift">
          {d.requests.map((r) => (
            <li key={r.ref} className="row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
              <div className="min0">
                <span className="tag">{r.ref}</span>
                <div className="row-title" style={{ marginTop: 4 }}>{r.title}</div>
                <div className="row-sub">{date(r.createdAt)}</div>
              </div>
              <span className="pill info">{r.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

