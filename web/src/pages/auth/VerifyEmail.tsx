import { MailCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Notice } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { keys, queryClient, useUser } from '../../lib/queries';
import type { Me } from '../../lib/types';
import { signOut } from '../../lib/session';
import { AuthFrame } from './AuthFrame';

/** Everything else is closed until the address is confirmed (the API answers 403 email_unverified). */
export default function VerifyEmail() {
  const me = useUser();
  const nav = useNavigate();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [notYet, setNotYet] = useState(false);
  // Confirmed in another tab or on the phone: pick it up when the user comes back here.
  useEffect(() => {
    const check = () => document.visibilityState === 'visible' && queryClient.invalidateQueries({ queryKey: ['me'] });
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);

  // Without this the button did nothing visible when the link hadn't been opened yet.
  async function check() {
    setChecking(true);
    setNotYet(false);
    await queryClient.invalidateQueries({ queryKey: keys.me });
    setChecking(false);
    if (!queryClient.getQueryData<Me>(keys.me)?.emailVerified) setNotYet(true);
  }

  async function resend() {
    setBusy(true);
    setError(null);
    setNotYet(false);
    try {
      await api('/auth/verify-email/resend', { method: 'POST' });
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Check your email" sub={<>We sent a link to <strong>{me.email}</strong>. Open it to confirm your address and start using Fixloop.</>}>
      <div className="stack">
        <Notice icon={MailCheck}>The link works for 48 hours. Can’t find it? Check spam, or send a new one.</Notice>
        {notYet && <Notice tone="warn">Not confirmed yet. Open the link in the email, then come back here.</Notice>}
        {sent && <Notice tone="ok">Sent. Only the newest link works.</Notice>}
        {error && <Notice tone="bad">{error}</Notice>}
        <Button variant="primary" size="lg" block loading={checking} onClick={check}>
          I’ve confirmed it
        </Button>
        <div className="spread small">
          <Button variant="ghost" size="sm" loading={busy} onClick={resend}>
            Send a new link
          </Button>
          <Button variant="ghost" size="sm" onClick={() => signOut(nav)}>
            Sign out
          </Button>
        </div>
      </div>
    </AuthFrame>
  );
}
