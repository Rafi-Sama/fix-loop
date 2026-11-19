import { EyeOff, Lock, Mail, MessageSquare, Send, Smartphone } from 'lucide-react';
import { useMemo, useState } from 'react';
import { dateTime, label, plural, relative } from '../lib/format';
import { describeEvent, describeTemplate } from '../lib/timeline';
import type { Comment, Communication, TimelineEvent } from '../lib/types';
import { Button, Segmented } from './ui';

type Entry =
  | { kind: 'event'; at: string; e: TimelineEvent }
  | { kind: 'comment'; at: string; c: Comment }
  | { kind: 'comm'; at: string; m: Communication };

export type ActorName = (type: TimelineEvent['actorType'], id: string | null) => string;

const STATUS_TONE: Record<string, string> = { delivered: 'ok', sent: 'info', queued: '', failed: 'bad', bounced: 'bad' };

export function Timeline({
  events,
  comments,
  communications = [],
  actorName,
  onComment,
}: {
  events: TimelineEvent[];
  comments: Comment[];
  communications?: Communication[];
  actorName: ActorName;
  onComment?: (body: string, visibility: 'internal' | 'shared') => Promise<unknown>;
}) {
  const [filter, setFilter] = useState<'all' | 'comms' | 'notes'>('all');
  const entries = useMemo(() => {
    const all: Entry[] = [
      ...events.map((e) => ({ kind: 'event' as const, at: e.createdAt, e })),
      ...comments.map((c) => ({ kind: 'comment' as const, at: c.createdAt, c })),
      ...communications.map((m) => ({ kind: 'comm' as const, at: m.sentAt ?? m.createdAt, m })),
    ];
    return all
      .filter((x) => filter === 'all' || (filter === 'comms' ? x.kind === 'comm' || (x.kind === 'comment' && x.c.visibility === 'shared') : x.kind === 'comment'))
      .sort((a, b) => a.at.localeCompare(b.at));
  }, [events, comments, communications, filter]);

  return (
    <div className="stack-sm">
      <div className="spread" style={{ flexWrap: 'wrap' }}>
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Everything' },
            { value: 'comms', label: 'Communications' },
            { value: 'notes', label: 'Notes' },
          ]}
        />
        <span className="small muted">{plural(entries.length, 'entry', 'entries')}</span>
      </div>
      {entries.length === 0 ? (
        <p className="muted small">Nothing here yet.</p>
      ) : (
        <ol className="tl">
          {entries.map((x) => (
            <li key={`${x.kind}-${x.kind === 'event' ? x.e.id : x.kind === 'comment' ? x.c.id : x.m.id}`}>
              {x.kind === 'event' && <EventItem e={x.e} actorName={actorName} />}
              {x.kind === 'comment' && <CommentItem c={x.c} actorName={actorName} />}
              {x.kind === 'comm' && <CommItem m={x.m} actorName={actorName} />}
            </li>
          ))}
        </ol>
      )}
      {onComment && <Composer onComment={onComment} />}
    </div>
  );
}

const Meta = ({ at, who, extra }: { at: string; who: string; extra?: React.ReactNode }) => (
  <div className="t-meta">
    <time dateTime={at} title={dateTime(at)}>
      {relative(at)}
    </time>
    <span aria-hidden>·</span>
    <span>{who}</span>
    {extra}
  </div>
);

function EventItem({ e, actorName }: { e: TimelineEvent; actorName: ActorName }) {
  const who = actorName(e.actorType, e.actorId);
  const proxy = e.onBehalfOf ? ` on behalf of ${actorName('vendor', e.onBehalfOf)}` : '';
  return (
    <>
      <span className={`dot ${e.actorType}`} aria-hidden />
      <div className="t-what">{describeEvent(e)}</div>
      <Meta
        at={e.createdAt}
        who={`${who}${proxy}`}
        extra={
          e.visibility === 'internal' && (
            <span className="hstack" title="Not visible to vendors, tenants or owners">
              <EyeOff size={12} /> internal
            </span>
          )
        }
      />
    </>
  );
}

function CommentItem({ c, actorName }: { c: Comment; actorName: ActorName }) {
  const internal = c.visibility === 'internal';
  return (
    <>
      <span className={`dot ${c.authorType}`} aria-hidden />
      <div className="t-what hstack">
        <MessageSquare size={13} /> {internal ? 'Internal note' : 'Shared comment'}
      </div>
      <Meta at={c.createdAt} who={actorName(c.authorType, c.authorId)} />
      <div className={internal ? 'note internal' : 'note'}>{c.body}</div>
    </>
  );
}

function CommItem({ m, actorName }: { m: Communication; actorName: ActorName }) {
  const Icon = m.channel === 'sms' ? Smartphone : Mail;
  return (
    <>
      <span className="dot comm" aria-hidden />
      <div className="t-what hstack">
        <Icon size={13} /> {describeTemplate(m.template)}
      </div>
      <Meta at={m.sentAt ?? m.createdAt} who={`${m.channel === 'sms' ? 'SMS' : 'Email'} to ${m.recipientType === 'user' ? actorName('user', m.recipientId) : m.recipientType}`} extra={<span className={`pill ${STATUS_TONE[m.status] ?? ''}`}>{label(m.status)}</span>} />
    </>
  );
}

function Composer({ onComment }: { onComment: (body: string, visibility: 'internal' | 'shared') => Promise<unknown> }) {
  const [body, setBody] = useState('');
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await onComment(body.trim(), shared ? 'shared' : 'internal');
      setBody('');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack-sm" style={{ borderTop: '1px solid var(--hair)', paddingTop: 12 }}>
      <label className="sr-only" htmlFor="note">
        Add a note
      </label>
      <textarea
        id="note"
        className="textarea"
        placeholder={shared ? 'Shared comment…' : 'Internal note, only your team sees this…'}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && send()}
        maxLength={5000}
        style={{ minHeight: 70, background: shared ? undefined : '#fffcec' }}
      />
      <div className="spread">
        <label className="check small">
          <input type="checkbox" checked={!shared} onChange={(e) => setShared(!e.target.checked)} />
          <span className="hstack"><Lock size={12} /> Internal only</span>
        </label>
        <Button size="sm" variant="primary" icon={Send} loading={busy} disabled={!body.trim()} onClick={send}>
          Post
        </Button>
      </div>
    </div>
  );
}
