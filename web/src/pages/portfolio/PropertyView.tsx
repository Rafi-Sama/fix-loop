import { useQuery } from '@tanstack/react-query';
import { Archive, ArchiveRestore, ChevronRight, History, Pencil, Plus, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Bars } from '../../components/lazyCharts';
import { Dialog, useDialog, useToast } from '../../components/overlay';
import { QrLink } from '../../components/QrLink';
import { Box, Button, ButtonLink, Empty, Fields, LoadError, Notice, Prio, RefTag, ReqStamp, TextArea, WoStamp } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { date, fillMonths, money, OCCUPANCY_LABEL, phone, plural, PROPERTY_TYPE_LABEL, relative } from '../../lib/format';
import { keys, useCommand, useOrg, useProperty, useUser } from '../../lib/queries';
import type { RequestRow, Unit, WoRow } from '../../lib/types';
import { parseUnitLabels } from '../../lib/units';
import { DetailSkeleton } from '../requests/RequestView';
import { OwnerDialog, PropertyDialog, TenantDialog } from './forms';

type Dlg = 'edit' | 'owner' | 'units' | 'tenant' | 'history';

export default function PropertyView() {
  const { id = '' } = useParams();
  const me = useUser();
  const q = useProperty(id);
  const org = useOrg();
  const p = q.data;
  const dlg = useDialog<Dlg>();
  const [historyUnit, setHistoryUnit] = useState<Unit | null>(null);
  const toast = useToast();
  const archive = useCommand((archived: boolean) => api(`/properties/${id}`, { method: 'PATCH', body: { archived } }), [keys.property(id), ['properties']]);
  const unitArchive = useCommand((v: { id: string; archived: boolean }) => api(`/units/${v.id}`, { method: 'PATCH', body: { archived: v.archived } }), [keys.property(id)]);

  if (q.isError) return <LoadError error={q.error} retry={() => q.refetch()} />;
  if (!p) return <DetailSkeleton />;

  const activeUnits = p.units.filter((u) => !u.archivedAt);
  const tenantsOf = (unitId: string) => p.tenants.filter((t) => t.unitId === unitId);
  const spend = p.expenseByMonth.reduce((s, m) => s + m.totalCents, 0);
  const multi = p.type === 'multi_family' || p.units.length > 1;

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/properties">Properties</Link>
        <ChevronRight size={13} />
        <span>{p.nameRef}</span>
      </nav>
      <div className="page-head">
        <div>
          <h1>{p.nameRef}</h1>
          <p className="sub">
            {p.addressLine}, {p.city}, {p.state} {p.zip} · {PROPERTY_TYPE_LABEL[p.type]} · {plural(activeUnits.length, 'unit')}
          </p>
        </div>
        <div className="actions">
          <Button icon={Pencil} onClick={() => dlg.show('edit')}>
            Edit
          </Button>
          <Button
            icon={p.archivedAt ? ArchiveRestore : Archive}
            variant="ghost"
            loading={archive.isPending}
            onClick={() => archive.mutateAsync(!p.archivedAt).then(() => toast(p.archivedAt ? 'Property restored' : 'Property archived. It keeps its history and can’t receive new requests.'), (e) => toast(errorMessage(e), 'bad'))}
          >
            {p.archivedAt ? 'Restore' : 'Archive'}
          </Button>
          {!p.archivedAt && (
            <ButtonLink to={`/requests/new?propertyId=${p.id}`} variant="primary" icon={Plus}>
              Log request here
            </ButtonLink>
          )}
        </div>
      </div>
      {p.archivedAt && (
        <div style={{ marginBottom: 18 }}>
          <Notice tone="warn">Archived {relative(p.archivedAt)}. It’s hidden from lists and can’t receive new requests.</Notice>
        </div>
      )}

      <div className="grid-main">
        <div className="stack">
          <Box
            title="Units & tenants"
            meta={`${activeUnits.length}`}
            flush
            lift
            actions={
              <>
                <Button size="sm" icon={UserPlus} onClick={() => dlg.show('tenant')}>
                  Add tenant
                </Button>
                {multi && (
                  <Button size="sm" icon={Plus} onClick={() => dlg.show('units')}>
                    Add units
                  </Button>
                )}
              </>
            }
          >
            {p.units.length === 0 ? (
              <Empty icon={Users} title="No units yet" action={<Button variant="primary" onClick={() => dlg.show('units')}>Add units</Button>}>
                Add “101-124” style ranges in one go.
              </Empty>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th>Tenant</th>
                    <th className="hide-sm">Contact</th>
                    <th className="r">History</th>
                  </tr>
                </thead>
                <tbody>
                  {p.units.map((u) => {
                    const ts = tenantsOf(u.id);
                    return (
                      <tr key={u.id} style={{ opacity: u.archivedAt ? 0.5 : 1 }}>
                        <td className="strong">
                          {u.label === 'Main' ? 'Whole property' : u.label}
                          {u.archivedAt && <span className="small muted"> · archived</span>}
                        </td>
                        <td>
                          {ts.length === 0 ? (
                            <span className="muted">Vacant</span>
                          ) : (
                            ts.map((t) => (
                              <div key={t.id}>
                                <Link to={`/tenants/${t.id}`}>{t.name}</Link>
                                {t.occupancyStatus !== 'current' && <span className="pill warn" style={{ marginLeft: 6 }}>{OCCUPANCY_LABEL[t.occupancyStatus]}</span>}
                              </div>
                            ))
                          )}
                        </td>
                        <td className="hide-sm small muted">{ts.map((t) => t.phone ? phone(t.phone) : t.email).join(', ') || '—'}</td>
                        <td className="r">
                          <span className="hstack" style={{ justifyContent: 'flex-end', gap: 2 }}>
                            <button type="button" className="icon-btn dark" title={`History for ${u.label}`} aria-label={`History for unit ${u.label}`} onClick={() => { setHistoryUnit(u); dlg.show('history'); }}>
                              <History size={15} />
                            </button>
                            {multi && (
                              <button type="button"
                                className="icon-btn dark"
                                title={u.archivedAt ? 'Restore unit' : 'Archive unit'}
                                aria-label={u.archivedAt ? `Restore unit ${u.label}` : `Archive unit ${u.label}`}
                                onClick={() => unitArchive.mutateAsync({ id: u.id, archived: !u.archivedAt }).catch((e) => toast(errorMessage(e), 'bad'))}
                              >
                                {u.archivedAt ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                              </button>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Box>

          <Box title="Open requests" meta={`${p.openRequests.length}`} flush>
            {p.openRequests.length === 0 ? (
              <p className="box-body muted small">Nothing open at this property.</p>
            ) : (
              <ul className="rows">
                {p.openRequests.map((r) => (
                  <li key={r.id}>
                    <Link to={`/requests/${r.id}`} className="row resp" style={{ gridTemplateColumns: '128px minmax(0,1fr) auto auto' }}>
                      <RefTag refNo={r.ref} />
                      <span className="row-title">{r.title}</span>
                      <span className="hide-sm"><Prio p={r.priority} /></span>
                      <ReqStamp s={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Box>

          <Box title="Completed jobs" meta={`${p.completedJobs.length}`} flush actions={<Link className="small" to={`/reports/property?propertyId=${p.id}`}>Owner report</Link>}>
            {p.completedJobs.length === 0 ? (
              <p className="box-body muted small">No closed work orders yet.</p>
            ) : (
              <ul className="rows">
                {p.completedJobs.map((w) => (
                  <li key={w.id}>
                    <Link to={`/work-orders/${w.id}`} className="row" style={{ gridTemplateColumns: '128px minmax(0,1fr) auto' }}>
                      <RefTag refNo={w.ref} />
                      <span className="row-title">{w.description}</span>
                      <span className="small muted">{date(w.closedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Box>
        </div>

        <aside className="stack">
          <Box title="Owner" tone="owner" flush actions={<Button size="sm" variant="ghost" icon={Pencil} onClick={() => dlg.show('owner')} aria-label="Edit owner" />}>
            <Fields
              cols={1}
              items={[
                { label: 'Name', value: p.owner.name },
                { label: 'Contact', value: [p.owner.email, p.owner.phone && phone(p.owner.phone)].filter(Boolean).join(' · ') },
                { label: 'Approval threshold', value: p.owner.approvalThresholdCents !== null ? money(p.owner.approvalThresholdCents, true) : `Firm default (${money(org.data?.defaultApprovalThresholdCents, true)})` },
                { label: 'Approvals', value: p.owner.notifyMode === 'direct' ? 'One-tap email link' : 'You forward them' },
              ]}
            />
          </Box>
          <Box title="Maintenance spend" meta={money(spend, true)}>
            {p.expenseByMonth.length ? <Bars data={fillMonths(p.expenseByMonth, 12)} format={(n) => money(n, true)} height={160} /> : <p className="muted small">No expenses recorded yet.</p>}
          </Box>
          <Box title="Details" flush>
            <Fields
              cols={1}
              items={[
                { label: 'Emergency phone', value: p.emergencyPhone ? phone(p.emergencyPhone) : 'Firm default' },
                { label: 'Notes', value: p.notes },
                { label: 'PMS ID', value: p.externalId },
              ]}
            />
          </Box>
          {!p.archivedAt && (
            <Box title="Tenant request link">
              <div className="stack-sm">
                <p className="small muted">Post this in the building. Tenants pick their unit, so it works even before you’ve added them.</p>
                <QrLink url={`${location.origin}/r/${me.org.slug}/p/${p.id}`} title={p.nameRef} />
              </div>
            </Box>
          )}
        </aside>
      </div>

      {dlg.is('edit') && <PropertyDialog property={p} onClose={dlg.close} />}
      {dlg.is('owner') && <OwnerDialog owner={p.owner} onClose={dlg.close} />}
      {dlg.is('tenant') && <TenantDialog propertyId={p.id} unitId={activeUnits.length === 1 ? activeUnits[0]!.id : undefined} onClose={dlg.close} />}
      {dlg.is('units') && <UnitsDialog propertyId={p.id} onClose={dlg.close} />}
      {dlg.is('history') && historyUnit && <UnitHistory unit={historyUnit} onClose={dlg.close} />}
    </>
  );
}

function UnitsDialog({ propertyId, onClose }: { propertyId: string; onClose: () => void }) {
  const [text, setText] = useState('');
  const toast = useToast();
  const parsed = parseUnitLabels(text);
  const add = useCommand((labels: string[]) => api<Unit[]>(`/properties/${propertyId}/units`, { method: 'POST', body: { labels } }), [keys.property(propertyId), ['properties']]);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Add units"
      submitLabel={Array.isArray(parsed) && parsed.length ? `Add ${plural(parsed.length, 'unit')}` : 'Add units'}
      submitDisabled={!Array.isArray(parsed) || parsed.length === 0}
      onSubmit={async () => {
        if (!Array.isArray(parsed)) return;
        const created = await add.mutateAsync(parsed);
        const skipped = parsed.length - created.length;
        toast(`${plural(created.length, 'unit')} added${skipped ? `, ${skipped} already existed` : ''}`);
        onClose();
      }}
    >
      <TextArea label="Unit labels" value={text} onChange={(e) => setText(e.target.value)} placeholder="101-124, 201-224, PH" hint="Ranges and commas. Existing labels are skipped, so it’s safe to repeat." error={typeof parsed === 'string' ? parsed : null} autoFocus />
      {Array.isArray(parsed) && parsed.length > 0 && (
        <fieldset className="chips" aria-label="Preview">
          {parsed.slice(0, 40).map((l) => (
            <span key={l} className="chip" style={{ cursor: 'default' }}>
              {l}
            </span>
          ))}
          {parsed.length > 40 && <span className="small muted">+{parsed.length - 40} more</span>}
        </fieldset>
      )}
    </Dialog>
  );
}

function UnitHistory({ unit, onClose }: { unit: Unit; onClose: () => void }) {
  const h = useQuery({ queryKey: keys.unitHistory(unit.id), queryFn: () => api<{ requests: RequestRow[]; workOrders: (Pick<WoRow, 'id' | 'ref' | 'status'> & { requestId: string })[] }>(`/units/${unit.id}/history`) });
  return (
    <Dialog open wide onClose={onClose} title={`History · ${unit.label === 'Main' ? 'Whole property' : `Unit ${unit.label}`}`}>
      {h.isPending ? (
        <p className="muted">Loading…</p>
      ) : h.isError ? (
        <Notice tone="bad">{errorMessage(h.error)}</Notice>
      ) : h.data.requests.length === 0 ? (
        <p className="muted">No maintenance history for this unit.</p>
      ) : (
        <ul className="rows box">
          {h.data.requests.map((r) => {
            const jobs = h.data.workOrders.filter((w) => w.requestId === r.id);
            return (
              <li key={r.id} className="row" style={{ gridTemplateColumns: '128px minmax(0,1fr) auto' }}>
                <Link to={`/requests/${r.id}`} className="tag" onClick={onClose}>
                  {r.ref}
                </Link>
                <div className="min0">
                  <div className="row-title">{r.title}</div>
                  <div className="hstack" style={{ marginTop: 4 }}>
                    {jobs.map((w) => (
                      <Link key={w.id} to={`/work-orders/${w.id}`} onClick={onClose} className="hstack small" style={{ gap: 4 }}>
                        {w.ref} <WoStamp s={w.status} />
                      </Link>
                    ))}
                  </div>
                </div>
                <span className="small muted">{date(r.createdAt)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
