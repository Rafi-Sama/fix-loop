import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { PRODUCT_NAME } from '../../layouts/AppShell';

type Holder = 'you' | 'vendor' | 'owner' | 'none';
const STEPS = ['Draft', 'Accept', 'Quote', 'Approval', 'Book time', 'Scheduled', 'In progress', 'Review', 'Closed'];
/** One repair, the same one the landing page follows, as the states its work order passes through. */
const STORY: { holder: Holder; step: number; clock: string; since: string; note: string }[] = [
  { holder: 'you', step: 0, clock: '00:07', since: '7m in this step', note: 'Sam reported it from his phone, with a photo.' },
  { holder: 'vendor', step: 1, clock: '00:16', since: '9m in this step', note: 'Rivera Plumbing has the job link. No login.' },
  { holder: 'owner', step: 3, clock: '00:53', since: '14m in this step', note: 'The $640 quote is with Margaret. One tap to approve.' },
  { holder: 'vendor', step: 4, clock: '00:59', since: '6m in this step', note: 'Approved. Luis is booking a time with Sam.' },
  { holder: 'you', step: 7, clock: '26:28', since: '22m in this step', note: 'Fixed, photo attached. Yours to review and close.' },
  { holder: 'none', step: 8, clock: '26:50', since: 'door to door', note: 'Closed. Nobody chased anybody.' },
];
const WAIT: Record<Holder, string> = { you: 'Waiting on you', vendor: 'Waiting on vendor', owner: 'Waiting on owner', none: 'Closed' };

/** Split screen. The left side plays one work order changing hands, which is the whole product in six frames. */
export function AuthFrame({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  const [i, setI] = useState(1);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI((n) => (n + 1) % STORY.length), 3600);
    return () => clearInterval(t);
  }, []);
  const s = STORY[i]!;
  const next = STORY[(i + 1) % STORY.length]!;

  return (
    <div className="auth">
      <aside className="auth-art">
        <Link to="/" className="brand" aria-label={`${PRODUCT_NAME} home`}>
          <span className="brand-mark" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          {PRODUCT_NAME.toUpperCase()}
        </Link>

        <div className="aa-stage" aria-hidden>
          <div className="aa-pad">
            {/* the copies still on the pad: the next holder's colour shows underneath */}
            <i className={`aa-under u2 ${STORY[(i + 2) % STORY.length]!.holder}`} />
            <i className={`aa-under u1 ${next.holder}`} />
            <div className="aa-sheet" key={i}>
              <div className="aa-head">
                <span className="tag">WO-2026-023</span>
                <span className="aa-clock">{s.clock}</span>
              </div>
              <div className="aa-title">Leak under the kitchen sink</div>
              <div className="aa-sub">402 Oak St #A · Rivera Plumbing</div>
              <div className={`band ${s.holder === 'none' ? '' : s.holder} aa-band`}>
                {WAIT[s.holder]}
                <span className="since">{s.since}</span>
              </div>
              <p className="aa-note">{s.note}</p>
              <ol className="pipe aa-pipe">
                {STEPS.map((label, n) => (
                  <li key={label} className={`pipe-step ${n < s.step ? 'done' : ''} ${n === s.step ? `now ${s.holder}` : ''}`}>
                    {label}
                  </li>
                ))}
              </ol>
              {s.holder === 'none' && <span className="aa-stamp">Closed</span>}
            </div>
          </div>
          <ol className="aa-dots">
            {STORY.map((x, n) => (
              <li key={x.clock} className={n === i ? `on ${x.holder}` : ''} />
            ))}
          </ol>
        </div>

        <div className="aa-foot">
          <blockquote>Stop chasing vendors. Every repair closes itself.</blockquote>
          <p>
            Only your team signs in. Vendors, tenants and owners act from a link. <Link to="/">See one repair, start to finish</Link>
          </p>
        </div>
      </aside>
      <div className="auth-form">
        <div className="stack">
          <div>
            <h1>{title}</h1>
            {sub && <p className="muted" style={{ marginTop: 6 }}>{sub}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
