import { Lock, Plus, Save, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, useParams, useSearchParams } from 'react-router';
import { useToast } from '../../components/overlay';
import { QrLink } from '../../components/QrLink';
import { Box, Button, Check, LoadError, MoneyField, Notice, SelectField, Skeleton, TextField } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { centsToInput, money, parseMoney, PRIORITIES, PRIORITY_LABEL, type Priority } from '../../lib/format';
import { keys, useCategories, useCommand, useOrg, useUser } from '../../lib/queries';
import type { OrgSettings } from '../../lib/types';
import { Account, Team } from './account';

const TABS = [
  { id: 'company', label: 'Company' },
  { id: 'intake', label: 'Request link' },
  { id: 'maintenance', label: 'Rules & SLAs' },
  { id: 'reminders', label: 'Reminders' },
  { id: 'categories', label: 'Categories' },
  { id: 'team', label: 'Team' },
  { id: 'account', label: 'Account & security' },
] as const;

export default function Settings() {
  const { tab: raw } = useParams();
  const tab = TABS.some((t) => t.id === raw) ? (raw as string) : 'company';
  const [params] = useSearchParams();
  const me = useUser();
  const admin = me.role === 'admin';
  const org = useOrg();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="sub">{me.org.name}</p>
        </div>
      </div>
      {params.get('welcome') && (
        <div style={{ marginBottom: 18 }}>
          <Notice tone="ok">
            <b>Welcome to Fixloop.</b> Set your emergency number and timezone here, then add your first property.
          </Notice>
        </div>
      )}
      <nav className="tabs" aria-label="Settings">
        {TABS.map((t) => (
          <NavLink key={t.id} to={`/settings/${t.id}`} className={() => (t.id === tab ? 'active' : '')}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      {!admin && !['account', 'intake'].includes(tab) && (
        <div style={{ marginBottom: 16 }}>
          <Notice icon={Lock}>Only admins can change firm settings. You can view them.</Notice>
        </div>
      )}
      {tab === 'account' ? (
        <Account />
      ) : tab === 'team' ? (
        <Team admin={admin} />
      ) : tab === 'categories' ? (
        <Categories admin={admin} />
      ) : tab === 'intake' ? (
        <Box title="Tenant request link" lift>
          <div className="stack">
            <p className="muted">Share this anywhere: lease packets, emails, the portal footer. Tenants are matched by their email or phone. For a per-building link tenants can use before you’ve added them, open the property page.</p>
            <QrLink url={`${location.origin}/r/${me.org.slug}`} title={`${me.org.name}: report a repair`} />
            <p className="small muted">
              Tenants can also get a list of all their requests at <a href={`/r/${me.org.slug}/mine`}>{`${location.origin}/r/${me.org.slug}/mine`}</a>.
            </p>
          </div>
        </Box>
      ) : org.isError ? (
        <LoadError error={org.error} retry={() => org.refetch()} />
      ) : !org.data ? (
        <Skeleton h={320} />
      ) : tab === 'maintenance' ? (
        <Rules org={org.data} admin={admin} />
      ) : tab === 'reminders' ? (
        <Reminders org={org.data} admin={admin} />
      ) : (
        <Company org={org.data} admin={admin} />
      )}
    </>
  );
}

/** One PATCH /org form; only changed keys are sent. */
function OrgForm({ admin, children, build, title }: { admin: boolean; title: string; children: ReactNode; build: () => Partial<OrgSettings> | string }) {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const save = useCommand((body: unknown) => api<OrgSettings>('/org', { method: 'PATCH', body }), [keys.org, keys.me]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const body = build();
    if (typeof body === 'string') return setError(body);
    try {
      await save.mutateAsync(body);
      toast('Settings saved. They apply to new events from now on.');
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <form onSubmit={submit}>
      <Box title={title} lift>
        <fieldset disabled={!admin} style={{ border: 0, padding: 0, minWidth: 0 }} className="stack">
          {children}
          {error && <Notice tone="bad">{error}</Notice>}
          {admin && (
            <div>
              <Button type="submit" variant="primary" icon={Save} loading={save.isPending}>
                Save changes
              </Button>
            </div>
          )}
        </fieldset>
      </Box>
    </form>
  );
}

const TIMEZONES = Intl.supportedValuesOf('timeZone').filter((z) => z.startsWith('America/') || z.startsWith('Pacific/Honolulu') || z === 'UTC');

function Company({ org, admin }: { org: OrgSettings; admin: boolean }) {
  const [f, setF] = useState({ name: org.name, phone: org.phone ?? '', emergencyPhone: org.emergencyPhone ?? '', address: org.address ?? '', timezone: org.timezone });
  const smsLabel = { none: 'Not registered', pending: 'Registration pending', approved: 'Approved', rejected: 'Rejected' }[org.smsRegistrationStatus];
  return (
    <div className="grid-main">
      <OrgForm admin={admin} title="Company details" build={() => ({ name: f.name.trim(), phone: f.phone.trim() || null, emergencyPhone: f.emergencyPhone.trim() || null, address: f.address.trim() || null, timezone: f.timezone })}>
        <div className="form-grid">
          <TextField className="full" label="Company name" required maxLength={200} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <TextField label="Office phone" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <TextField label="Emergency phone" type="tel" value={f.emergencyPhone} onChange={(e) => setF({ ...f, emergencyPhone: e.target.value })} hint="Shown on every tenant emergency banner unless a property has its own." />
          <TextField className="full" label="Business address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} maxLength={500} />
          <SelectField label="Timezone" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} hint="Used for appointment times in messages.">
            {[...new Set([f.timezone, ...TIMEZONES])].map((z) => (
              <option key={z} value={z}>
                {z.replace('America/', '').replaceAll('_', ' ')}
              </option>
            ))}
          </SelectField>
        </div>
      </OrgForm>
      <Box title="Text messages (SMS)">
        <div className="stack-sm">
          <span className={`pill ${org.smsRegistrationStatus === 'approved' ? 'ok' : org.smsRegistrationStatus === 'rejected' ? 'bad' : 'warn'}`} style={{ alignSelf: 'flex-start' }}>{smsLabel}</span>
          <p className="small muted">Carriers require each firm to register before we text on its behalf. Until then, every link still goes out by email, and nothing waits on SMS.</p>
        </div>
      </Box>
    </div>
  );
}

function Rules({ org, admin }: { org: OrgSettings; admin: boolean }) {
  const DEFAULT: Record<Priority, { assignHours: number; completeHours: number }> = { emergency: { assignHours: 1, completeHours: 24 }, high: { assignHours: 4, completeHours: 72 }, normal: { assignHours: 24, completeHours: 120 }, low: { assignHours: 72, completeHours: 336 } };
  const [sla, setSla] = useState(() => Object.fromEntries(PRIORITIES.map((p) => [p, { ...DEFAULT[p], ...org.slaConfig[p] }])) as typeof DEFAULT);
  const [f, setF] = useState({ threshold: centsToInput(org.defaultApprovalThresholdCents), auto: org.autoApproveUnderThreshold, limit: centsToInput(org.emergencySpendLimitCents), overage: String(org.invoiceOveragePct) });
  const [keywords, setKeywords] = useState(org.emergencyKeywords);
  const [kw, setKw] = useState('');
  const addKw = () => {
    const k = kw.trim().toLowerCase();
    if (k.length >= 2 && !keywords.includes(k) && keywords.length < 50) setKeywords([...keywords, k]);
    setKw('');
  };
  return (
    <OrgForm
      admin={admin}
      title="Approval rules, SLAs and emergencies"
      build={() => {
        const threshold = parseMoney(f.threshold);
        const limit = parseMoney(f.limit);
        const overage = Number(f.overage);
        if (threshold === null || limit === null) return 'Enter money amounts like 500 or 500.00';
        if (!Number.isInteger(overage) || overage < 0 || overage > 100) return 'Invoice tolerance must be a whole number from 0 to 100';
        for (const p of PRIORITIES) if (!(sla[p].assignHours > 0 && sla[p].completeHours > 0)) return `${PRIORITY_LABEL[p]} SLA hours must be above zero`;
        return { defaultApprovalThresholdCents: threshold, autoApproveUnderThreshold: f.auto, emergencySpendLimitCents: limit, invoiceOveragePct: overage, slaConfig: sla, emergencyKeywords: keywords };
      }}
    >
      <div className="form-grid">
        <MoneyField label="Default owner approval threshold" value={f.threshold} onChange={(e) => setF({ ...f, threshold: e.target.value })} hint="Owners can override this individually." />
        <MoneyField label="Emergency spend limit" value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value })} hint="Emergencies skip quotes up to this; the owner gets a notice." />
        <TextField label="Invoice overage tolerance (%)" type="number" min={0} max={100} value={f.overage} onChange={(e) => setF({ ...f, overage: e.target.value })} hint="Above this, closing needs your confirmation." />
        <div style={{ alignSelf: 'center' }}>
          <Check label="Auto-approve quotes under the threshold" hint={`Currently ${money(parseMoney(f.threshold) ?? 0, true)}. You can still review them.`} checked={f.auto} onChange={(e) => setF({ ...f, auto: e.target.checked })} />
        </div>
      </div>
      <div>
        <h3 style={{ marginBottom: 8 }}>Response targets (calendar hours)</h3>
        <table className="tbl box">
          <thead>
            <tr>
              <th>Priority</th>
              <th>Assign within</th>
              <th>Complete within</th>
            </tr>
          </thead>
          <tbody>
            {PRIORITIES.map((p) => (
              <tr key={p}>
                <td className="strong">{PRIORITY_LABEL[p]}</td>
                {(['assignHours', 'completeHours'] as const).map((k) => (
                  <td key={k}>
                    <input className="input" type="number" min={0.5} step={0.5} max={k === 'assignHours' ? 720 : 2160} aria-label={`${PRIORITY_LABEL[p]} ${k === 'assignHours' ? 'assign' : 'complete'} hours`} value={sla[p][k]} onChange={(e) => setSla({ ...sla, [p]: { ...sla[p], [k]: Number(e.target.value) } })} style={{ width: 110 }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="stack-sm">
        <h3>Emergency keywords</h3>
        <p className="small muted">If a tenant’s description contains any of these, they see the 911 / gas-utility banner and your team gets an immediate alert.</p>
        <div className="chips">
          {keywords.map((k) => (
            <span key={k} className="chip" style={{ cursor: 'default' }}>
              {k}
              {admin && (
                <button type="button" aria-label={`Remove ${k}`} onClick={() => setKeywords(keywords.filter((x) => x !== k))}>
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
        {admin && (
          <div className="hstack">
            <input className="input" style={{ maxWidth: 240 }} value={kw} maxLength={40} onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addKw();
              }
            }} placeholder="Add a keyword" aria-label="New keyword" />
            <Button size="sm" icon={Plus} onClick={addKw} disabled={kw.trim().length < 2}>
              Add
            </Button>
          </div>
        )}
      </div>
    </OrgForm>
  );
}

const REMINDERS: { key: string; label: string; def: number; hint: string }[] = [
  { key: 'wo.acceptance_nudge', label: 'Nudge vendor to accept', def: 4, hint: 'Hours after assignment' },
  { key: 'wo.acceptance_escalate', label: 'Alert you if still not accepted', def: 24, hint: 'Hours after assignment' },
  { key: 'wo.acceptance_nudge.emergency', label: 'Emergency: nudge vendor', def: 0.5, hint: 'Hours after assignment' },
  { key: 'wo.acceptance_escalate.emergency', label: 'Emergency: alert you', def: 1, hint: 'Hours after assignment' },
  { key: 'wo.quote_nudge', label: 'Nudge vendor for the quote', def: 48, hint: 'Hours after acceptance' },
  { key: 'wo.approval_resend', label: 'Re-send approval to owner', def: 24, hint: 'Hours after sending' },
  { key: 'wo.approval_escalate', label: 'Alert you about a pending owner approval', def: 48, hint: 'Hours after sending' },
  { key: 'wo.appointment_tomorrow', label: 'Appointment reminder', def: 24, hint: 'Hours before the visit' },
  { key: 'wo.review_nudge', label: 'Remind you to review completed work', def: 24, hint: 'Hours after completion' },
  { key: 'wo.overdue_repeat', label: 'Repeat overdue alerts every', def: 24, hint: 'Hours' },
  { key: 'request.needs_info_nudge', label: 'Nudge tenant to answer your question', def: 48, hint: 'Hours after asking' },
];

function Reminders({ org, admin }: { org: OrgSettings; admin: boolean }) {
  const [v, setV] = useState(() => Object.fromEntries(REMINDERS.map((r) => [r.key, String(org.reminderConfig[r.key] ?? r.def)])));
  return (
    <OrgForm
      admin={admin}
      title="Automatic reminders"
      build={() => {
        const out: Record<string, number> = {};
        for (const r of REMINDERS) {
          const n = Number(v[r.key]);
          if (!(n > 0 && n <= 720)) return `“${r.label}” must be between 0 and 720 hours`;
          out[r.key] = n;
        }
        return { reminderConfig: out };
      }}
    >
      <p className="muted">Every reminder is logged on the job’s timeline and skipped if the job has already moved on. Vendor document reminders go out 30, 7 and 0 days before expiry.</p>
      <div className="form-grid">
        {REMINDERS.map((r) => (
          <TextField key={r.key} label={r.label} type="number" min={0.5} step={0.5} max={720} value={v[r.key]} onChange={(e) => setV({ ...v, [r.key]: e.target.value })} hint={`${r.hint} · default ${r.def}`} />
        ))}
      </div>
    </OrgForm>
  );
}

function Categories({ admin }: { admin: boolean }) {
  const cats = useCategories();
  const toast = useToast();
  const [name, setName] = useState('');
  const save = useCommand((v: { id?: string; body: Record<string, unknown> }) => api(v.id ? `/org/categories/${v.id}` : '/org/categories', { method: v.id ? 'PATCH' : 'POST', body: v.body }), [keys.categories]);
  const run = (v: { id?: string; body: Record<string, unknown> }, ok: string) => save.mutateAsync(v).then(() => toast(ok), (e) => toast(errorMessage(e), 'bad'));
  if (cats.isError) return <LoadError error={cats.error} retry={() => cats.refetch()} />;
  return (
    <Box title="Maintenance categories" lift flush>
      <table className="tbl">
        <thead>
          <tr>
            <th>Category</th>
            <th>Photo required from tenant</th>
            <th className="r">Active</th>
          </tr>
        </thead>
        <tbody>
          {cats.data?.map((c) => (
            <tr key={c.id} style={{ opacity: c.active ? 1 : 0.55 }}>
              <td>
                {admin ? (
                  <input className="input" defaultValue={c.name} aria-label="Category name" maxLength={200} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.name && run({ id: c.id, body: { name: e.target.value.trim() } }, 'Renamed. History keeps the old name.')} style={{ maxWidth: 260 }} />
                ) : (
                  c.name
                )}
                {c.selfHelpKey && <span className="small muted"> · has self-help checks</span>}
              </td>
              <td>
                <input type="checkbox" aria-label={`Photo required for ${c.name}`} checked={c.photoRequired} disabled={!admin} onChange={(e) => run({ id: c.id, body: { photoRequired: e.target.checked } }, 'Saved')} style={{ accentColor: 'var(--ballpoint)', width: 17, height: 17 }} />
              </td>
              <td className="r">
                <input type="checkbox" aria-label={`${c.name} active`} checked={c.active} disabled={!admin} onChange={(e) => run({ id: c.id, body: { active: e.target.checked } }, e.target.checked ? 'Category activated' : 'Category deactivated')} style={{ accentColor: 'var(--ballpoint)', width: 17, height: 17 }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {admin && (
        <form className="hstack box-body" style={{ borderTop: '1px solid var(--hair)' }} onSubmit={(e) => { e.preventDefault(); name.trim() && run({ body: { name: name.trim(), sortOrder: cats.data?.length ?? 0 } }, 'Category added').then(() => setName('')); }}>
          <input className="input" style={{ maxWidth: 280 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" aria-label="New category" maxLength={200} />
          <Button type="submit" size="sm" icon={Plus} disabled={!name.trim()}>
            Add category
          </Button>
        </form>
      )}
    </Box>
  );
}
