import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button, Notice, TextField } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { queryClient, sessionLost } from '../../lib/queries';
import { AuthFrame } from './AuthFrame';

/** Only same-app paths, so ?next= can't bounce the user to another site. */
export const safeNext = (next: string | null) => (next?.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/');

export default function Login() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ended] = useState(() => {
    const v = sessionLost.flag;
    sessionLost.flag = false;
    return v;
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/login', { method: 'POST', body: { email, password } });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      nav(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Sign in" sub="Pick up the queue where you left it.">
      <form className="stack" onSubmit={submit}>
        {params.get('reset') && <Notice tone="ok">Password updated. Sign in with your new password.</Notice>}
        {ended && !error && <Notice tone="warn">Your session ended. Sign in again to continue.</Notice>}
        <TextField label="Work email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        <TextField label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <Notice tone="bad">{error}</Notice>}
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          Sign in
        </Button>
        <div className="spread small">
          <Link to="/forgot">Forgot password?</Link>
          <span className="muted">
            New firm? <Link to="/signup">Start free</Link>
          </span>
        </div>
      </form>
    </AuthFrame>
  );
}
