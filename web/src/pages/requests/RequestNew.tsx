import { AlertTriangle, ChevronRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useToast } from '../../components/overlay';
import { PropertySelect } from '../../components/pickers';
import { Box, Button, Field, Notice, SelectField, TextArea, TextField } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { PERMISSION_LABEL, PRIORITIES, PRIORITY_LABEL, type Priority } from '../../lib/format';
import { useCategories, useCommand, useOrg, useProperty, useTenant } from '../../lib/queries';
import type { RequestDetail } from '../../lib/types';
import { emergencyHits } from '../../lib/emergency';

export default function RequestNew() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const cats = useCategories();
  const org = useOrg();
  const [propertyId, setPropertyId] = useState(params.get('propertyId') ?? '');
  const prop = useProperty(propertyId);
  const [f, setF] = useState({ unitId: params.get('unitId') ?? '', tenantId: params.get('tenantId') ?? '', categoryId: '', title: '', description: '', urgency: 'normal' as Priority, availabilityText: '', permissionToEnter: 'yes', accessNotes: '', pets: '' });
  const [error, setError] = useState<string | null>(null);
  // Coming from a tenant page: unit + tenant are known, so the property pickers are skipped.
  const [preset, setPreset] = useState(Boolean(params.get('tenantId') && params.get('unitId') && !params.get('propertyId')));
  const presetTenant = useTenant(preset ? f.tenantId : '');
  const create = useCommand((body: Record<string, unknown>) => api<RequestDetail>('/requests', { method: 'POST', body }), [['requests'], ['properties'], ['tenants']]);

  const units = (propertyId && prop.data?.units.filter((u) => !u.archivedAt)) || [];
  const tenants = prop.data?.tenants.filter((t) => t.unitId === f.unitId) ?? [];
  const hits = emergencyHits(`${f.title} ${f.description}`, org.data?.emergencyKeywords ?? []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    // The unit select is disabled until a property is picked, so the browser skips it.
    if (!f.unitId) return setError('Choose the property and unit first.');
    try {
      const r = await create.mutateAsync({ ...f, tenantId: f.tenantId || null });
      toast(`${r.ref} logged${f.tenantId ? '. The tenant gets a tracking link.' : ''}`);
      nav(`/requests/${r.id}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/requests">Requests</Link>
        <ChevronRight size={13} />
        <span>Log a request</span>
      </nav>
      <div className="page-head">
        <div>
          <h1>Log a request</h1>
          <p className="sub">For a tenant who called or emailed. They still get the tracking link.</p>
        </div>
      </div>
      <form onSubmit={submit} className="grid-main">
        <div className="stack">
          <Box title="Where" lift>
            {preset ? (
              <div className="spread">
                <div>
                  <span className="f-label">Tenant</span>
                  <div className="f-value">{presetTenant.data?.name ?? '…'}</div>
                </div>
                <Button size="sm" onClick={() => { setPreset(false); setF({ ...f, unitId: '', tenantId: '' }); }}>
                  Change
                </Button>
              </div>
            ) : (
            <div className="form-grid">
              <Field label="Property">
                {(id) => (
                  <PropertySelect
                    id={id}
                    value={propertyId}
                    all="Choose a property"
                    onChange={(v) => {
                      setPropertyId(v);
                      setF({ ...f, unitId: '', tenantId: '' });
                    }}
                  />
                )}
              </Field>
              <SelectField label="Unit" required value={f.unitId} onChange={(e) => setF({ ...f, unitId: e.target.value, tenantId: '' })} disabled={!propertyId}>
                <option value="">{propertyId ? 'Choose a unit' : 'Pick a property first'}</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label === 'Main' ? 'Whole property' : `Unit ${u.label}`}
                  </option>
                ))}
              </SelectField>
              <SelectField className="full" label="Tenant" optional value={f.tenantId} onChange={set('tenantId')} disabled={!f.unitId} hint={f.unitId && tenants.length === 0 ? 'No current tenant on this unit.' : undefined}>
                <option value="">No tenant (vacant or owner-reported)</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </SelectField>
            </div>
            )}
          </Box>
          <Box title="What’s wrong" lift>
            <div className="form-grid">
              <TextField className="full" label="Issue title" required maxLength={200} value={f.title} onChange={set('title')} placeholder="Kitchen sink leak" />
              <TextArea className="full" label="Description" required maxLength={5000} value={f.description} onChange={set('description')} placeholder="Water is leaking from the pipe underneath the kitchen sink." />
              <SelectField label="Category" required value={f.categoryId} onChange={set('categoryId')}>
                <option value="">Choose a category</option>
                {cats.data?.filter((c) => c.active).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Priority" value={f.urgency} onChange={set('urgency')}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </SelectField>
              {hits.length > 0 && f.urgency !== 'emergency' && (
                <div className="full">
                  <Notice tone="bad" icon={AlertTriangle}>
                    Mentions <b>{hits.join(', ')}</b>, so it will be saved as an <b>emergency</b> and your team is alerted right away.
                  </Notice>
                </div>
              )}
            </div>
          </Box>
          <p className="small muted">You can add photos on the request page after saving.</p>
        </div>
        <div className="stack">
          <Box title="Access" lift>
            <div className="stack-sm">
              <TextField label="Availability" optional value={f.availabilityText} onChange={set('availabilityText')} placeholder="Weekday mornings" maxLength={1000} />
              <SelectField label="Permission to enter" value={f.permissionToEnter} onChange={set('permissionToEnter')}>
                {Object.entries(PERMISSION_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </SelectField>
              <TextArea label="Access notes" optional value={f.accessNotes} onChange={set('accessNotes')} maxLength={1000} placeholder="Gate code, parking, alarm" style={{ minHeight: 64 }} />
              <TextField label="Pets" optional value={f.pets} onChange={set('pets')} maxLength={500} />
            </div>
          </Box>
          {error && <Notice tone="bad">{error}</Notice>}
          <Button type="submit" variant="primary" size="lg" block loading={create.isPending}>
            Log request
          </Button>
        </div>
      </form>
    </>
  );
}
