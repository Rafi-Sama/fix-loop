import { MailCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button, Empty, Notice, TextField } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { AuthFrame } from './AuthFrame';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/password-reset', { method: 'POST', body: { email } });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Reset your password" sub="We’ll email you a link that works for one hour.">
      {sent ? (
        <div className="box">
          <Empty icon={MailCheck} title="Check your inbox" action={<Link to="/login">Back to sign in</Link>}>
            If {email} has an account, a reset link is on its way. Resetting signs you out on every device.
          </Empty>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <TextField label="Work email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          {error && <Notice tone="bad">{error}</Notice>}
          <Button type="submit" variant="primary" size="lg" block loading={busy}>
            Email me a link
          </Button>
          <Link to="/login" className="small">
            Back to sign in
          </Link>
        </form>
      )}
    </AuthFrame>
  );
}
