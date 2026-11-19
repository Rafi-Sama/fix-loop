/** One route for every no-login link: the server says what the token is for, and we render that one screen. */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleOff, Clock, KeyRound, MailCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button, Notice, TextField } from '../../components/ui';
import { api, ApiError, errorMessage } from '../../lib/api';
import { PasswordField } from '../auth/Signup';
import { LinkLayout, LinkMessage } from '../public/LinkLayout';
import type { LinkData } from './kit';
import { VendorJobView, VendorProfileView } from './vendor';
import { ApprovalView, MyRequestsView, TrackView } from './views';

export default function LinkPage() {
  const { token = '' } = useParams();
  const q = useQuery({ queryKey: ['link', token], queryFn: () => api<LinkData>(`/links/${token}`), retry: false, refetchOnWindowFocus: true });

  if (q.isPending) return <LinkLayout><div className="skel" style={{ height: 320 }} aria-busy="true" /></LinkLayout>;
  if (q.isError) {
    const e = q.error;
    if (e instanceof ApiError && e.status === 410)
      return (
        <LinkLayout>
          <LinkMessage icon={Clock} title="This link has expired">
            {e.message === 'This job is no longer assigned to you' ? 'This job is no longer assigned to you. Contact the property manager if that’s a surprise.' : 'Ask the property manager to send you a new one.'}
          </LinkMessage>
        </LinkLayout>
      );
    if (e instanceof ApiError && e.status === 404)
      return (
        <LinkLayout>
          <LinkMessage icon={CircleOff} title="This link isn’t valid">
            Check that you opened the whole link from your message, or ask the property manager for a new one.
          </LinkMessage>
        </LinkLayout>
      );
    return (
      <LinkLayout>
        <LinkMessage icon={CircleOff} title="Couldn’t open this link">
          <p>{errorMessage(e)}</p>
          <Button onClick={() => q.refetch()} loading={q.isFetching} style={{ marginTop: 12 }}>Try again</Button>
        </LinkMessage>
      </LinkLayout>
    );
  }

  const d = q.data;
  if (d.purpose === 'email_verify') return <ConfirmEmail token={token} org={d.org.name} />;
  if (d.purpose === 'user_invite' || d.purpose === 'password_reset') return <SetPassword token={token} invite={d.purpose === 'user_invite'} org={d.org.name} />;
  const refresh = () => q.refetch();
  return (
    <LinkLayout org={d.org.name} emergencyPhone={d.org.emergencyPhone} emergency={['request_track', 'needs_info', 'confirm_fix', 'my_requests'].includes(d.purpose)}>
      {d.purpose === 'job' && <VendorJobView token={token} d={d} refresh={refresh} />}
      {d.purpose === 'approval' && <ApprovalView token={token} d={d} refresh={refresh} />}
      {(d.purpose === 'request_track' || d.purpose === 'needs_info' || d.purpose === 'confirm_fix') && <TrackView token={token} d={d} refresh={refresh} />}
      {d.purpose === 'my_requests' && <MyRequestsView d={d} />}
      {d.purpose === 'vendor_profile' && <VendorProfileView token={token} d={d} refresh={refresh} />}
    </LinkLayout>
  );
}

function SetPassword({ token, invite, org }: { token: string; invite: boolean; org: string }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/password-reset/complete', { method: 'POST', body: { token, password: pw } });
      await qc.invalidateQueries({ queryKey: ['me'] });
      nav('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError && (err.status === 404 || err.status === 410) ? 'This link is invalid or has expired. Ask for a new invite, or request another password reset.' : errorMessage(err));
      setBusy(false);
    }
  }
  return (
    <LinkLayout org={org}>
      <form className="box lift box-body stack" onSubmit={submit}>
        <div className="hstack">
          <KeyRound size={20} color="var(--ballpoint)" />
          <h1>Set your password</h1>
        </div>
        <p className="muted">{invite ? `You’ve been invited to ${org}. Choose a password to finish setting up your account.` : `Choose a new password for your ${org} account.`} You’ll be signed in right after.</p>
        <PasswordField value={pw} onChange={setPw} />
        <TextField label="Confirm password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={confirm && confirm !== pw ? 'Passwords don’t match' : null} />
        {error && <Notice tone="bad">{error}</Notice>}
        <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={pw.length < 10 || confirm !== pw}>
          Save password
        </Button>
      </form>
    </LinkLayout>
  );
}

/** A button, not an automatic confirm: mail scanners open links, and a GET must never verify. */
function ConfirmEmail({ token, org }: { token: string; org: string }) {
  const qc = useQueryClient();
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'gone'>('idle');
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setState('busy');
    setError(null);
    try {
      await api('/auth/verify-email', { method: 'POST', body: { token } });
      await qc.invalidateQueries({ queryKey: ['me'] });
      setState('done');
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 410)) return setState('gone');
      setError(errorMessage(err));
      setState('idle');
    }
  }
  return (
    <LinkLayout org={org}>
      {state === 'done' ? (
        <LinkMessage ok icon={MailCheck} title="Email confirmed">
          <p>You’re all set.</p>
          <a className="btn primary lg block" href="/" style={{ marginTop: 16 }}>
            Open Fixloop
          </a>
        </LinkMessage>
      ) : state === 'gone' ? (
        <LinkMessage icon={Clock} title="This link was already used or has expired">
          <p>If you already confirmed, just sign in. Otherwise sign in and send yourself a new link.</p>
          <a className="btn primary lg block" href="/login" style={{ marginTop: 16 }}>
            Sign in
          </a>
        </LinkMessage>
      ) : (
        <div className="box lift box-body stack">
          <div className="hstack">
            <MailCheck size={20} color="var(--ballpoint)" />
            <h1>Confirm your email</h1>
          </div>
          <p className="muted">One tap to confirm this address belongs to you. Then you can start using Fixloop.</p>
          {error && <Notice tone="bad">{error}</Notice>}
          <Button variant="primary" size="lg" block loading={state === 'busy'} onClick={confirm}>
            Confirm my email
          </Button>
        </div>
      )}
    </LinkLayout>
  );
}
