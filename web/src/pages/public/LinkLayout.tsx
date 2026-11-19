import { Phone, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { PRODUCT_NAME } from '../../layouts/AppShell';
import { phone as fmtPhone } from '../../lib/format';

/** Phone-first frame for every no-login page: firm name on top, optional emergency strip, narrow column. */
export function LinkLayout({ org, emergencyPhone, children, emergency = false }: { org?: string; emergencyPhone?: string | null; children: ReactNode; emergency?: boolean }) {
  return (
    <div className="link-page">
      <header className="link-head">
        <div className="org">{org ?? '\u00a0'}</div>
        <div className="powered">Maintenance by {PRODUCT_NAME}</div>
      </header>
      {emergency && (
        <div className="emergency-bar" role="note">
          <ShieldAlert size={16} style={{ flex: 'none', marginTop: 1 }} />
          <span>
            Emergency? If anyone is in danger call <a href="tel:911">911</a>. Smell gas? Leave and call your gas utility.
            {emergencyPhone && (
              <>
                {' '}
                Then call{' '}
                <a href={`tel:${emergencyPhone}`}>
                  <Phone size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> {fmtPhone(emergencyPhone)}
                </a>
                .
              </>
            )}
          </span>
        </div>
      )}
      <main className="link-body">{children}</main>
    </div>
  );
}

export function LinkMessage({ icon: Icon, title, children, ok }: { icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; title: string; children?: ReactNode; ok?: boolean }) {
  return (
    <div className="box lift">
      <div className={ok ? 'empty ok' : 'empty'}>
        <Icon size={40} strokeWidth={1.4} />
        <h1 style={{ fontSize: 20 }}>{title}</h1>
        {children && <div style={{ maxWidth: '40ch' }}>{children}</div>}
      </div>
    </div>
  );
}
