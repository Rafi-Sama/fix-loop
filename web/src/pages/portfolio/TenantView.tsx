import { ChevronRight, Inbox, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Box, Button, ButtonLink, Empty, Fields, LoadError, RefTag, ReqStamp } from '../../components/ui';
import { date, OCCUPANCY_LABEL, phone, relative } from '../../lib/format';
import { useTenant } from '../../lib/queries';
import { DetailSkeleton } from '../requests/RequestView';
import { TenantDialog } from './forms';

export default function TenantView() {
  const { id = '' } = useParams();
  const q = useTenant(id);
  const [editing, setEditing] = useState(false);
  const t = q.data;
  if (q.isError) return <LoadError error={q.error} retry={() => q.refetch()} />;
  if (!t) return <DetailSkeleton />;

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/tenants">Tenants</Link>
        <ChevronRight size={13} />
        <span>{t.name}</span>
      </nav>
      <div className="page-head">
        <div>
          <h1>{t.name}</h1>
          <p className="sub">
            {OCCUPANCY_LABEL[t.occupancyStatus]} tenant · on file since {date(t.createdAt)}
          </p>
        </div>
        <div className="actions">
          <Button icon={Pencil} onClick={() => setEditing(true)}>
            Edit
          </Button>
          {t.occupancyStatus !== 'past' && (
            <ButtonLink to={`/requests/new?tenantId=${t.id}&unitId=${t.unitId}`} variant="primary" icon={Plus}>
              Log request for them
            </ButtonLink>
          )}
        </div>
      </div>
      <div className="grid-main">
        <Box title="Requests" meta={`${t.requests.length}`} flush lift>
          {t.requests.length === 0 ? (
            <Empty icon={Inbox} title="No requests yet" />
          ) : (
            <ul className="rows">
              {t.requests.map((r) => (
                <li key={r.id}>
                  <Link to={`/requests/${r.id}`} className="row" style={{ gridTemplateColumns: '128px minmax(0,1fr) auto auto' }}>
                    <RefTag refNo={r.ref} />
                    <span className="row-title">{r.title}</span>
                    <ReqStamp s={r.status} />
                    <span className="small muted hide-sm">{relative(r.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Box>
        <Box title="Contact" tone="tenant" flush>
          <Fields
            cols={1}
            items={[
              { label: 'Email', value: t.email && <a href={`mailto:${t.email}`}>{t.email}</a> },
              { label: 'Mobile', value: t.phone && <a href={`tel:${t.phone}`}>{phone(t.phone)}</a> },
              { label: 'Text messages', value: t.smsConsentAt ? `Consented ${date(t.smsConsentAt)}` : 'No consent on file' },
              { label: 'PMS ID', value: t.externalId },
            ]}
          />
        </Box>
      </div>
      {editing && <TenantDialog tenant={t} onClose={() => setEditing(false)} />}
    </>
  );
}
