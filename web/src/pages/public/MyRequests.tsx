import { useQuery } from '@tanstack/react-query';
import { CircleOff, MailCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { Button, Notice, TextField } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { LinkLayout, LinkMessage } from './LinkLayout';

export default function MyRequests() {
  const { slug = '' } = useParams();
  const org = useQuery({ queryKey: ['public-org', slug], queryFn: () => api<{ name: string; emergencyPhone: string | null }>(`/public/orgs/${slug}`), retry: false, staleTime: Infinity });
  const [v, setV] = useState({ email: '', phone: '' });
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/public/orgs/${slug}/my-requests`, { method: 'POST', body: { ...(v.email.trim() ? { email: v.email.trim() } : {}), ...(v.phone.trim() ? { phone: v.phone.trim() } : {}) } });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (org.isError) return <LinkLayout emergency><LinkMessage icon={CircleOff} title="This link isn’t valid" /></LinkLayout>;
  return (
    <LinkLayout org={org.data?.name} emergencyPhone={org.data?.emergencyPhone} emergency>
      {sent ? (
        <LinkMessage icon={MailCheck} title="Check your messages">
          If we have you on file, we’ve sent a link to all your requests. It works for 24 hours.
        </LinkMessage>
      ) : (
        <form className="box lift box-body stack" onSubmit={submit}>
          <h1>Your requests</h1>
          <p className="muted">Enter the email or phone your property manager has on file. We’ll send you a private link.</p>
          <TextField label="Email" type="email" autoComplete="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
          <TextField label="Or mobile phone" type="tel" autoComplete="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
          {error && <Notice tone="bad">{error}</Notice>}
          <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!v.email.trim() && !v.phone.trim()}>
            Send me the link
          </Button>
          <Link to={`/r/${slug}`} className="small" style={{ textAlign: 'center' }}>
            Report a new issue instead
          </Link>
        </form>
      )}
    </LinkLayout>
  );
}
