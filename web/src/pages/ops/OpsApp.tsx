/** Fixloop superadmin console: its own sign-in (password + authenticator code), session and routes. */
import { useQueryClient } from '@tanstack/react-query';
import { Building2, LogOut, ShieldAlert, ShieldCheck, UserCog } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router';
import { Button, Notice, TextField } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { AuthFrame } from '../auth/AuthFrame';
import { FirmView, Overview } from './OpsFirms';
import { Admins, SecurityLog } from './OpsSecurity';
import { opsKeys, useOpsMe } from './ops';

export default function OpsApp() {
  return (
    <Routes>
      <Route path="login" element={<OpsLogin />} />
      <Route path="*" element={<OpsAuthed />} />
    </Routes>
  );
}

function OpsAuthed() {
  const me = useOpsMe();
  if (me.isPending) return <div className="page" aria-busy="true" />;
  if (!me.data) return <Navigate to="/ops/login" replace />;
  return (
    <OpsShell name={me.data.name}>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="firms/:id" element={<FirmView />} />
        <Route path="security" element={<SecurityLog />} />
        <Route path="admins" element={<Admins />} />
        <Route path="*" element={<Navigate to="/ops" replace />} />
      </Routes>
    </OpsShell>
  );
}

function OpsShell({ name, children }: { name: string; children: React.ReactNode }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  async function signOut() {
    await api('/platform/logout', { method: 'POST' }).catch(() => undefined);
    qc.removeQueries({ queryKey: ['ops'] });
    nav('/ops/login', { replace: true });
  }
  const links = [
    { to: '/ops', label: 'Firms', icon: Building2, end: true },
    { to: '/ops/security', label: 'Security log', icon: ShieldAlert },
    { to: '/ops/admins', label: 'Superadmins', icon: UserCog },
  ];
  return (
    <>
      <a href="#main" className="sr-only">
        Skip to content
      </a>
      <header className="topbar ops-bar">
        <Link to="/ops" className="brand" aria-label="Fixloop superadmin home">
          <span className="brand-mark" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          FIXLOOP <span className="ops-tag">OPS</span>
        </Link>
        <nav className="nav ops-nav" aria-label="Superadmin">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              <Icon size={15} aria-hidden />
              <span className="ops-label">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="topbar-end">
          <span className="small hide-sm" style={{ color: '#c9c4b6' }}>{name}</span>
          <button type="button" className="icon-btn" onClick={signOut} aria-label="Sign out of the superadmin console" title="Sign out">
            <LogOut size={17} />
          </button>
        </div>
      </header>
      <main id="main" className="page ops">
        {children}
      </main>
    </>
  );
}

function OpsLogin() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const me = useOpsMe();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (me.data) return <Navigate to="/ops" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/platform/login', { method: 'POST', body: { email, password, code } });
      await qc.invalidateQueries({ queryKey: opsKeys.me });
      nav('/ops', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setCode('');
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Fixloop superadmin" sub="Staff only. Every sign-in and action is recorded in the security log.">
      <form className="stack" onSubmit={submit}>
        <TextField label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        <TextField label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <TextField
          label="Authenticator code"
          hint="The 6-digit code from your authenticator app."
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
        {error && <Notice tone="bad">{error}</Notice>}
        <Button type="submit" variant="primary" size="lg" block loading={busy} icon={ShieldCheck} disabled={code.length !== 6}>
          Sign in
        </Button>
      </form>
    </AuthFrame>
  );
}
