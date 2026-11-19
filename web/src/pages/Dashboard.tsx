import { AlertTriangle, Building2, CheckCircle2, ClipboardCheck, Clock, Copy, HardHat, Hourglass, Inbox, Link2, Wrench } from 'lucide-react';
import { Link } from 'react-router';
import { Bars, Donut } from '../components/lazyCharts';
import { useToast } from '../components/overlay';
import { Box, ButtonLink, Empty, LoadError, Prio, RefTag, Segmented, Skeleton } from '../components/ui';
import { setDashboardDays, useDashboardDays } from '../lib/prefs';
import { duration, fillMonths, isoDay, money, PARTY_LABEL, plural, WO_STATUS_LABEL, type Party } from '../lib/format';
import { useDashboard, useReport, useUser } from '../lib/queries';
import type { Dashboard as D, QueueItem } from '../lib/types';

const PARTY_HEX: Record<Party, string> = { pm: '#f6e27a', vendor: '#cfe0f5', tenant: '#f2b8c6', owner: '#bfe3c8' };

export const greeting = (d = new Date()) => (d.getHours() < 12 ? 'Good morning' : d.getHours() < 18 ? 'Good afternoon' : 'Good evening');

/** What the PM should do next for a job sitting on their copy. */
function nextStep(w: QueueItem): string {
  if (w.status === 'draft') return 'Assign a vendor';
  if (w.status === 'completed') return 'Review & close';
  if (w.status === 'awaiting_approval') return w.approvalPendingWith === 'owner' ? 'Owner deciding' : 'Decide on quote';
  return WO_STATUS_LABEL[w.status];
}

export default function Dashboard() {
  const me = useUser();
  const days = useDashboardDays();
  const dash = useDashboard(days);
  const sixMonths = new Date();
  sixMonths.setMonth(sixMonths.getMonth() - 5, 1);
  const spend = useReport<{ monthly: { month: string; totalCents: number }[]; totalCents: number }>('financial', '/reports/financial', { from: isoDay(sixMonths) });

  if (dash.isError) return <LoadError error={dash.error} retry={() => dash.refetch()} />;
  const d = dash.data;
  const q = d?.queue;
  const openJobs = q ? q.atRisk.length + q.you.length + q.vendor.length + q.owner.length : 0;

  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>
            {greeting()}, {me.name.split(' ')[0]}
          </h1>
          <p className="sub">
            {q ? (
              <>
                {plural(openJobs, 'open job')} · <span style={{ color: q.atRisk.length ? 'var(--serial)' : undefined, fontWeight: q.atRisk.length ? 700 : undefined }}>{q.atRisk.length} at risk</span> · {plural(q.you.length, 'waiting on you', 'waiting on you')}
              </>
            ) : (
              'Loading your queue…'
            )}
          </p>
        </div>
        <Segmented
          label="Period"
          value={String(days)}
          onChange={(v) => setDashboardDays(Number(v))}
          options={[
            { value: '7', label: '7 days' },
            { value: '30', label: '30 days' },
            { value: '90', label: '90 days' },
          ]}
        />
      </div>

      {d && d.tiles.totalProperties === 0 ? <FirstRun slug={me.org.slug} /> : <Queue q={q} />}

      <Tiles d={d} days={days} />

      <div className="grid-2">
        <Box title="Who holds the copy" meta="open jobs right now">
          {q ? (
            <Donut
              total={String(openJobs + q.tenant.length)}
              caption="waiting"
              data={[
                { name: 'You', value: q.you.length + q.atRisk.filter((x) => x.waitingOn === 'pm').length, color: PARTY_HEX.pm },
                { name: 'Vendor', value: q.vendor.length + q.atRisk.filter((x) => x.waitingOn === 'vendor').length, color: PARTY_HEX.vendor },
                { name: 'Owner', value: q.owner.length + q.atRisk.filter((x) => x.waitingOn === 'owner').length, color: PARTY_HEX.owner },
                { name: 'Tenant', value: q.tenant.length, color: PARTY_HEX.tenant },
              ]}
            />
          ) : (
            <Skeleton h={168} />
          )}
        </Box>
        <Box title="Maintenance spend" meta="last 6 months" actions={<Link to="/reports/financial" className="small">Financial report</Link>}>
          {spend.data ? (
            spend.data.monthly.length ? (
              <Bars data={fillMonths(spend.data.monthly, 6)} format={(n) => money(n, true)} height={168} />
            ) : (
              <Empty icon={ClipboardCheck} title="No spend recorded yet">Closing a work order records its approved invoice as an expense.</Empty>
            )
          ) : (
            <Skeleton h={168} />
          )}
        </Box>
      </div>
    </div>
  );
}

function Tiles({ d, days }: { d: D | undefined; days: number }) {
  const t = d?.tiles;
  const tiles: { label: string; value?: number; to: string; icon: typeof Inbox; bad?: boolean; note?: string }[] = [
    { label: 'Properties', value: t?.totalProperties, to: '/properties', icon: Building2 },
    { label: 'Requests', value: t?.totalRequests, to: '/requests', icon: Inbox, note: `last ${days} days` },
    { label: 'Open requests', value: t?.openRequests, to: '/requests?status=open', icon: Hourglass },
    { label: 'Awaiting acceptance', value: t?.awaitingAcceptance, to: '/work-orders?status=awaiting_acceptance', icon: HardHat },
    { label: 'In progress', value: t?.inProgress, to: '/work-orders?status=scheduled,in_progress', icon: Wrench },
    { label: 'Awaiting approval', value: t?.awaitingApproval, to: '/work-orders?status=awaiting_approval', icon: Clock },
    { label: 'Completed', value: t?.awaitingReview, to: '/work-orders?status=completed', icon: CheckCircle2, note: t ? `to review · ${t.closedThisPeriod} closed` : undefined },
    { label: 'Overdue', value: t?.overdue, to: '#at-risk', icon: AlertTriangle, bad: Boolean(t?.overdue), note: t?.overdue ? 'see At risk' : undefined },
  ];
  return (
    <section className="tiles" aria-label="Key numbers">
      {tiles.map(({ label, value, to, icon: Icon, bad, note }) => {
        const body = (
          <>
          <span className="f-label">
            <Icon size={12} aria-hidden />
            {label}
          </span>
          {value === undefined ? <Skeleton h={30} w={48} style={{ marginTop: 6 }} /> : <b className={bad ? 'bad' : undefined}>{value}</b>}
          {note && <small>{note}</small>}
          </>
        );
        return to.startsWith('#') ? (
          <a key={label} href={to} className="tile">
            {body}
          </a>
        ) : (
          <Link key={label} to={to} className="tile">
            {body}
          </Link>
        );
      })}
    </section>
  );
}

function Queue({ q }: { q: D['queue'] | undefined }) {
  if (!q)
    return (
      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {[0, 1, 2, 3].map((i) => (
          // Close to a real column (band + 420px list), so the queue doesn't push the tiles down when it arrives.
          <Skeleton key={i} h={440} />
        ))}
      </div>
    );
  const cols: { party: Party; items: (RowData & { id: string })[] }[] = [
    { party: 'pm', items: q.you.map(woItem) },
    { party: 'vendor', items: q.vendor.map(woItem) },
    { party: 'owner', items: q.owner.map(woItem) },
    { party: 'tenant', items: q.tenant.map((r) => ({ id: r.id, refNo: r.ref, to: `/requests/${r.id}`, title: r.title, sub: 'Answering your question', hours: r.waitedHours })) },
  ];
  return (
    <section className="stack-sm" aria-label="Waiting on">
      {q.atRisk.length > 0 && (
        <div className="box risk lift" id="at-risk">
          <div className="band risk">
            <AlertTriangle size={15} /> At risk <span className="n">{q.atRisk.length}</span>
            <span className="since">past SLA or slow to accept</span>
          </div>
          <ul className="rows" style={{ maxHeight: 420, overflowY: 'auto' }}>
            {q.atRisk.map((w) => (
              <li key={w.id}>
                <QueueRow {...woItem(w)} party={w.waitingOn} late />
              </li>
            ))}
          </ul>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        {cols.map((c) => (
          <div key={c.party} className="box lift" style={{ display: 'flex', flexDirection: 'column', containerType: 'inline-size' }}>
            <div className={`band ${c.party === 'pm' ? 'you' : c.party}`}>
              Waiting on {PARTY_LABEL[c.party].toLowerCase()} <span className="n">{c.items.length}</span>
              {c.items[0] && <span className="since"><span className="k">oldest </span>{duration(Math.max(...c.items.map((i) => i.hours)))}</span>}
            </div>
            {c.items.length === 0 ? (
              <Empty icon={CheckCircle2} title={c.party === 'pm' ? 'Your copy is clear' : 'Nothing waiting'} />
            ) : (
              <ul className="rows" style={{ maxHeight: 420, overflowY: 'auto' }}>
                {[...c.items].sort((a, b) => b.hours - a.hours).map((i) => (
                  <li key={i.id}>
                    <QueueRow {...i} party={c.party} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

const woItem = (w: QueueItem) => ({
  id: w.id,
  refNo: w.ref,
  to: `/work-orders/${w.id}`,
  title: w.description,
  sub: [`${w.address}${w.unitLabel === 'Main' ? '' : ` #${w.unitLabel}`}`, w.vendorName].filter(Boolean).join(' · '),
  hours: w.waitedHours,
  step: nextStep(w),
  prio: w.priority,
});

interface RowData {
  refNo: string;
  to: string;
  title: string;
  sub: string;
  hours: number;
  step?: string;
  prio?: QueueItem['priority'];
}

function QueueRow({ refNo, to, title, sub, hours, step, prio, late }: RowData & { party: Party | null; late?: boolean }) {
  return (
    <Link to={to} className="row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'start' }}>
      <div className="min0 stack-sm" style={{ gap: 3 }}>
        <div className="hstack" style={{ gap: 8 }}>
          <RefTag refNo={refNo} />
          {prio && prio !== 'normal' && <Prio p={prio} />}
        </div>
        <span className="row-title">{title}</span>
        <span className="row-sub">{sub}</span>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className={late ? 'num late' : 'num'} title="Time waited in this state">
          {duration(hours)}
        </div>
        {step && <div className="small muted">{step}</div>}
      </div>
    </Link>
  );
}

function FirstRun({ slug }: { slug: string }) {
  const toast = useToast();
  const intake = `${location.origin}/r/${slug}`;
  return (
    <Box title="Get live in an afternoon" lift>
      <ol className="rows">
        {[
          { icon: Building2, title: 'Add an owner and a property', body: 'Owners hold approval thresholds; units are created for you.', action: <ButtonLink to="/properties?new=1" variant="primary" size="sm">Add property</ButtonLink> },
          { icon: HardHat, title: 'Add your vendors', body: 'Send each one a link to confirm details and upload their insurance.', action: <ButtonLink to="/vendors?new=1" size="sm">Add vendor</ButtonLink> },
          {
            icon: Link2,
            title: 'Share your tenant request link',
            body: intake,
            action: (
              <button type="button" className="btn sm" onClick={() => navigator.clipboard.writeText(intake).then(() => toast('Request link copied'))}>
                <Copy size={14} /> Copy link
              </button>
            ),
          },
        ].map(({ icon: Icon, title, body, action }) => (
          <li key={title} className="row" style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto' }}>
            <Icon size={20} aria-hidden style={{ color: 'var(--ballpoint)' }} />
            <div className="min0">
              <div className="strong">{title}</div>
              <div className="row-sub">{body}</div>
            </div>
            {action}
          </li>
        ))}
      </ol>
    </Box>
  );
}
