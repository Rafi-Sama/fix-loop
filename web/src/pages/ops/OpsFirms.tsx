import { useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronDown, KeyRound, LockOpen, LogOut, MailCheck, MailPlus, Pause, Play, UserCheck, UserX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Dialog, useToast } from '../../components/overlay';
import { Box, Button, Empty, Fields, LoadError, LoadMore, Notice, RowsSkeleton, Search, Segmented, Skeleton, TextArea } from '../../components/ui';
import { api } from '../../lib/api';
import { date, dateTime, relative, time } from '../../lib/format';
import { useFilters, useSearchFilter } from '../../lib/hooks';
import { flat } from '../../lib/queries';
import { EventsTable } from './OpsSecurity';
import { useEvents, useFirm, useFirms, useOverview, type FirmUser } from './ops';

// ---------------------------------------------------------------- overview + firm list

export function Overview() {
  const nav = useNavigate();
  const o = useOverview();
  const [f, set] = useFilters(['q', 'status'] as const);
  const [text, setText] = useSearchFilter(f.q, (q) => set({ q }));
  const status = (f.status || 'all') as 'all' | 'active' | 'suspended' | 'unverified';
  const list = useFirms({ q: f.q, status, limit: 30 });
  const rows = flat(list.data);
  const t = o.data;
  const tile = (label: string, value: number | undefined, bad = false, to?: string, sub?: string) => {
    const body = (
      <>
        <span className="f-label">{label}</span>
        {value === undefined ? <Skeleton h={30} w={60} /> : <b className={bad && value > 0 ? 'bad' : undefined}>{value}</b>}
        {sub && <small>{sub}</small>}
      </>
    );
    return to ? <Link className="tile" to={to} key={label}>{body}</Link> : <div className="tile" key={label}>{body}</div>;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Firms</h1>
          <p className="sub">Accounts and security across Fixloop. You see counts, never a firm’s tenants, properties or jobs.</p>
        </div>
      </div>
      {o.isError ? (
        <LoadError error={o.error} retry={() => o.refetch()} />
      ) : (
        <div className="tiles" style={{ marginBottom: 20 }}>
          {tile('Firms', t?.firms)}
          {tile('New this week', t?.newFirms7d)}
          {tile('Suspended', t?.suspended, true, '/ops?status=suspended')}
          {tile('Unconfirmed emails', t?.unverifiedUsers, false, '/ops?status=unverified')}
          {tile('Active users', t?.activeUsers24h, false, undefined, 'last 24 hours')}
          {tile('Failed sign-ins', t?.failedLogins24h, true, '/ops/security?type=auth&failuresOnly=true', 'last 24 hours')}
          {tile('Lockouts', t?.lockouts24h, true, '/ops/security?type=auth.locked', 'last 24 hours')}
          {tile('Staff sign-in failures', t?.platformFailures24h, true, '/ops/security?type=platform&failuresOnly=true', 'last 24 hours')}
        </div>
      )}
      <search className="toolbar">
        <Search value={text} onChange={setText} placeholder="Firm name, link slug or a user’s email" />
        <Segmented
          label="Status"
          value={status}
          onChange={(v) => set({ status: v === 'all' ? '' : v })}
          options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }, { value: 'unverified', label: 'Unconfirmed' }]}
        />
      </search>
      <Box flush lift>
        {list.isError ? (
          <LoadError error={list.error} retry={() => list.refetch()} />
        ) : list.isPending ? (
          <RowsSkeleton />
        ) : rows.length === 0 ? (
          <Empty icon={Building2} title={f.q || status !== 'all' ? 'No firms match' : 'No firms yet'}>
            {f.q || status !== 'all' ? 'Try another search or status.' : 'Firms appear here as soon as they sign up.'}
          </Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Firm</th>
                <th className="hide-sm r">Doors</th>
                <th className="hide-sm r">Open jobs</th>
                <th className="hide-sm r">Users</th>
                <th className="hide-sm">Last active</th>
                <th className="r">Status</th>
              </tr>
            </thead>
            <tbody style={{ opacity: list.isPlaceholderData ? 0.6 : 1 }}>
              {rows.map((r) => (
                <tr key={r.id} onClick={() => nav(`/ops/firms/${r.id}`)} style={{ cursor: 'pointer' }}>
                  <td>
                    <Link to={`/ops/firms/${r.id}`} className="strong" style={{ color: 'var(--ink)', textDecoration: 'none' }}>
                      {r.name}
                    </Link>
                    <div className="row-sub">
                      {r.adminEmail ?? 'No admin'} · joined {date(r.createdAt)}
                    </div>
                  </td>
                  <td className="hide-sm r">{r.doors}</td>
                  <td className="hide-sm r">{r.openWorkOrders}</td>
                  <td className="hide-sm r">{r.users}</td>
                  <td className="hide-sm small">{r.lastActiveAt ? relative(r.lastActiveAt) : 'Never'}</td>
                  <td className="r">
                    <FirmStatus suspended={Boolean(r.suspendedAt)} unverified={r.unverified > 0} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <LoadMore hasNext={list.hasNextPage} loading={list.isFetchingNextPage} onMore={() => list.fetchNextPage()} />
      </Box>
    </>
  );
}

const FirmStatus = ({ suspended, unverified }: { suspended: boolean; unverified: boolean }) =>
  suspended ? <span className="pill bad">Suspended</span> : unverified ? <span className="pill warn">Email unconfirmed</span> : <span className="small muted">Active</span>;

// ---------------------------------------------------------------- one firm

interface Action {
  title: string;
  body: string;
  submit: string;
  path: string;
  danger?: boolean;
  /** Free-text reason, stored in the security log. */
  reason?: boolean;
  done: string;
}

export function FirmView() {
  const { id = '' } = useParams();
  const firm = useFirm(id);
  const events = useEvents({ orgId: id, limit: 25 });
  const [action, setAction] = useState<Action | null>(null);

  if (firm.isError) return <LoadError error={firm.error} retry={() => firm.refetch()} />;
  if (firm.isPending) return <div className="stack"><Skeleton h={40} w="40%" /><Skeleton h={160} /><Skeleton h={240} /></div>;
  const f = firm.data;
  const suspended = Boolean(f.suspendedAt);

  const userActions = (u: FirmUser): Action[] => [
    ...(u.lockedUntil && new Date(u.lockedUntil) > new Date() ? [{ title: `Unlock ${u.name}`, body: 'Clears the failed sign-in count so they can try again now.', submit: 'Unlock', path: `/platform/users/${u.id}/unlock`, done: 'Unlocked.' }] : []),
    ...(u.activeSessions > 0 ? [{ title: `Sign ${u.name} out everywhere`, body: 'Ends every session on every device. Use for a lost laptop or a suspected takeover.', submit: 'End sessions', path: `/platform/users/${u.id}/revoke-sessions`, danger: true, reason: true, done: 'Sessions ended.' }] : []),
    ...(!u.emailVerifiedAt && !u.invitePending
      ? [
          { title: `Re-send confirmation to ${u.email}`, body: 'Sends a new confirmation link. Older links stop working once one is used.', submit: 'Re-send link', path: `/platform/users/${u.id}/resend-verification`, done: 'Confirmation email queued.' },
          { title: `Mark ${u.email} as confirmed`, body: 'Only when you’ve confirmed the address another way (e.g. a call from a known number).', submit: 'Mark confirmed', path: `/platform/users/${u.id}/mark-verified`, reason: true, done: 'Email marked as confirmed.' },
        ]
      : []),
    u.active
      ? { title: `Deactivate ${u.name}`, body: 'Blocks sign-in, ends their sessions and revokes their links. Their firm’s admins can reactivate them.', submit: 'Deactivate', path: `/platform/users/${u.id}/deactivate`, danger: true, reason: true, done: 'User deactivated.' }
      : { title: `Reactivate ${u.name}`, body: 'They can sign in again with their existing password.', submit: 'Reactivate', path: `/platform/users/${u.id}/reactivate`, reason: true, done: 'User reactivated.' },
  ];

  return (
    <div className="stack">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/ops">Firms</Link> <span aria-hidden>›</span> {f.name}
      </nav>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>{f.name}</h1>
          <p className="sub">
            Joined {date(f.createdAt)} · request link <span className="mono">/r/{f.slug}</span>
          </p>
        </div>
        {suspended ? (
          <Button icon={Play} onClick={() => setAction({ title: `Un-suspend ${f.name}`, body: 'Sign-in, links, the request form and emails start working again. Messages skipped while suspended are not re-sent.', submit: 'Un-suspend', path: `/platform/orgs/${f.id}/unsuspend`, reason: true, done: 'Firm un-suspended.' })}>
            Un-suspend
          </Button>
        ) : (
          <Button variant="danger" icon={Pause} onClick={() => setAction({ title: `Suspend ${f.name}`, body: 'Immediately signs everyone out and stops sign-in, vendor, tenant and owner links, the public request form and all outgoing messages. Nothing is deleted.', submit: 'Suspend firm', path: `/platform/orgs/${f.id}/suspend`, danger: true, reason: true, done: 'Firm suspended.' })}>
            Suspend
          </Button>
        )}
      </div>
      {suspended && (
        <Notice tone="bad">
          Suspended {dateTime(f.suspendedAt)}: “{f.suspendedReason}”
        </Notice>
      )}
      <Box title="Firm">
        <Fields
          cols={3}
          items={[
            { label: 'Doors', value: f.doors },
            { label: 'Open work orders', value: f.openWorkOrders },
            { label: 'Requests, last 30 days', value: f.requests30d },
            { label: 'Phone', value: f.phone ?? '—' },
            { label: 'Time zone', value: f.timezone },
            { label: 'Text messages', value: f.smsRegistrationStatus === 'approved' ? 'Enabled' : 'Not enabled' },
          ]}
        />
      </Box>
      <Box title="Users" meta={`${f.users.length}`} flush className="has-menus">
        <table className="tbl">
          <thead>
            <tr>
              <th>User</th>
              <th className="hide-sm">Status</th>
              <th className="hide-sm">Last seen</th>
              <th className="r">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {f.users.map((u) => {
              const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
              const acts = userActions(u);
              // The one safe fix for a stuck user gets a button; everything else lives in the menu.
              const fix = acts.find((a) => a.submit === 'Unlock' || a.submit === 'Re-send link');
              const dim = u.active ? undefined : 'dim';
              const pills = (
                <span className="hstack" style={{ flexWrap: 'wrap', gap: 4 }}>
                  {!u.active && <span className="pill">Deactivated</span>}
                  {u.invitePending ? <span className="pill">Invite pending</span> : !u.emailVerifiedAt && <span className="pill warn">Email unconfirmed</span>}
                  {locked && u.lockedUntil && <span className="pill bad" title={`Locked after ${u.failedLogins} failed sign-ins`}>Locked until {time(u.lockedUntil)}</span>}
                  {u.active && !u.invitePending && u.emailVerifiedAt && !locked && <span className="pill ok">OK</span>}
                </span>
              );
              return (
                <tr key={u.id}>
                  <td className={dim}>
                    <span className="strong">{u.name}</span> <span className="small muted">{u.role === 'admin' ? 'Admin' : 'Manager'}</span>
                    <div className="row-sub">{u.email}</div>
                    <div className="show-sm" style={{ marginTop: 6 }}>{pills}</div>
                  </td>
                  <td className={`hide-sm ${dim ?? ''}`}>{pills}</td>
                  <td className={`hide-sm small ${dim ?? ''}`}>
                    {u.lastSeenAt ? relative(u.lastSeenAt) : 'Never'}
                    {u.activeSessions > 0 && <div className="row-sub">{u.activeSessions} active session{u.activeSessions === 1 ? '' : 's'}</div>}
                  </td>
                  <td className="r">
                    <span className="hstack" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap', gap: 6 }}>
                      {fix && (
                        <Button size="sm" className="hide-sm" icon={ICON[fix.submit]} onClick={() => setAction(fix)}>
                          {fix.submit}
                        </Button>
                      )}
                      <UserMenu name={u.name} actions={acts} onPick={setAction} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Box>
      <Box title="Security log" meta={<Link to={`/ops/security?orgId=${f.id}`}>See all</Link>} flush>
        <EventsTable list={events} showFirm={false} empty="Nothing recorded for this firm yet." />
      </Box>
      {action && <ActionDialog a={action} onClose={() => setAction(null)} />}
    </div>
  );
}

const ICON: Record<string, typeof LockOpen> = { Unlock: LockOpen, 'End sessions': LogOut, 'Re-send link': MailPlus, 'Mark confirmed': MailCheck, Deactivate: UserX, Reactivate: UserCheck };

/** Disclosure menu of a user's actions: safe ones first, destructive ones last and in red. */
function UserMenu({ name, actions, onPick }: { name: string; actions: Action[]; onPick: (a: Action) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLElement>('.menu button')?.focus();
    const off = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !wrap.current?.contains(e.target as Node)) {
        setOpen(false);
        if (e instanceof KeyboardEvent) btn.current?.focus();
      }
    };
    const blur = (e: FocusEvent) => !wrap.current?.contains(e.relatedTarget as Node) && setOpen(false);
    const w = wrap.current;
    document.addEventListener('mousedown', off);
    document.addEventListener('keydown', off);
    w?.addEventListener('focusout', blur);
    return () => {
      document.removeEventListener('mousedown', off);
      document.removeEventListener('keydown', off);
      w?.removeEventListener('focusout', blur);
    };
  }, [open]);
  const safe = actions.filter((a) => !a.danger);
  const danger = actions.filter((a) => a.danger);
  const item = (a: Action) => {
    const Icon = ICON[a.submit] ?? KeyRound;
    return (
      <button key={a.submit} type="button" className={a.danger ? 'danger' : undefined} onClick={() => { setOpen(false); onPick(a); }}>
        <Icon size={15} aria-hidden /> {a.submit}
      </button>
    );
  };
  return (
    <div className="menu-wrap" ref={wrap}>
      <button ref={btn} type="button" className="btn sm" aria-expanded={open} aria-label={`Manage ${name}`} onClick={() => setOpen((v) => !v)}>
        <span className="hide-sm">Manage</span>
        <ChevronDown size={15} aria-hidden />
      </button>
      {open && (
        <div className="menu">
          {safe.map(item)}
          {safe.length > 0 && danger.length > 0 && <hr />}
          {danger.map(item)}
        </div>
      )}
    </div>
  );
}

function ActionDialog({ a, onClose }: { a: Action; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState('');
  return (
    <Dialog
      open
      onClose={onClose}
      title={a.title}
      danger={a.danger}
      submitLabel={a.submit}
      submitDisabled={a.reason && reason.trim().length < 3}
      onSubmit={async () => {
        await api(a.path, { method: 'POST', body: a.reason ? { reason: reason.trim() } : {} });
        await qc.invalidateQueries({ queryKey: ['ops'] });
        toast(a.done);
        onClose();
      }}
    >
      <p className="muted">{a.body}</p>
      {a.reason && <TextArea label="Reason" hint="Required. Saved in the security log with your name." required maxLength={500} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}
    </Dialog>
  );
}

