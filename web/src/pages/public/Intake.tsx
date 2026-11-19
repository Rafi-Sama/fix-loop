import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleOff, Hammer, Lightbulb, ListChecks, PartyPopper, Send } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { Uploader } from '../../components/files';
import { Button, Check, Notice, SelectField, TextArea, TextField } from '../../components/ui';
import { api, ApiError, errorMessage } from '../../lib/api';
import { PERMISSION_LABEL, phone, type Priority } from '../../lib/format';
import { ACCEPT_IMAGES, type Presigned } from '../../lib/upload';
import { emergencyHits } from '../../lib/emergency';
import { LinkLayout, LinkMessage } from './LinkLayout';
import { SELF_HELP } from './selfHelp';

interface PublicOrg {
  name: string;
  emergencyPhone: string | null;
  emergencyKeywords: string[];
  smsEnabled: boolean;
  disclaimer: string;
  categories: { id: string; name: string; photoRequired: boolean; selfHelpKey: string | null }[];
}
interface PublicProperty {
  addressLine: string;
  city: string;
  emergencyPhone: string | null;
  units: { id: string; label: string }[];
}

/** crypto.randomUUID only exists in secure contexts (https/localhost); fall back for plain-http LAN testing. */
const uuid = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0]! & (15 >> (Number(c) / 4)))).toString(16));

const URGENCY: { value: Priority; label: string; hint: string }[] = [
  { value: 'emergency', label: 'Emergency', hint: 'Flooding, gas smell, sparks, no heat in freezing weather' },
  { value: 'high', label: 'Urgent', hint: 'Needs attention in a day or two' },
  { value: 'normal', label: 'Normal', hint: 'Within the next few days' },
  { value: 'low', label: 'Not urgent', hint: 'Whenever it’s convenient' },
];
const QUICK_TIMES = ['Weekday mornings', 'Weekday afternoons', 'Evenings', 'Weekends', 'Anytime'];

type Step = 'contact' | 'category' | 'selfhelp' | 'details' | 'done' | 'fixed';

export default function Intake() {
  const { slug = '', propertyId } = useParams();
  const org = useQuery({ queryKey: ['public-org', slug], queryFn: () => api<PublicOrg>(`/public/orgs/${slug}`), retry: false, staleTime: Infinity });
  const prop = useQuery({ queryKey: ['public-prop', slug, propertyId], queryFn: () => api<PublicProperty>(`/public/orgs/${slug}/properties/${propertyId}`), enabled: Boolean(propertyId), retry: false, staleTime: Infinity });
  const draftId = useMemo(uuid, []);
  const [step, setStep] = useState<Step>('contact');
  const [c, setC] = useState({ name: '', email: '', phone: '', unitId: '', smsConsent: false });
  const [catId, setCatId] = useState('');
  const [d, setD] = useState({ title: '', description: '', urgency: 'normal' as Priority, availabilityText: '', permissionToEnter: '', accessNotes: '', pets: '' });
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ref: string; trackUrl: string; isEmergency: boolean } | null>(null);

  // The 911 guidance is static, so it shows even when the link is dead or still loading.
  if (org.isError) return <LinkLayout emergency><LinkMessage icon={CircleOff} title="This request link isn’t valid">Check the link with your property manager.</LinkMessage></LinkLayout>;
  if (propertyId && prop.isError) return <LinkLayout org={org.data?.name} emergencyPhone={org.data?.emergencyPhone} emergency><LinkMessage icon={CircleOff} title="This building’s link isn’t active">Use your property manager’s main request link instead.</LinkMessage></LinkLayout>;
  if (!org.data || (propertyId && !prop.data)) return <LinkLayout emergency><div className="skel" style={{ height: 300 }} /></LinkLayout>;

  const o = org.data;
  const emergencyPhone = prop.data?.emergencyPhone ?? o.emergencyPhone;
  const cat = o.categories.find((x) => x.id === catId);
  const hits = emergencyHits(`${d.title} ${d.description}`, o.emergencyKeywords);
  const isEmergency = d.urgency === 'emergency' || hits.length > 0;
  const needPhoto = Boolean(cat?.photoRequired) && !isEmergency;
  const steps: Step[] = ['contact', 'category', 'details'];
  const stepIndex = step === 'selfhelp' ? 1 : steps.indexOf(step);

  const chooseCategory = (id: string) => {
    setCatId(id);
    const key = o.categories.find((x) => x.id === id)?.selfHelpKey;
    setStep(key && SELF_HELP[key] ? 'selfhelp' : 'details');
  };

  async function fixedIt() {
    // Counted for the "resolved without a visit" number; failure here must not block the tenant.
    await api(`/public/orgs/${slug}/deflections`, { method: 'POST', body: { categoryId: catId, selfHelpKey: cat?.selfHelpKey } }).catch(() => undefined);
    setStep('fixed');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (isEmergency && !ack) return setError('Please read the emergency instructions above and tick “I understand”.');
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ ref: string; trackUrl: string; isEmergency: boolean }>(`/public/orgs/${slug}/requests`, {
        method: 'POST',
        body: {
          draftId,
          contact: { name: c.name.trim(), email: c.email.trim() || null, phone: c.phone.trim() || null },
          ...(propertyId ? { propertyId, unitId: c.unitId } : {}),
          smsConsent: c.smsConsent,
          categoryId: catId,
          title: d.title.trim(),
          description: d.description.trim(),
          urgency: d.urgency,
          availabilityText: d.availabilityText.trim() || null,
          permissionToEnter: d.permissionToEnter,
          accessNotes: d.accessNotes.trim() || null,
          pets: d.pets.trim() || null,
          photoIds: photos,
          emergencyAck: isEmergency && ack,
        },
      });
      setResult(r);
      setStep('done');
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (err instanceof ApiError && err.detailCode === 'tenant_not_matched') setError('We couldn’t find your tenancy from that email or phone. Check them, or ask your manager for your building’s request link.');
      else if (err instanceof ApiError && err.detailCode === 'emergency_ack_required') setError('This sounds like an emergency. Read the instructions above and tick “I understand”.');
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <LinkLayout org={o.name} emergencyPhone={emergencyPhone} emergency>
      {step === 'done' && result ? (
        <div className="stack">
          <LinkMessage ok icon={CheckCircle2} title="Request received">
            <p>
              Your reference is <span className="tag" style={{ fontSize: 15 }}>{result.ref}</span>
            </p>
            <p className="muted" style={{ marginTop: 8 }}>
              {o.name} has been notified{result.isEmergency ? ' as an emergency' : ''}. Save the tracking link to check progress and add photos.
            </p>
          </LinkMessage>
          <a className="btn primary lg block" href={result.trackUrl}>
            Track this request
          </a>
          <p className="small muted">{o.disclaimer}</p>
        </div>
      ) : step === 'fixed' ? (
        <LinkMessage icon={PartyPopper} title="Glad that worked">
          No request was sent. If it stops working again, come back to this link anytime.
        </LinkMessage>
      ) : (
        <>
          <div className="stack-sm">
            <h1>Report a maintenance issue</h1>
            {prop.data && <p className="muted">{prop.data.addressLine}, {prop.data.city}</p>}
            <div className="steps" role="img" aria-label={`Step ${stepIndex + 1} of 3`}>
              {steps.map((s, i) => (
                <i key={s} className={i <= stepIndex ? 'on' : ''} />
              ))}
            </div>
          </div>

          {step === 'contact' && (
            <form className="box lift box-body stack" onSubmit={(e) => { e.preventDefault(); setStep('category'); }}>
              <TextField label="Your name" required autoComplete="name" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} maxLength={200} />
              <TextField label="Email" type="email" autoComplete="email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} hint="Use the email or phone your manager has on file." />
              <TextField label="Mobile phone" type="tel" autoComplete="tel" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} />
              {o.smsEnabled && c.phone.trim() && <Check label="Text me updates about this request" hint="Message rates may apply. Reply STOP to opt out." checked={c.smsConsent} onChange={(e) => setC({ ...c, smsConsent: e.target.checked })} />}
              {prop.data && (
                <SelectField label="Your unit" required value={c.unitId} onChange={(e) => setC({ ...c, unitId: e.target.value })}>
                  <option value="">Choose your unit</option>
                  {prop.data.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label === 'Main' ? 'The whole home' : u.label}
                    </option>
                  ))}
                </SelectField>
              )}
              <Button type="submit" variant="primary" size="lg" block disabled={!c.name.trim() || (!c.email.trim() && !c.phone.trim()) || (Boolean(prop.data) && !c.unitId)}>
                Continue
              </Button>
              <Link to={`/r/${slug}/mine`} className="small" style={{ textAlign: 'center' }}>
                See requests I’ve already sent
              </Link>
            </form>
          )}

          {step === 'category' && (
            <div className="stack">
              <h2>What needs fixing?</h2>
              <div className="cat-grid">
                {o.categories.map((x) => (
                  <button key={x.id} type="button" aria-pressed={catId === x.id} onClick={() => chooseCategory(x.id)}>
                    <Hammer size={16} aria-hidden />
                    {x.name}
                  </button>
                ))}
              </div>
              <BackLink onClick={() => setStep('contact')} />
            </div>
          )}

          {step === 'selfhelp' && cat?.selfHelpKey && SELF_HELP[cat.selfHelpKey] && (
            <div className="box lift">
              <div className="box-head">
                <h2 className="hstack">
                  <Lightbulb size={14} /> Quick checks first
                </h2>
              </div>
              <div className="box-body stack">
                <h3>{SELF_HELP[cat.selfHelpKey]!.title}</h3>
                <ol style={{ paddingLeft: 20, display: 'grid', gap: 8 }}>
                  {SELF_HELP[cat.selfHelpKey]!.checks.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ol>
                <Notice tone="warn">If you’re unsure about any step, stop and send the request instead.</Notice>
                <div className="big-actions">
                  <Button variant="primary" size="lg" icon={ListChecks} onClick={() => setStep('details')}>
                    Still broken, continue
                  </Button>
                  <Button size="lg" icon={CheckCircle2} onClick={fixedIt}>
                    That fixed it
                  </Button>
                  <Button size="lg" variant="danger" icon={AlertTriangle} onClick={() => { setD({ ...d, urgency: 'emergency' }); setStep('details'); }}>
                    This is an emergency
                  </Button>
                </div>
                <BackLink onClick={() => setStep('category')} />
              </div>
            </div>
          )}

          {step === 'details' && (
            <form className="stack" onSubmit={submit}>
              <div className="box lift box-body stack">
                <div className="hstack">
                  <span className="pill info">{cat?.name}</span>
                  <button type="button" className="btn ghost sm" onClick={() => setStep('category')}>
                    Change
                  </button>
                </div>
                <TextField label="Short title" required maxLength={200} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Kitchen sink leak" />
                <TextArea label="What’s happening?" required maxLength={5000} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="Water is leaking from the pipe underneath the kitchen sink." />
                <fieldset className="stack-sm" style={{ border: 0, padding: 0 }}>
                  <legend className="strong small" style={{ marginBottom: 6 }}>
                    How urgent is it?
                  </legend>
                  {URGENCY.map((u) => (
                    <label key={u.value} className="check" style={{ padding: '8px 10px', border: `1.5px solid ${d.urgency === u.value ? 'var(--ballpoint)' : 'var(--hair)'}`, borderRadius: 4, background: d.urgency === u.value ? 'var(--ballpoint-tint)' : 'var(--sheet)' }}>
                      <input type="radio" name="urgency" checked={d.urgency === u.value} onChange={() => setD({ ...d, urgency: u.value })} />
                      <span>
                        <b>{u.label}</b>
                        <span className="muted small" style={{ display: 'block' }}>
                          {u.hint}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              </div>

              {isEmergency && (
                <div className="box risk lift" role="alert">
                  <div className="box-head">
                    <h2 className="hstack">
                      <AlertTriangle size={14} /> Emergency: do this now
                    </h2>
                  </div>
                  <div className="box-body stack-sm">
                    <p style={{ fontSize: 16, fontWeight: 600 }}>
                      If anyone is in danger, call <a href="tel:911">911</a>. For a gas smell, leave the home and call your gas utility.
                      {emergencyPhone && (
                        <>
                          {' '}
                          Then call <a href={`tel:${emergencyPhone}`}>{phone(emergencyPhone)}</a>.
                        </>
                      )}
                    </p>
                    {hits.length > 0 && <p className="small muted">We flagged this because you mentioned “{hits.join('”, “')}”.</p>}
                    <Check label="I understand. Submitting this form does not replace calling for help." checked={ack} onChange={(e) => setAck(e.target.checked)} />
                  </div>
                </div>
              )}

              <div className="box lift box-body stack">
                <h2>Photos {needPhoto ? '' : <span className="muted small">(optional)</span>}</h2>
                {needPhoto && <p className="small muted">A photo helps the repair person bring the right parts on the first visit.</p>}
                <Uploader
                  accept={ACCEPT_IMAGES}
                  capture
                  label="Take or add photos"
                  hint="Up to 15 photos, 15 MB each"
                  start={(meta) => api<Presigned>(`/public/orgs/${slug}/uploads`, { method: 'POST', body: { ...meta, draftId } })}
                  complete={(id) => api(`/public/orgs/${slug}/uploads/${id}/complete`, { method: 'POST', body: { draftId } })}
                  onChange={(ids, b) => { setPhotos(ids.slice(0, 15)); setUploading(b); }}
                />
              </div>

              <div className="box lift box-body stack">
                <h2>Access</h2>
                <fieldset className="chips" aria-label="Quick availability">
                  {QUICK_TIMES.map((t) => {
                    const on = d.availabilityText.split(', ').includes(t);
                    return (
                      <button key={t} type="button" className="chip" aria-pressed={on} onClick={() => setD({ ...d, availabilityText: (on ? d.availabilityText.split(', ').filter((x) => x !== t) : [...d.availabilityText.split(', ').filter(Boolean), t]).join(', ') })}>
                        {t}
                      </button>
                    );
                  })}
                </fieldset>
                <TextField label="When are you available?" value={d.availabilityText} onChange={(e) => setD({ ...d, availabilityText: e.target.value })} maxLength={1000} />
                <SelectField label="Can the repair person enter if you’re not home?" required value={d.permissionToEnter} onChange={(e) => setD({ ...d, permissionToEnter: e.target.value })}>
                  <option value="">Choose one</option>
                  {Object.entries(PERMISSION_LABEL).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </SelectField>
                <TextField label="Access notes" optional value={d.accessNotes} onChange={(e) => setD({ ...d, accessNotes: e.target.value })} maxLength={1000} placeholder="Gate code, parking, alarm" />
                <TextField label="Pets" optional value={d.pets} onChange={(e) => setD({ ...d, pets: e.target.value })} maxLength={500} placeholder="Friendly dog in the bedroom" />
              </div>

              {error && <Notice tone="bad">{error}</Notice>}
              <Button type="submit" variant={isEmergency ? 'danger solid' : 'primary'} size="lg" block icon={Send} loading={busy} disabled={uploading || (needPhoto && photos.length === 0) || !d.permissionToEnter || (isEmergency && !ack)}>
                {uploading ? 'Uploading photos…' : needPhoto && photos.length === 0 ? 'Add a photo to send' : isEmergency ? 'Send emergency request' : 'Send request'}
              </Button>
              <p className="small muted">{o.disclaimer}</p>
            </form>
          )}
        </>
      )}
    </LinkLayout>
  );
}

const BackLink = ({ onClick }: { onClick: () => void }) => (
  <button type="button" className="btn ghost sm" onClick={onClick} style={{ alignSelf: 'flex-start' }}>
    <ArrowLeft size={14} /> Back
  </button>
);
