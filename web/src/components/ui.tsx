import { AlertTriangle, ArrowDown, ArrowUp, CircleAlert, Info, Loader2, Minus, Search as SearchIcon, type LucideIcon } from 'lucide-react';
import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router';
import {
  COMPLIANCE_LABEL,
  PARTY_LABEL,
  PRIORITY_LABEL,
  REQUEST_STATUS_LABEL,
  WO_STATUS_LABEL,
  type Compliance,
  type Party,
  type Priority,
  type RequestStatus,
  type WoStatus,
} from '../lib/format';

// ---------------------------------------------------------------- buttons

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'danger' | 'danger solid' | 'ghost';
  size?: 'sm' | 'lg';
  block?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
};

export function Button({ variant, size, block, loading, icon: Icon, children, className, disabled, type = 'button', ...rest }: BtnProps) {
  const cls = ['btn', variant, size, block && 'block', className].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 size={15} className="spin" /> : Icon ? <Icon size={15} /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({ to, variant, size, icon: Icon, children }: { to: string; variant?: BtnProps['variant']; size?: BtnProps['size']; icon?: LucideIcon; children: ReactNode }) {
  return (
    <Link to={to} className={['btn', variant, size].filter(Boolean).join(' ')}>
      {Icon && <Icon size={15} />}
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------- form controls

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  className?: string;
  children: (id: string, describedBy: string | undefined, invalid: boolean) => ReactNode;
}

export function Field({ label, hint, error, optional, className, children }: FieldProps) {
  const id = useId();
  const desc = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={['field', className].filter(Boolean).join(' ')}>
      <label className="lbl" htmlFor={id}>
        <span>{label}</span>
        {optional && <span className="opt">Optional</span>}
      </label>
      {children(id, desc, Boolean(error))}
      {error ? (
        <span className="err" id={`${id}-err`} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

type Common = { label: ReactNode; hint?: ReactNode; error?: string | null; optional?: boolean; className?: string };

export const TextField = ({ label, hint, error, optional, className, ...rest }: Common & InputHTMLAttributes<HTMLInputElement>) => (
  <Field label={label} hint={hint} error={error} optional={optional} className={className}>
    {(id, d, bad) => <input id={id} className="input" aria-describedby={d} aria-invalid={bad || undefined} {...rest} />}
  </Field>
);

export const MoneyField = ({ label, hint, error, optional, className, ...rest }: Common & InputHTMLAttributes<HTMLInputElement>) => (
  <Field label={label} hint={hint} error={error} optional={optional} className={className}>
    {(id, d, bad) => (
      <div className="input-affix">
        <span>$</span>
        <input id={id} className="input" inputMode="decimal" placeholder="0.00" aria-describedby={d} aria-invalid={bad || undefined} {...rest} />
      </div>
    )}
  </Field>
);

export const TextArea = ({ label, hint, error, optional, className, ...rest }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <Field label={label} hint={hint} error={error} optional={optional} className={className}>
    {(id, d, bad) => <textarea id={id} className="textarea" aria-describedby={d} aria-invalid={bad || undefined} {...rest} />}
  </Field>
);

export const SelectField = ({ label, hint, error, optional, className, children, ...rest }: Common & SelectHTMLAttributes<HTMLSelectElement>) => (
  <Field label={label} hint={hint} error={error} optional={optional} className={className}>
    {(id, d, bad) => (
      <select id={id} className="select" aria-describedby={d} aria-invalid={bad || undefined} {...rest}>
        {children}
      </select>
    )}
  </Field>
);

export const Check = ({ label, hint, ...rest }: { label: ReactNode; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) => (
  <label className="check">
    <input type="checkbox" {...rest} />
    <span>
      {label}
      {hint && <span className="muted small" style={{ display: 'block' }}>{hint}</span>}
    </span>
  </label>
);

export function Search({ value, onChange, placeholder, label = 'Search' }: { value: string; onChange: (v: string) => void; placeholder: string; label?: string }) {
  return (
    <div className="search">
      <SearchIcon size={15} />
      <input className="input" type="search" aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <fieldset className="seg" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}

// ---------------------------------------------------------------- the pad

export function Box({ title, meta, actions, tone, lift, flush, children, className, id }: { title?: ReactNode; meta?: ReactNode; actions?: ReactNode; tone?: Party | 'you' | 'risk'; lift?: boolean; flush?: boolean; children: ReactNode; className?: string; id?: string }) {
  const toneCls = tone === 'pm' ? 'you' : tone;
  return (
    <section className={['box', toneCls, lift && 'lift', className].filter(Boolean).join(' ')} id={id} aria-label={typeof title === 'string' ? title : undefined}>
      {(title || actions) && (
        <header className="box-head">
          <div className="hstack">
            {title && <h2>{title}</h2>}
            {meta && <span className="meta">{meta}</span>}
          </div>
          {actions && <div className="hstack">{actions}</div>}
        </header>
      )}
      <div className={flush ? 'box-body flush' : 'box-body'}>{children}</div>
    </section>
  );
}

export function Fields({ cols = 2, items }: { cols?: number; items: ({ label: string; value: ReactNode; wide?: boolean } | false | null | undefined)[] }) {
  return (
    <div className="fields" style={{ ['--cols' as string]: cols }}>
      {items.filter(Boolean).map((f) => {
        const it = f as { label: string; value: ReactNode; wide?: boolean };
        const empty = it.value === null || it.value === undefined || it.value === '';
        return (
          <div key={it.label} className={it.wide ? 'f wide' : 'f'}>
            <span className="f-label">{it.label}</span>
            <div className={empty ? 'f-value muted' : 'f-value'}>{empty ? '—' : it.value}</div>
          </div>
        );
      })}
    </div>
  );
}

export const RefTag = ({ refNo, to }: { refNo: string; to?: string }) =>
  to ? (
    <Link className="tag" to={to}>
      {refNo}
    </Link>
  ) : (
    <span className="tag">{refNo}</span>
  );

export const PartyChip = ({ party, label }: { party: Party | null; label?: string }) => (
  <span className={`party ${party === 'pm' ? 'you' : (party ?? 'none')}`}>
    <i aria-hidden />
    {label ?? (party ? PARTY_LABEL[party] : 'Nobody')}
  </span>
);

const PRIO_ICON: Record<Priority, LucideIcon> = { emergency: AlertTriangle, high: ArrowUp, normal: Minus, low: ArrowDown };
export function Prio({ p }: { p: Priority }) {
  const Icon = PRIO_ICON[p];
  return (
    <span className={`prio ${p}`}>
      <Icon size={13} aria-hidden />
      {PRIORITY_LABEL[p]}
    </span>
  );
}

const woTone = (s: WoStatus) => (s === 'closed' ? 'done' : s === 'cancelled' ? 'dead' : s === 'completed' ? 'warn' : '');
export const WoStamp = ({ s }: { s: WoStatus }) => <span className={`stamp ${woTone(s)}`}>{WO_STATUS_LABEL[s]}</span>;

const reqTone = (s: RequestStatus) => (s === 'resolved' ? 'done' : s === 'closed' || s === 'cancelled' ? 'dead' : s === 'needs_info' ? 'warn' : s === 'new' ? 'bad' : '');
export const ReqStamp = ({ s }: { s: RequestStatus }) => <span className={`stamp ${reqTone(s)}`}>{REQUEST_STATUS_LABEL[s]}</span>;

const COMPLIANCE_TONE: Record<Compliance, string> = { ok: 'ok', expiring: 'warn', expired: 'bad', missing: 'bad' };
export const ComplianceBadge = ({ c }: { c: Compliance | undefined }) =>
  c ? <span className={`pill ${COMPLIANCE_TONE[c]}`}>{COMPLIANCE_LABEL[c]}</span> : null;

// ---------------------------------------------------------------- states

export function Empty({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon size={34} strokeWidth={1.4} aria-hidden />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export const Skeleton = ({ h = 14, w = '100%', style }: { h?: number; w?: number | string; style?: React.CSSProperties }) => <div className="skel" style={{ height: h, width: w, ...style }} aria-hidden />;

export function RowsSkeleton({ n = 6 }: { n?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="row" style={{ gridTemplateColumns: '120px 1fr 120px' }}>
          <Skeleton h={20} />
          <Skeleton h={14} w={`${60 + ((i * 17) % 35)}%`} />
          <Skeleton h={14} />
        </div>
      ))}
    </div>
  );
}

export function Notice({ tone, children, icon }: { tone?: 'warn' | 'bad' | 'ok'; children: ReactNode; icon?: LucideIcon }) {
  const Icon = icon ?? (tone === 'bad' || tone === 'warn' ? CircleAlert : Info);
  return (
    <div className={['notice', tone].filter(Boolean).join(' ')} role={tone === 'bad' ? 'alert' : undefined}>
      <Icon size={16} aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function LoadMore({ hasNext, loading, onMore }: { hasNext: boolean; loading: boolean; onMore: () => void }) {
  if (!hasNext) return null;
  return (
    <div className="load-more">
      <Button size="sm" onClick={onMore} loading={loading}>
        Load more
      </Button>
    </div>
  );
}

/** Full-page error with a retry, for a query that failed. */
export function LoadError({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong';
  return (
    <Empty icon={CircleAlert} title="Couldn’t load this" action={retry && <Button onClick={retry}>Try again</Button>}>
      {msg}
    </Empty>
  );
}
