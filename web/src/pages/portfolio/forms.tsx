/** Create/edit dialogs for owners, properties and tenants, shared by list and detail pages. */
import { useState } from 'react';
import { Dialog, useToast } from '../../components/overlay';
import { OwnerSelect, PropertySelect } from '../../components/pickers';
import { Check, Field, MoneyField, SelectField, TextArea, TextField } from '../../components/ui';
import { api } from '../../lib/api';
import { centsToInput, OCCUPANCY, OCCUPANCY_LABEL, parseMoney, PROPERTY_TYPE_LABEL, PROPERTY_TYPES, type Occupancy, type PropertyType } from '../../lib/format';
import { useCommand, useProperty } from '../../lib/queries';
import type { Owner, Property, Tenant } from '../../lib/types';

const nul = (s: string) => (s.trim() ? s.trim() : null);

// ---------------------------------------------------------------- owner

export function OwnerDialog({ owner, onClose, onSaved }: { owner?: Owner; onClose: () => void; onSaved?: (o: Owner) => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: owner?.name ?? '',
    email: owner?.email ?? '',
    phone: owner?.phone ?? '',
    threshold: centsToInput(owner?.approvalThresholdCents),
    notifyMode: owner?.notifyMode ?? 'direct',
    sendCompletionSummary: owner?.sendCompletionSummary ?? false,
    externalId: owner?.externalId ?? '',
  });
  const save = useCommand((body: unknown) => api<Owner>(owner ? `/owners/${owner.id}` : '/owners', { method: owner ? 'PATCH' : 'POST', body }), [['owners'], ['properties'], ['work-orders']]);
  const cents = f.threshold.trim() ? parseMoney(f.threshold) : null;
  return (
    <Dialog
      open
      onClose={onClose}
      title={owner ? `Edit ${owner.name}` : 'New owner'}
      submitLabel={owner ? 'Save owner' : 'Add owner'}
      submitDisabled={Boolean(f.threshold.trim()) && cents === null}
      onSubmit={async () => {
        const o = await save.mutateAsync({ name: f.name.trim(), email: nul(f.email), phone: nul(f.phone), approvalThresholdCents: cents, notifyMode: f.notifyMode, sendCompletionSummary: f.sendCompletionSummary, externalId: nul(f.externalId) });
        toast(owner ? 'Owner saved' : `${o.name} added`);
        onSaved?.(o);
        onClose();
      }}
    >
      <div className="form-grid">
        <TextField className="full" label="Name" required maxLength={200} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        <TextField label="Email" type="email" optional value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} hint="Needed for one-tap approvals." />
        <TextField label="Phone" type="tel" optional value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <MoneyField label="Approval threshold" optional value={f.threshold} onChange={(e) => setF({ ...f, threshold: e.target.value })} hint="Quotes above this need the owner. Blank uses your firm default." error={f.threshold.trim() && cents === null ? 'Enter an amount' : null} />
        <SelectField label="Approval requests" value={f.notifyMode} onChange={(e) => setF({ ...f, notifyMode: e.target.value as Owner['notifyMode'] })}>
          <option value="direct">Email the owner a one-tap link</option>
          <option value="pm_forwards">I forward them myself</option>
        </SelectField>
        <div className="full">
          <Check label="Email the owner a summary when a job closes" checked={f.sendCompletionSummary} onChange={(e) => setF({ ...f, sendCompletionSummary: e.target.checked })} disabled={f.notifyMode !== 'direct'} />
        </div>
        <TextField label="PMS owner ID" optional value={f.externalId} onChange={(e) => setF({ ...f, externalId: e.target.value })} maxLength={100} hint="Appears in exports." />
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- property

export function PropertyDialog({ property, onClose, onSaved }: { property?: Property; onClose: () => void; onSaved?: (p: Property) => void }) {
  const toast = useToast();
  const [newOwner, setNewOwner] = useState(false);
  const [f, setF] = useState({
    ownerId: property?.ownerId ?? '',
    nameRef: property?.nameRef ?? '',
    addressLine: property?.addressLine ?? '',
    city: property?.city ?? '',
    state: property?.state ?? '',
    zip: property?.zip ?? '',
    type: (property?.type ?? 'single_family') as PropertyType,
    notes: property?.notes ?? '',
    emergencyPhone: property?.emergencyPhone ?? '',
    externalId: property?.externalId ?? '',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const save = useCommand((body: unknown) => api<Property>(property ? `/properties/${property.id}` : '/properties', { method: property ? 'PATCH' : 'POST', body }), [['properties']]);
  return (
    <>
      <Dialog
        open={!newOwner}
        wide
        onClose={onClose}
        title={property ? `Edit ${property.nameRef}` : 'Add a property'}
        submitLabel={property ? 'Save property' : 'Add property'}
        submitDisabled={!f.ownerId}
        onSubmit={async () => {
          const p = await save.mutateAsync({ ...f, notes: nul(f.notes), emergencyPhone: nul(f.emergencyPhone), externalId: nul(f.externalId), ...(property ? { type: undefined } : {}) });
          toast(property ? 'Property saved' : f.type === 'multi_family' ? `${p.nameRef} added. Now add its units.` : `${p.nameRef} added`);
          onClose();
          onSaved?.(p);
        }}
      >
        <div className="form-grid">
          <TextField className="full" label="Name or reference" required maxLength={200} value={f.nameRef} onChange={set('nameRef')} placeholder="Green Valley Apartments" autoFocus />
          <Field label="Owner" hint={<button type="button" className="btn ghost sm" style={{ padding: 0, height: 'auto' }} onClick={() => setNewOwner(true)}>+ New owner</button>}>
            {(id) => <OwnerSelect id={id} value={f.ownerId} onChange={(ownerId) => setF({ ...f, ownerId })} all="Choose an owner" required />}
          </Field>
          <SelectField label="Type" value={f.type} onChange={set('type')} disabled={Boolean(property)} hint={property ? undefined : f.type === 'multi_family' ? 'You’ll add units next.' : 'One unit is created for you.'}>
            {PROPERTY_TYPES.map((t) => (
              <option key={t} value={t}>
                {PROPERTY_TYPE_LABEL[t]}
              </option>
            ))}
          </SelectField>
          <TextField className="full" label="Street address" required maxLength={200} value={f.addressLine} onChange={set('addressLine')} autoComplete="street-address" />
          <TextField label="City" required maxLength={100} value={f.city} onChange={set('city')} />
          <div className="form-grid" style={{ gap: 12 }}>
            <TextField label="State" required maxLength={2} value={f.state} onChange={(e) => setF({ ...f, state: e.target.value.toUpperCase() })} placeholder="TX" pattern="[A-Za-z]{2}" />
            <TextField label="ZIP" required value={f.zip} onChange={set('zip')} inputMode="numeric" pattern="\d{5}(-\d{4})?" />
          </div>
          <TextField label="Emergency phone" type="tel" optional value={f.emergencyPhone} onChange={set('emergencyPhone')} hint="Shown on the tenant emergency banner. Blank uses the firm’s." />
          <TextField label="PMS property ID" optional value={f.externalId} onChange={set('externalId')} maxLength={100} />
          <TextArea className="full" label="Notes" optional value={f.notes} onChange={set('notes')} maxLength={5000} placeholder="Gate codes, shut-off valve location…" />
        </div>
      </Dialog>
      {newOwner && <OwnerDialog onClose={() => setNewOwner(false)} onSaved={(o) => setF((x) => ({ ...x, ownerId: o.id }))} />}
    </>
  );
}

// ---------------------------------------------------------------- tenant

export function TenantDialog({ tenant, propertyId: initialProperty, unitId, onClose }: { tenant?: Tenant; propertyId?: string; unitId?: string; onClose: () => void }) {
  const toast = useToast();
  // Editing starts on "keep current unit"; choosing a property moves the tenant.
  const [propertyId, setPropertyId] = useState(tenant ? '' : (initialProperty ?? ''));
  const prop = useProperty(propertyId);
  const [f, setF] = useState({
    unitId: tenant?.unitId ?? unitId ?? '',
    name: tenant?.name ?? '',
    email: tenant?.email ?? '',
    phone: tenant?.phone ?? '',
    occupancyStatus: (tenant?.occupancyStatus ?? 'current') as Occupancy,
    smsConsent: Boolean(tenant?.smsConsentAt),
    externalId: tenant?.externalId ?? '',
  });
  const save = useCommand((body: unknown) => api<Tenant>(tenant ? `/tenants/${tenant.id}` : '/tenants', { method: tenant ? 'PATCH' : 'POST', body }), [['tenants'], ['properties']]);
  const noContact = !f.email.trim() && !f.phone.trim();
  return (
    <Dialog
      open
      onClose={onClose}
      title={tenant ? `Edit ${tenant.name}` : 'Add a tenant'}
      submitLabel={tenant ? 'Save tenant' : 'Add tenant'}
      submitDisabled={!f.unitId || noContact}
      onSubmit={async () => {
        const consentChanged = !tenant || Boolean(tenant.smsConsentAt) !== f.smsConsent;
        await save.mutateAsync({ ...f, email: nul(f.email), phone: nul(f.phone), externalId: nul(f.externalId), smsConsent: consentChanged ? f.smsConsent : undefined });
        toast(tenant ? 'Tenant saved' : `${f.name} added`);
        onClose();
      }}
    >
      <div className="form-grid">
        <TextField className="full" label="Name" required maxLength={200} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        <Field label={tenant ? 'Move to property' : 'Property'}>
          {(id) => <PropertySelect id={id} value={propertyId} all={tenant ? 'Keep current unit' : 'Choose a property'} onChange={(v) => { setPropertyId(v); setF({ ...f, unitId: v ? '' : (tenant?.unitId ?? '') }); }} />}
        </Field>
        <SelectField label="Unit" required value={f.unitId} onChange={(e) => setF({ ...f, unitId: e.target.value })} disabled={!propertyId}>
          {!propertyId && tenant ? <option value={tenant.unitId}>Current unit</option> : <option value="">Choose a unit</option>}
          {propertyId &&
            prop.data?.units.filter((u) => !u.archivedAt).map((u) => (
              <option key={u.id} value={u.id}>
                {u.label === 'Main' ? 'Whole property' : `Unit ${u.label}`}
              </option>
            ))}
        </SelectField>
        <TextField label="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={noContact ? 'Email or phone is required' : null} />
        <TextField label="Mobile phone" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <SelectField label="Occupancy" value={f.occupancyStatus} onChange={(e) => setF({ ...f, occupancyStatus: e.target.value as Occupancy })} hint={f.occupancyStatus === 'past' ? 'Marking past revokes all of their links.' : undefined}>
          {OCCUPANCY.map((o) => (
            <option key={o} value={o}>
              {OCCUPANCY_LABEL[o]}
            </option>
          ))}
        </SelectField>
        <TextField label="PMS tenant ID" optional value={f.externalId} onChange={(e) => setF({ ...f, externalId: e.target.value })} maxLength={100} />
        <div className="full">
          <Check label="Tenant agreed to receive text messages" hint="Required before we send SMS (carrier rules)." checked={f.smsConsent} onChange={(e) => setF({ ...f, smsConsent: e.target.checked })} />
        </div>
      </div>
    </Dialog>
  );
}
