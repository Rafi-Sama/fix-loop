import { ArrowDown, ArrowRight, Check, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { PRODUCT_NAME } from '../layouts/AppShell';
import '../landing.css';

/**
 * Marketing page for guests at `/`: one repair followed from the tenant's report to closed, on a running clock.
 * Every screenshot is the real app; regenerate them with `node scripts/landing-shots.mjs` (see that file).
 */

type Holder = 'tenant' | 'you' | 'vendor' | 'owner' | 'none';
const STEPS = ['Draft', 'Accept', 'Quote', 'Approval', 'Book time', 'Scheduled', 'In progress', 'Review', 'Closed'];
// Who holds the job at each pipe step (-1 = not a work order yet).
const HOLDER: Holder[] = ['you', 'vendor', 'vendor', 'owner', 'vendor', 'vendor', 'vendor', 'you', 'none'];
const WAIT: Record<Holder, string> = { tenant: 'Tenant reporting', you: 'Waiting on you', vendor: 'Waiting on vendor', owner: 'Waiting on owner', none: 'Closed' };
// Chapter starts: minutes since the report, and the pipe step the job is on.
const T = [0, 7, 16, 53, 59, 1610];
const S = [-1, 0, 1, 3, 4, 8];
const TOTAL = T[T.length - 1]!;

const img = (name: string) => `/landing/${name}.webp`;
const pad = (n: number) => String(n).padStart(2, '0');

function Phone({ src, h, alt, scrub, className = '' }: { src: string; h: number; alt: string; scrub?: boolean; className?: string }) {
  return (
    <figure className={`ph ${scrub ? 'scrub' : ''} ${className}`}>
      <img src={img(src)} width={780} height={h} alt={alt} loading="lazy" decoding="async" />
    </figure>
  );
}

function Sheet({ src, w = 2000, h, alt, ratio, scrub, className = '', eager }: { src: string; w?: number; h: number; alt: string; ratio: string; scrub?: boolean; className?: string; eager?: boolean }) {
  return (
    <figure className={`sh ${scrub ? 'scrub' : ''} ${className}`} style={{ aspectRatio: ratio }}>
      <img src={img(src)} width={w} height={h} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />
    </figure>
  );
}

function Chapter({ day, time, holder, band, wait, title, children, className = '' }: { day: string; time: string; holder: Exclude<Holder, 'none'>; band: string; wait?: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`ch ${className}`} data-ch>
      <div className="lp-wrap ch-grid">
        <div className="ch-rail">
          <time className="ch-time">
            <b>{day}</b> {time}
          </time>
        </div>
        <div className="ch-main" data-rv="ch">
          <div className={`band ${holder} lp-band`}>
            <span className="ch-time-inline">
              {day} {time}
            </span>
            {band}
            {wait && <span className="since">{wait}</span>}
          </div>
          <h2 data-rv="rise">{title}</h2>
          {children}
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(-1);
  const [strip, setStrip] = useState(false);
  const holder: Holder = step < 0 ? 'tenant' : HOLDER[step]!;

  useEffect(() => {
    const el = root.current!;
    document.title = `${PRODUCT_NAME}: every repair has an owner, a clock and a one-tap link`;
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!calm) el.classList.add('anim');
    const chapters = [...el.querySelectorAll<HTMLElement>('[data-ch]')];
    const scrubs = [...el.querySelectorAll<HTMLElement>('.scrub')];
    const clocks = [...el.querySelectorAll<HTMLElement>('[data-clock]')];
    const here = el.querySelector<HTMLElement>('[data-here]');
    const hero = el.querySelector<HTMLElement>('.hero-clock')!;
    const story = el.querySelector<HTMLElement>('.story')!;
    const born = Date.now();
    let minutes = 0;

    const paintClock = () => {
      const secs = Math.floor((Date.now() - born) / 1000);
      const text = `${pad(Math.floor(minutes / 60))}:${pad(Math.floor(minutes % 60))}:${pad(minutes >= TOTAL ? 0 : secs % 60)}`;
      for (const c of clocks) c.textContent = text;
      if (here) here.textContent = secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${pad(secs % 60)}s`;
    };

    let frame = 0;
    const measure = () => {
      frame = 0;
      const vh = innerHeight;
      const anchor = vh * 0.45;
      let m = 0;
      let s = -1;
      chapters.forEach((c, i) => {
        const r = c.getBoundingClientRect();
        if (r.top > anchor) return;
        const p = Math.min(1, Math.max(0, (anchor - r.top) / r.height));
        const next = i + 1 < T.length ? i + 1 : i;
        m = T[i]! + (T[next]! - T[i]!) * p;
        s = Math.floor(S[i]! + (S[next]! - S[i]!) * p);
      });
      minutes = m;
      setStep(s);
      const sr = story.getBoundingClientRect();
      setStrip(hero.getBoundingClientRect().bottom < 60 && sr.bottom > vh * 0.5);
      paintClock();
      if (calm) return;
      for (const b of scrubs) {
        const r = b.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) continue;
        const pic = b.firstElementChild as HTMLElement;
        // Scroll the long screenshot inside its frame while the frame crosses the middle of the viewport.
        const p = Math.min(1, Math.max(0, (vh * 0.8 - r.top) / (vh * 0.75)));
        pic.style.transform = `translate3d(0, ${-p * Math.max(0, pic.offsetHeight - b.clientHeight)}px, 0)`;
      }
    };
    const onScroll = () => {
      frame ||= requestAnimationFrame(measure);
    };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    const tick = setInterval(paintClock, 1000);
    measure();

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -14% 0px', threshold: 0 },
    );
    for (const n of el.querySelectorAll('[data-rv]')) io.observe(n);

    return () => {
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
      clearInterval(tick);
      cancelAnimationFrame(frame);
      io.disconnect();
    };
  }, []);

  return (
    <div className="lp" ref={root}>
      <a href="#story" className="sr-only">
        Skip to the repair
      </a>
      <header className="topbar lp-nav">
        <Link to="/" className="brand" aria-label={`${PRODUCT_NAME} home`}>
          <span className="brand-mark" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          {PRODUCT_NAME.toUpperCase()}
        </Link>
        <nav aria-label="Page">
          <a href="#story">The repair</a>
          <a href="#queue">The queue</a>
          <a href="#gate">Insurance gate</a>
          <a href="#reports">Reports</a>
          <a href="#questions">Questions</a>
        </nav>
        <Link to="/login" className="lp-signin">
          Sign in
        </Link>
        <Link to="/signup" className="btn primary">
          Set up your firm
        </Link>
      </header>

      {/* The job strip: the app's own tag, pipe and clock, advancing as the story scrolls. */}
      <div className={`strip ${strip ? 'on' : ''}`} aria-hidden>
        <span className="tag">{step < 0 ? 'MR-2026-030' : 'WO-2026-023'}</span>
        <ol className="pipe">
          {STEPS.map((s, i) => (
            <li key={s} className={`pipe-step ${i < step ? 'done' : ''} ${i === step ? `now ${holder}` : ''}`}>
              {s}
            </li>
          ))}
        </ol>
        <span className={`party ${holder}`}>
          <i />
          {WAIT[holder]}
        </span>
        <span className="strip-clock" data-clock>
          00:00:00
        </span>
      </div>

      <main>
        {/* ------------------------------------------------ hero */}
        <section className="hero">
          <div className="lp-wrap ch-grid">
            <div className="ch-rail">
              <time className="ch-time now">
                <b>WED</b> 8:12 AM
              </time>
            </div>
            <div className="hero-main">
              <div className="hero-copy">
                <p className="hero-clock" aria-hidden>
                  <span data-clock>00:00:00</span>
                </p>
                <h1>A sink starts leaking. Nobody chases anybody.</h1>
                <p className="lede">
                  {PRODUCT_NAME} gives every repair an owner, a clock and a one-tap link. Vendors, tenants and owners act from an email. Only you have a login.
                </p>
                <div className="hero-cta">
                  <Link to="/signup" className="btn primary lg">
                    Set up your firm <ArrowRight size={16} />
                  </Link>
                  <a href="#story" className="btn lg">
                    Follow the repair <ArrowDown size={16} />
                  </a>
                </div>
                <p className="hero-note">For residential firms with 50 to 300 doors. It works beside the property software you already use.</p>
              </div>
              <div className="hero-art">
                <Sheet src="pm-request" h={1796} ratio="2000 / 1300" alt="The request in the manager's workspace: Leak under the kitchen sink, reported 7 minutes ago through the request link, with the tenant's photo." eager className="hero-sheet" />
                <figure className="ph hero-phone">
                  <img src={img('tenant-intake-category')} width={780} height={1688} alt="The tenant's phone: Report a maintenance issue, with the emergency number on top and a list of categories." />
                </figure>
                <span className="lp-stamp hero-stamp">Waiting on you</span>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ the repair */}
        <div className="story" id="story">
          <Chapter day="WED" time="8:12 AM" holder="tenant" band="Tenant" wait="no app, no account" title="Sam reports it from his phone.">
            <div className="lay lay-a">
              <div className="prose" data-rv="rise">
                <p>
                  He opens the link on his building’s notice, picks Plumbing, and types two sentences. The form asks for a photo and when he’s home, because those are the two things a plumber phones to ask.
                </p>
                <ul className="ticks">
                  <li>The 911 and gas-leak line stays on top of every screen, with your emergency number.</li>
                  <li>Safe fixes come first: a tripped breaker or a jammed disposal gets a short checklist before a request is sent.</li>
                  <li>Words like “flooding” or “sparks” flag the request as an emergency for you.</li>
                </ul>
              </div>
              <div className="duo" data-rv="rise">
                <Phone src="tenant-intake" h={3726} scrub alt="The tenant request form filled in: title, description, urgency, a photo of the leaking valve, availability and permission to enter." />
              </div>
            </div>
          </Chapter>

          <Chapter day="WED" time="8:19 AM" holder="you" band="Waiting on you" wait="7 min in this step" title="Dana turns it into a work order.">
            <div className="lay lay-b">
              <div className="prose" data-rv="rise">
                <p>
                  The request lands in her queue with the photo, the access notes and a clock that started when Sam hit send. One click converts it. The vendor list shows who covers Round Rock and whose insurance is current.
                </p>
              </div>
              <div className="stack-art" data-rv="rise">
                <Sheet src="pm-request" h={1796} ratio="2000 / 1180" alt="The request page: issue, photo, triage, access details and a Convert to work order button." />
                <Sheet src="pm-assign" w={1524} h={1404} ratio="1524 / 1404" className="over" alt="Assign a vendor dialog with Rivera Plumbing selected and marked Compliant; other vendors show Expired or Expiring insurance." />
              </div>
            </div>
          </Chapter>

          <Chapter day="WED" time="8:28 AM" holder="vendor" band="Waiting on vendor" wait="9 min in this step" title="Luis accepts between jobs.">
            <div className="lay lay-c">
              <div className="duo two" data-rv="rise">
                <Phone src="vendor-new-job" h={1964} alt="The vendor's link: new job, Accept job and Can't take it buttons, the address, the description and the tenant's photo." />
                <Phone src="vendor-quote" h={2526} scrub className="lower" alt="The same link after accepting: Send quote, plus the tenant's name, availability and access notes." />
              </div>
              <div className="prose" data-rv="rise">
                <p>
                  Rivera Plumbing gets one link. It opens to the job, the address and Sam’s photo, with two buttons. Sam’s name and door instructions appear only after Luis accepts.
                </p>
                <p>
                  Nineteen minutes later he sends a quote from the same link: <b>$640</b> for both valves, the supply lines and the swollen cabinet floor.
                </p>
                <ul className="ticks">
                  <li>No answer? {PRODUCT_NAME} reminds him, then moves the job to your At risk list.</li>
                  <li>If he phones you instead, you accept on his behalf and the timeline says so.</li>
                </ul>
                <Sheet src="pm-wo-waiting-vendor" h={2814} ratio="2000 / 760" className="flat" alt="The work order in the manager's workspace: Waiting on vendor, 9 minutes in this step, with Resend link and Unassign." />
              </div>
            </div>
          </Chapter>

          <Chapter day="WED" time="9:05 AM" holder="owner" band="Waiting on owner" wait="14 min in this step" title="Margaret approves in one tap." className="field owner">
            <div className="lay lay-d">
              <div className="prose" data-rv="rise">
                <p>
                  $640 is over the $500 limit Margaret set, so the job stops and asks her. Her email shows the leak, Sam’s photo, the quote and three buttons. She has no portal to log into and nothing to install.
                </p>
                <p>Under her limit, the job would have skipped this step. Each owner has their own number.</p>
                <p className="quote-fig" aria-hidden>
                  <s>$640.00</s>
                  <span className="lp-stamp ok" data-rv="thunk">
                    Approved
                  </span>
                </p>
              </div>
              <div className="duo" data-rv="rise">
                <Phone src="owner-approve" h={1916} scrub alt="The owner's link: Approve a repair, quote from Rivera Plumbing for $640.00, the issue with its photo, and Approve, Call me first and Decline buttons." />
              </div>
            </div>
          </Chapter>

          <Chapter day="WED" time="9:11 AM" holder="vendor" band="Waiting on vendor" wait="6 min, then overnight" title="Luis books Thursday, 9 to 11. Then he fixes it.">
            <div className="lay lay-e">
              <div className="trio" data-rv="rise">
                <Phone src="vendor-schedule" h={2744} alt="The vendor's link after approval: Approved, book a time with the tenant, with the approved amount." />
                <Phone src="tenant-scheduled" h={1688} className="lower" alt="The tenant's tracking link: appointment Thursday 9:00 to 11:00 AM, with a This time doesn't work button." />
                <Phone src="vendor-in-progress" h={3082} scrub alt="The vendor's link during the job: Mark complete and Need approval for more work." />
              </div>
              <div className="prose cols" data-rv="rise">
                <p>
                  The approval reaches Luis with the amount. He picks a window. Sam sees it on his own link and can say it doesn’t work, which is the phone call you no longer referee.
                </p>
                <p>
                  Thursday at 10:40 the new valves are in. Luis marks the job complete from the driveway: a photo, the invoice amount, two lines of notes. If he’d found more damage, the same link asks for approval before he does the extra work.
                </p>
              </div>
            </div>
          </Chapter>

          <Chapter day="THU" time="11:02 AM" holder="you" band="Waiting on you" wait="22 min in this step" title="Dana checks the photo and closes it.">
            <div className="lay lay-f">
              <div className="stack-art" data-rv="rise">
                <Sheet src="pm-wo-closed" h={3972} ratio="2000 / 1500" scrub alt="The closed work order: quote, approval history, completion photo and the full timeline of every action and every email sent." />
                <Phone src="tenant-confirm" h={1688} className="over-phone" alt="The tenant's link after closing: Was it fixed? Yes, fixed or Not fixed." />
                <span className="lp-stamp ok closed-stamp" data-rv="thunk">
                  Closed
                </span>
              </div>
              <div className="prose" data-rv="rise">
                <p>
                  The invoice matches the approved quote, so closing is one click. The expense is recorded for the owner’s statement and Sam is asked whether it’s fixed.
                </p>
                <p>The timeline keeps every hand-off and every message, with who did it and when. That’s the record you want the next time an owner asks why something took a week.</p>
              </div>
            </div>
          </Chapter>
        </div>

        {/* ------------------------------------------------ the slip */}
        <section className="slip-sec">
          <div className="lp-wrap">
            <div className="slip" data-rv="rise">
              <div className="slip-head">
                <span className="tag">WO-2026-023</span>
                <h2>Leak under the kitchen sink</h2>
                <span className="lp-stamp ok sm">Closed</span>
              </div>
              <dl className="slip-grid">
                <div>
                  <dt>Reported</dt>
                  <dd>Wed 8:12 AM</dd>
                </div>
                <div>
                  <dt>Closed</dt>
                  <dd>Thu 11:02 AM</dd>
                </div>
                <div className="big">
                  <dt>Door to door</dt>
                  <dd>26h 50m</dd>
                </div>
                <div>
                  <dt>Hand-offs</dt>
                  <dd>6</dd>
                </div>
                <div>
                  <dt>Emails {PRODUCT_NAME} sent</dt>
                  <dd>19</dd>
                </div>
                <div>
                  <dt>Emails Dana wrote</dt>
                  <dd>0</dd>
                </div>
                <div>
                  <dt>Accounts for Sam, Luis and Margaret</dt>
                  <dd>0</dd>
                </div>
              </dl>
              <p className="slip-foot">An example repair, run start to finish in the {PRODUCT_NAME} demo firm. The screens above are the product, not mock-ups. Names and addresses are sample data.</p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ the queue */}
        <section className="queue" id="queue">
          <div className="lp-wrap">
            <div className="queue-head">
              <h2 data-rv="rise">Now run that clock on every open job.</h2>
              <p data-rv="rise">
                The first screen each morning is the list of who you’re waiting on and for how long. Jobs past their deadline, or with a vendor who hasn’t answered, rise into the red band on their own.
              </p>
            </div>
            <div className="queue-art" data-rv="rise">
              <Sheet src="pm-dashboard" h={1901} ratio="2000 / 1340" alt="The manager's dashboard: an At risk band with three late jobs, then four columns for Waiting on you, vendor, owner and tenant, each job with its own clock." />
              <ul className="notes">
                <li className="n-risk">
                  <b>At risk</b> fills itself: past the deadline or slow to accept.
                </li>
                <li className="n-you">
                  <b>Canary is yours.</b> Clear this column and you’re done.
                </li>
                <li className="n-clock">
                  <b>Every row has a clock.</b> It restarts at each hand-off.
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ the gate */}
        <section className="gate" id="gate">
          <div className="lp-wrap gate-grid">
            <div className="prose">
              <h2 data-rv="rise">Expired insurance stops the dispatch.</h2>
              <p data-rv="rise">
                Each vendor’s certificate, licence and W-9 sits on their record with its expiry date. Pick someone whose cover has lapsed and {PRODUCT_NAME} won’t send the job until you type a reason. The reason goes on the job’s timeline with your name on it.
              </p>
              <p data-rv="rise">Vendors upload their own renewals from a link, so the chasing isn’t yours either.</p>
              <Sheet src="pm-vendors" h={1250} ratio="2000 / 1250" className="flat" alt="The vendor list with an insurance column: Compliant, No insurance, Expired and Expiring." />
            </div>
            <div className="gate-art" data-rv="rise">
              <Sheet src="pm-compliance-gate" w={1524} h={1404} ratio="1524 / 1404" alt="Assign a vendor dialog with Northside Roofing selected: its insurance is expired, and an override reason is required before the button works." />
              <span className="lp-stamp bad gate-stamp" data-rv="thunk">
                Expired
              </span>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ reports */}
        <section className="reports" id="reports">
          <div className="lp-wrap">
            <div className="reports-head">
              <h2 data-rv="rise">The numbers your owners ask for.</h2>
              <p data-rv="rise">
                Spend by property, by trade and by vendor. How long each vendor takes to accept and to finish. Everything filters by date, property and owner, exports to CSV, and prints to PDF. Closed jobs export as an expense file for bill entry in your accounting system.
              </p>
            </div>
            <div className="reports-art">
              <div data-rv="rise">
                <Sheet src="pm-reports-financial" h={1767} ratio="2000 / 1767" alt="Financial report: total spend, monthly trend, spend by category, by vendor and by property." />
              </div>
              <div data-rv="rise">
                <Sheet src="pm-reports-vendors" h={1250} ratio="2000 / 1250" alt="Vendor performance report: jobs completed and average time to accept for each vendor." />
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ what it is not */}
        <section className="nots">
          <div className="lp-wrap">
            <h2 data-rv="rise">What {PRODUCT_NAME} leaves alone.</h2>
            <dl className="not-list">
              <div data-rv="rise">
                <dt>
                  <span className="lp-stamp dead">
                    <X size={18} aria-hidden /> Your PMS
                  </span>
                </dt>
                <dd>No rent, leases or trust accounting. Keep the system you have; {PRODUCT_NAME} handles the repairs that fall between its to-do lists.</dd>
              </div>
              <div data-rv="rise">
                <dt>
                  <span className="lp-stamp dead">
                    <X size={18} aria-hidden /> A vendor marketplace
                  </span>
                </dt>
                <dd>You bring the plumber you already trust. Nobody is inserted between you and takes a cut of the job.</dd>
              </div>
              <div data-rv="rise">
                <dt>
                  <span className="lp-stamp dead">
                    <X size={18} aria-hidden /> An AI coordinator
                  </span>
                </dt>
                <dd>Nothing talks to your tenants or owners in your name. People decide, and the software keeps the clock and sends the reminders.</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* ------------------------------------------------ questions */}
        <section className="faq" id="questions">
          <div className="lp-wrap faq-grid">
            <h2 data-rv="rise">Questions firms ask first.</h2>
            <div className="faq-list">
              {FAQ.map(([q, a]) => (
                <details key={q}>
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ your move */}
        <section className="cta">
          <div className="lp-wrap">
            <div className="band you lp-band">
              Waiting on you
              <span className="since">
                <span data-here>0s</span> in this step
              </span>
            </div>
            <h2>Your next repair can run like that one.</h2>
            <p>Set up the firm, add your vendors, and put the request link on the building notice. Most of it is done in an afternoon.</p>
            <div className="hero-cta">
              <Link to="/signup" className="btn primary lg">
                Set up your firm <ArrowRight size={16} />
              </Link>
              <Link to="/login" className="btn lg">
                Sign in
              </Link>
            </div>
            <ul className="cta-ticks">
              <li>
                <Check size={15} aria-hidden /> Only your team has accounts
              </li>
              <li>
                <Check size={15} aria-hidden /> Works beside your PMS
              </li>
              <li>
                <Check size={15} aria-hidden /> Your own vendors
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <span className="brand">
            <span className="brand-mark" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            {PRODUCT_NAME.toUpperCase()}
          </span>
          <p>Maintenance follow-up for small property-management firms.</p>
          <nav aria-label="Footer">
            <a href="#story">The repair</a>
            <a href="#queue">The queue</a>
            <a href="#gate">Insurance gate</a>
            <a href="#questions">Questions</a>
            <Link to="/login">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

const FAQ: [string, string][] = [
  ['Do vendors, tenants or owners need an account or an app?', 'No. Each of them gets a link that does one job: run this repair, track this request, approve this quote. It opens in the phone’s browser. Only your own team signs in.'],
  ['Does it replace the property management software we already use?', 'No. There is no rent, leasing or accounting in it. It handles maintenance follow-up, and closed jobs export as an expense file you can enter in your accounting system.'],
  ['Do the links go out by email or by text?', 'By email, always. Text messages go out as well when your firm has texting switched on and the person has agreed to receive them.'],
  ['What happens when a vendor ignores the link?', 'They get a reminder, and the job moves to your At risk list once it’s past the time you allow for accepting. If they phone you instead, you can accept, schedule or complete on their behalf and the timeline records that you did.'],
  ['What about emergencies?', 'The tenant form shows the 911 and gas-leak instructions and your emergency number on every screen, and flags requests that mention things like flooding, sparks or no heat. It does not replace emergency services, and it says so.'],
  ['Who is it built for?', 'Residential firms with roughly 50 to 300 doors and a small team that uses outside vendors. Larger operators with in-house technicians need different software.'],
];
