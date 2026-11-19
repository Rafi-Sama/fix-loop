import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Notice, TextField } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { queryClient } from '../../lib/queries';
import { AuthFrame } from './AuthFrame';

export default function Signup() {
  const nav = useNavigate();
  const [f, setF] = useState({ orgName: '', name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/signup', { method: 'POST', body: f });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      nav('/settings?welcome=1', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Set up your firm" sub="Live in an afternoon. Vendors, tenants and owners never need an account.">
      <form className="stack" onSubmit={submit}>
        <TextField label="Firm name" required value={f.orgName} onChange={set('orgName')} autoComplete="organization" autoFocus maxLength={200} />
        <TextField label="Your name" required value={f.name} onChange={set('name')} autoComplete="name" maxLength={200} />
        <TextField label="Work email" type="email" required value={f.email} onChange={set('email')} autoComplete="email" />
        <PasswordField value={f.password} onChange={(v) => setF({ ...f, password: v })} />
        {error && <Notice tone="bad">{error}</Notice>}
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          Create firm
        </Button>
        <p className="small muted">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </AuthFrame>
  );
}

/** Password with the backend's rules (10+ chars, breach-checked server side) and a live length meter. */
export function PasswordField({ value, onChange, label = 'Password' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const pct = Math.min(100, (value.length / 10) * 100);
  return (
    <div className="stack-sm">
      <TextField label={label} type="password" required minLength={10} maxLength={128} autoComplete="new-password" value={value} onChange={(e) => onChange(e.target.value)} hint="At least 10 characters. We check it against known breached passwords." />
      <div className="meter" aria-hidden>
        <i style={{ width: `${pct}%` }} className={value.length >= 10 ? '' : 'warn'} />
      </div>
    </div>
  );
}
