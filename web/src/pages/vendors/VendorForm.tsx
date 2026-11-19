import { X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { Dialog, useToast } from '../../components/overlay';
import { Check, Field, TextArea, TextField } from '../../components/ui';
import { api } from '../../lib/api';
import { useCategories, useCommand } from '../../lib/queries';
import type { Vendor } from '../../lib/types';

/** Free-text tags (ZIPs, cities): Enter or comma commits, Backspace on empty removes the last one. */
function Tags({ id, value, onChange, placeholder, validate }: { id: string; value: string[]; onChange: (v: string[]) => void; placeholder: string; validate: (s: string) => string | null }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const commit = () => {
    const parts = text.split(',').map((s) => s.trim()).filter(Boolean);
    const bad = parts.map(validate).find(Boolean);
    if (bad) return setErr(bad);
    onChange([...new Set([...value, ...parts.map((p) => p.toLowerCase())])]);
    setText('');
    setErr(null);
  };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
  };
  return (
    <div className="stack-sm">
      {value.length > 0 && (
        <div className="chips">
          {value.map((v) => (
            <span key={v} className="chip" style={{ cursor: 'default', textTransform: 'capitalize' }}>
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input id={id} className="input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={key} onBlur={() => text.trim() && commit()} placeholder={placeholder} aria-invalid={Boolean(err) || undefined} />
      {err && <span className="small" style={{ color: 'var(--serial)' }}>{err}</span>}
    </div>
  );
}

export function VendorDialog({ vendor, onClose, onSaved }: { vendor?: Vendor; onClose: () => void; onSaved?: (v: Vendor) => void }) {
  const toast = useToast();
  const cats = useCategories();
  const [f, setF] = useState({
    companyName: vendor?.companyName ?? '',
    contactName: vendor?.contactName ?? '',
    email: vendor?.email ?? '',
    phone: vendor?.phone ?? '',
    address: vendor?.address ?? '',
    categoryIds: vendor?.categoryIds ?? [],
    coverageZips: vendor?.coverageZips ?? [],
    coverageCities: vendor?.coverageCities ?? [],
    availabilityText: vendor?.availabilityText ?? '',
    notes: vendor?.notes ?? '',
    smsConsent: Boolean(vendor?.smsConsentAt),
    externalId: vendor?.externalId ?? '',
  });
  const save = useCommand((body: unknown) => api<Vendor>(vendor ? `/vendors/${vendor.id}` : '/vendors', { method: vendor ? 'PATCH' : 'POST', body }), [['vendors']]);
  const nul = (s: string) => s.trim() || null;
  const toggleCat = (id: string) => setF({ ...f, categoryIds: f.categoryIds.includes(id) ? f.categoryIds.filter((x) => x !== id) : [...f.categoryIds, id] });
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={vendor ? `Edit ${vendor.companyName}` : 'Add a vendor'}
      submitLabel={vendor ? 'Save vendor' : 'Add vendor'}
      onSubmit={async () => {
        const consentChanged = !vendor || Boolean(vendor.smsConsentAt) !== f.smsConsent;
        const v = await save.mutateAsync({ ...f, contactName: nul(f.contactName), email: nul(f.email), phone: nul(f.phone), address: nul(f.address), availabilityText: nul(f.availabilityText), notes: nul(f.notes), externalId: nul(f.externalId), smsConsent: consentChanged ? f.smsConsent : undefined });
        toast(vendor ? 'Vendor saved' : `${v.companyName} added. Invite them to upload their insurance.`);
        onClose();
        onSaved?.(v);
      }}
    >
      <div className="form-grid">
        <TextField label="Company" required maxLength={200} value={f.companyName} onChange={(e) => setF({ ...f, companyName: e.target.value })} autoFocus />
        <TextField label="Contact person" optional maxLength={200} value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} />
        <TextField label="Email" type="email" optional value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <TextField label="Mobile phone" type="tel" optional value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} hint="Job links also go here by text once your firm’s texting is approved." />
        <TextField className="full" label="Business address" optional maxLength={500} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        <div className="field full">
          <span className="lbl">Services</span>
          <fieldset className="chips" aria-label="Services">
            {cats.data?.filter((c) => c.active || f.categoryIds.includes(c.id)).map((c) => (
              <button key={c.id} type="button" className="chip" aria-pressed={f.categoryIds.includes(c.id)} onClick={() => toggleCat(c.id)}>
                {c.name}
              </button>
            ))}
          </fieldset>
        </div>
        <Field label="Coverage ZIP codes" optional>
          {(id) => <Tags id={id} value={f.coverageZips} onChange={(coverageZips) => setF({ ...f, coverageZips })} placeholder="78701, 78704" validate={(s) => (/^\d{5}$/.test(s) ? null : `${s} isn’t a 5-digit ZIP`)} />}
        </Field>
        <Field label="Coverage cities" optional>
          {(id) => <Tags id={id} value={f.coverageCities} onChange={(coverageCities) => setF({ ...f, coverageCities })} placeholder="Austin, Round Rock" validate={(s) => (s.length <= 100 ? null : 'Too long')} />}
        </Field>
        <TextField className="full" label="Availability" optional maxLength={500} value={f.availabilityText} onChange={(e) => setF({ ...f, availabilityText: e.target.value })} placeholder="Mon–Fri 8–5, emergencies 24/7" />
        <TextArea className="full" label="Internal notes" optional maxLength={5000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} hint="Only your team sees these." />
        <TextField label="PMS vendor ID" optional maxLength={100} value={f.externalId} onChange={(e) => setF({ ...f, externalId: e.target.value })} />
        <div style={{ alignSelf: 'end' }}>
          <Check label="Vendor agreed to receive text messages" checked={f.smsConsent} onChange={(e) => setF({ ...f, smsConsent: e.target.checked })} />
        </div>
      </div>
    </Dialog>
  );
}
