import { Building2, ClipboardList, Inbox, LogOut, Menu, Plus, Settings as SettingsIcon, User, Users, BarChart3, Wrench, X, HardHat, Briefcase } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { ButtonLink } from '../components/ui';
import { signOut } from '../lib/session';
import { initials } from '../lib/format';
import { useDashboardDays } from '../lib/prefs';
import { useDashboard, useUser } from '../lib/queries';

export const PRODUCT_NAME = 'Fixloop';


export function AppShell({ children }: { children: ReactNode }) {
  const me = useUser();
  // Same period (and so the same cached query) as the dashboard page: one poll, not two.
  const dash = useDashboard(useDashboardDays());
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  const q = dash.data?.queue;
  const atRisk = q?.atRisk.length ?? 0;
  const openJobs = q ? q.atRisk.length + q.you.length + q.vendor.length + q.owner.length : null;

  const links: { to: string; label: string; icon: typeof Inbox; end?: boolean; badge?: number }[] = [
    { to: '/', label: 'Waiting on', icon: Inbox, end: true, badge: atRisk || undefined },
    { to: '/requests', label: 'Requests', icon: ClipboardList },
    { to: '/work-orders', label: 'Work orders', icon: Wrench },
    { to: '/properties', label: 'Properties', icon: Building2 },
    { to: '/owners', label: 'Owners', icon: Briefcase },
    { to: '/tenants', label: 'Tenants', icon: Users },
    { to: '/vendors', label: 'Vendors', icon: HardHat },
    { to: '/reports', label: 'Reports', icon: BarChart3 },
  ];

  return (
    <>
      <a href="#main" className="sr-only">
        Skip to content
      </a>
      <header className="topbar">
        <button type="button" className="icon-btn menu-toggle" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
        <Link to="/" className="brand" aria-label={`${PRODUCT_NAME} home`}>
          <span className="brand-mark" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          {PRODUCT_NAME.toUpperCase()}
        </Link>
        <nav className={open ? 'nav open' : 'nav'} aria-label="Main">
          {links.map(({ to, label, icon: Icon, end, badge }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : undefined)} onClick={() => setOpen(false)}>
              <Icon size={15} aria-hidden />
              {label}
              {badge ? (
                <span className="count">
                  {badge}
                  <span className="sr-only"> at risk</span>
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-end">
          {openJobs !== null && (
            <span className="serial-counter" title="Open work orders">
              OPEN No. {String(openJobs).padStart(3, '0')}
            </span>
          )}
          <span className="no-print" style={{ display: 'contents' }}>
            <ButtonLink to="/requests/new" variant="primary" size="sm" icon={Plus}>
              <span className="btn-label">New request</span>
            </ButtonLink>
          </span>
          <UserMenu name={me.name} email={me.email} org={me.org.name} role={me.role} />
        </div>
      </header>
      <main id="main" className="page">
        {children}
      </main>
    </>
  );
}

function UserMenu({ name, email, org, role }: { name: string; email: string; org: string; role: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', off);
    document.addEventListener('keydown', off);
    return () => {
      document.removeEventListener('mousedown', off);
      document.removeEventListener('keydown', off);
    };
  }, [open]);


  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="icon-btn" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" style={{ width: 'auto' }}>
        <span className="avatar">{initials(name)}</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="who">
            <div className="strong">{name}</div>
            <div className="small muted">{email}</div>
            <div className="small muted">
              {org} · {role === 'admin' ? 'Admin' : 'Manager'}
            </div>
          </div>
          <Link role="menuitem" to="/settings/account" onClick={() => setOpen(false)}>
            <User size={15} /> Account & security
          </Link>
          <Link role="menuitem" to="/settings" onClick={() => setOpen(false)}>
            <SettingsIcon size={15} /> Firm settings
          </Link>
          <button type="button" role="menuitem" onClick={() => signOut(nav)}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
