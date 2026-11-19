import { LogOut, Monitor, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Dialog, useToast } from '../../components/overlay';
import { Box, Button, Empty, LoadError, Notice, SelectField, Skeleton, TextField } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { relative } from '../../lib/format';
import { signOut } from '../../lib/session';
import { keys, useCommand, useSessions, useTeam, useUser } from '../../lib/queries';
import type { TeamUser } from '../../lib/types';
import { PasswordField } from '../auth/Signup';

export function Team({ admin }: { admin: boolean }) {
  const me = useUser();
  const team = useTeam();
  const toast = useToast();
  const [inviting, setInviting] = useState(false);
  const update = useCommand((v: { id: string; body: Record<string, unknown> }) => api<TeamUser>(`/org/users/${v.id}`, { method: 'PATCH', body: v.body }), [keys.team]);
  const run = (id: string, body: Record<string, unknown>, ok: string) => update.mutateAsync({ id, body }).then(() => toast(ok), (e) => toast(errorMessage(e), 'bad'));
  if (team.isError) return <LoadError error={team.error} retry={() => team.refetch()} />;
  return (
    <>
      <Box title="Team" lift flush actions={admin && <Button size="sm" variant="primary" icon={UserPlus} onClick={() => setInviting(true)}>Invite</Button>}>
        {!team.data ? (
          <Skeleton h={120} />
        ) : team.data.length === 0 ? (
          <Empty icon={UserPlus} title="Just you so far" />
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th className="r">Status</th>
              </tr>
            </thead>
            <tbody>
              {team.data.map((u) => (
                <tr key={u.id} style={{ opacity: u.active ? 1 : 0.55 }}>
                  <td>
                    <div className="strong">
                      {u.name}
                      {u.id === me.id && <span className="muted"> (you)</span>}
                    </div>
                    <div className="row-sub">{u.email}</div>
                  </td>
                  <td>
                    {admin && u.id !== me.id ? (
                      <select className="select" aria-label={`Role for ${u.name}`} value={u.role} onChange={(e) => run(u.id, { role: e.target.value }, 'Role updated')} style={{ width: 140, minHeight: 32 }}>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <span>{u.role === 'admin' ? 'Admin' : 'Manager'}</span>
                    )}
                  </td>
                  <td className="r">
                    <span className="hstack" style={{ justifyContent: 'flex-end' }}>
                      {u.invited && u.active && <span className="pill warn">Invite pending</span>}
                      {!u.active && <span className="pill">Deactivated</span>}
                      {admin && u.id !== me.id && (
                        <Button size="sm" variant={u.active ? 'ghost' : undefined} onClick={() => run(u.id, { active: !u.active }, u.active ? `${u.name} deactivated and signed out` : `${u.name} reactivated`)}>
                          {u.active ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Box>
      <p className="small muted" style={{ marginTop: 10 }}>
        Admins manage settings and the team. Managers do everything else. Vendors, tenants and owners never need seats.
      </p>
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
    </>
  );
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', email: '', role: 'manager' });
  const invite = useCommand((body: unknown) => api('/org/users', { method: 'POST', body }), [keys.team]);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Invite a teammate"
      submitLabel="Send invite"
      onSubmit={async () => {
        await invite.mutateAsync(f);
        toast(`Invite sent to ${f.email}. The link works for 72 hours.`);
        onClose();
      }}
    >
      <TextField label="Name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={200} autoFocus />
      <TextField label="Email" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <SelectField label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
        <option value="manager">Manager</option>
        <option value="admin">Admin (settings and team)</option>
      </SelectField>
    </Dialog>
  );
}

const device = (ua: string | null) => {
  if (!ua) return 'Unknown device';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${br} on ${os}`;
};

export function Account() {
  const me = useUser();
  const toast = useToast();
  const nav = useNavigate();
  const sessions = useSessions();
  const [pw, setPw] = useState({ current: '', next: '' });
  const [error, setError] = useState<string | null>(null);
  const change = useCommand((body: unknown) => api('/auth/password', { method: 'POST', body }), [keys.sessions]);
  const others = useCommand(() => api('/auth/logout-others', { method: 'POST' }), [keys.sessions]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await change.mutateAsync(pw);
      setPw({ current: '', next: '' });
      toast('Password changed. Other devices were signed out.');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <form onSubmit={submit}>
        <Box title="Change password" lift>
          <div className="stack">
            <p className="small muted">
              Signed in as <b>{me.email}</b>
            </p>
            <TextField label="Current password" type="password" required autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            <PasswordField label="New password" value={pw.next} onChange={(next) => setPw({ ...pw, next })} />
            {error && <Notice tone="bad">{error}</Notice>}
            <div>
              <Button type="submit" variant="primary" loading={change.isPending} disabled={!pw.current || pw.next.length < 10}>
                Update password
              </Button>
            </div>
          </div>
        </Box>
      </form>
      <Box
        title="Where you’re signed in"
        flush
        actions={
          <Button size="sm" icon={LogOut} loading={others.isPending} disabled={(sessions.data?.length ?? 0) < 2} onClick={() => others.mutateAsync(undefined).then(() => toast('Signed out everywhere else'), (e) => toast(errorMessage(e), 'bad'))}>
            Sign out others
          </Button>
        }
      >
        {!sessions.data ? (
          <Skeleton h={100} />
        ) : (
          <ul className="rows">
            {sessions.data.map((s) => (
              <li key={s.id} className="row" style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto' }}>
                <Monitor size={18} color="var(--ink-3)" />
                <div className="min0">
                  <div className="strong">{device(s.userAgent)}</div>
                  <div className="row-sub">
                    {s.ip ?? 'Unknown IP'} · active {relative(s.lastSeenAt)}
                  </div>
                </div>
                {s.current && <span className="pill ok">This device</span>}
              </li>
            ))}
          </ul>
        )}
        <div className="box-body" style={{ borderTop: '1px solid var(--hair)' }}>
          <Button
            variant="danger"
            icon={LogOut}
            onClick={() => signOut(nav)}
          >
            Sign out of this device
          </Button>
        </div>
      </Box>
    </div>
  );
}
