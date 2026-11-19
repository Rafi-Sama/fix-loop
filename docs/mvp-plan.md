# MVP Plan

Builds on [prd.md](prd.md) (scope source of truth), [business-strategy.md](business-strategy.md) (validation experiments E1–E6, KPIs) and [market-research.md](market-research.md). Durations and costs are **estimates**.

**Assumed team:** 2 people.
- **Engineer:** one full-stack engineer.
- **Founder:** product, design, validation and sales. Writes copy and templates, does QA, and builds some UI.

With one engineer only, add about 4 weeks. With two engineers, cut about 2 weeks.

---

## 1. MVP in one sentence

A PM can import their portfolio. From then on:
- tenants report issues through a link
- the PM triages and assigns a vendor
- the vendor accepts, quotes, schedules, completes and invoices from a text message
- the owner approves from an email
- the system chases everyone automatically

Every job, cost and photo ends up in a searchable history with exportable reports.

**Activation definition:** first work order closed through vendor links within 7 days of signup (business-strategy §5.3).

---

## 2. Scope

### 2.1 In the MVP

All items tagged **MVP** or **Changed** in prd.md:
- Dashboard + "waiting on" queue
- Properties/units/owners/tenants/vendors, with CSV import
- Tenant request link with self-help checklist and emergency banner
- Requests: triage, needs-info, AI suggestions, internal notes, close/cancel with reason
- Work orders with 10 statuses
- Vendor job link: accept/decline, quote, schedule, start, complete with photos and invoice
- Compliance gate + document expiry reminders
- Quote approval routing with owner one-tap link and thresholds
- Timeline + communication history
- Automated reminders (configurable)
- Email + outbound transactional SMS
- 4 reports with CSV + print-to-PDF; expense CSV export
- Settings
- Admin/Manager roles
- Stripe per-door billing

### 2.2 Cut from the MVP and why

| Cut | Why | Revisit when |
|---|---|---|
| Two-way SMS threading | Needs per-job number routing or reply parsing. Auto-reply + forward to PM email covers it | ≥30% of vendors reply by text instead of tapping the link |
| Vendor availability calendar, self-serve slot picking | Small vendors won't maintain calendars. "Agree by phone, record on link" matches the original workflow step 8 | Tenants' "time doesn't work" rate > 20% |
| Map/radius coverage | ZIP/city tags are enough for 5–30 vendors | Firms with 100+ vendors |
| Server-generated / scheduled PDFs | Print view gives the same output | Owners ask for monthly emailed statements (Pro plan) |
| Custom statuses | Reminders, clocks and reports depend on a fixed set | Repeated customer requests |
| TOTP 2FA | Google sign-in + strong passwords at launch | Weeks 13–16 (fast follow) |
| Owner portal | Approval links cover the need (original also excluded it) | Never, unless Pro customers pay for it |
| Finer permissions | 1–5 person firms | Firms > 10 users |
| Business-hours SLAs | Calendar hours are simpler and stricter | Customer complaints about weekend breaches |
| Buildium API sync | Biggest post-MVP item, but it's integration work against a moving API. CSV import/export works now | First thing after launch (Pro plan, marketplace channel) |
| Email-forward intake (forward PMS request emails to a unique inbox) | Nice-to-have against double entry | Fast follow, if design partners still get requests via PMS |
| Native mobile apps | Links + responsive web are the product | Never for vendors/tenants. Maybe a PM app later |
| Vendor payments, marketplace, AI chat troubleshooting | Compliance burden, Lula owns it, liability (business-strategy §2) | Only with traction and evidence |

---

## 3. Tech stack (simple, cheap, boring)

| Layer | Choice | Why | Cost at launch (estimate) |
|---|---|---|---|
| App | **Next.js (App Router) + TypeScript**: one repo, one deploy, server actions for PM app, plain server-rendered pages for the no-login links | One language end to end. Link pages must be fast on bad mobile connections, so keep them SSR with minimal JS | — |
| DB | **Postgres on Supabase** (or Neon) + **Drizzle ORM** | Relational data, enums, transactions for MR/WO counters | $25/mo (Supabase Pro) |
| Auth (PM users) | **Supabase Auth** (email+password, Google) | Built in. No custom auth code | included |
| No-login links | Own code: random 128-bit token, SHA-256 hashed in `access_links`, scoped + expiring | ~100 lines. Don't use auth sessions for vendors/tenants | — |
| Files | **Supabase Storage** (private buckets, signed URLs) or Cloudflare R2 | Photos, invoices, W-9s. Resize photos client-side before upload | ~$0–5/mo |
| Hosting | **Vercel** (Pro) | Zero-ops deploys, preview URLs for design-partner demos | $20/mo |
| Background jobs and reminders | **Vercel Cron every 5 min → `/api/cron/reminders`**, which processes due rows in `reminders` (and the outbound notification queue) | No queue infrastructure. *shortcut: a cron scan caps at a few thousand reminders/run; move to pg-boss/Inngest when one run takes > 30 s* | included |
| Email | **Postmark** (transactional, good deliverability, inbound webhook for replies) | Approval links must land in the inbox | $15/mo |
| SMS | **Twilio** as an **ISV**: our primary profile, plus one brand + campaign (10DLC) or verified toll-free number **per customer firm**, created through Twilio's ISV APIs at signup | Carriers require the end business's details, so one shared campaign isn't allowed. Start our ISV profile and the design partners' registrations in week 0 | About $20–60 one-off and $3–12/mo per firm, plus usage (business-strategy §4) |
| Payments | **Stripe Billing**: metered "active doors" + $99 minimum, Checkout + Customer Portal | No billing UI to build | 2.9% + 30¢ |
| AI suggestions | One call per new request to a small, cheap LLM (e.g. Claude Haiku-class) with a JSON schema output: category, priority, up to 3 missing-info questions | Under $1/account/month. Fails silently | ~$5–20/mo total |
| UI | Tailwind + shadcn/ui; Recharts for the one finance chart | Fast, accessible defaults | — |
| Monitoring | Sentry (free tier), Vercel logs, a nightly DB backup (Supabase PITR) | | $0–26/mo |
| Testing | Vitest for status machine, reminders, link scoping, counters; Playwright for 3 end-to-end flows (tenant submit → close; owner approval; vendor decline → reassign) | Covers the money/security paths only | — |

**Total infra at launch: about $100–150/month** (estimate), excluding SMS usage.

**Alternative:** if the engineer is fluent in Rails, use Rails 8 + Postgres + Solid Queue + Hotwire on Render. It is equally good. Don't pick a stack the team has to learn.

**Architecture rules**
- Monolith. No microservices.
- All status changes go through one `transitionWorkOrder(wo, action, actor)` function. That function writes the event, cancels and creates reminders, and enqueues notifications. Never update `status` directly.
- Notifications are rows (`notifications`) sent by the cron worker, so they are retryable and visible in communication history.
- Org isolation is enforced in the data-access layer and backed by Postgres RLS.

---

## 4. Week-by-week build plan (week 0 + 11 build weeks, estimate)

Validation work (founder) runs in the right-hand column. Experiment IDs are from business-strategy §7.

| Week | Engineering (deliverable at end of week) | Founder: product, validation, GTM |
|---|---|---|
| **0** (before build) | Repo, CI, Vercel + Supabase envs, Sentry. **Start Twilio ISV primary profile + the first 2–3 design partners' brand/campaign registrations** (can take weeks). Postmark domain + DKIM/SPF/DMARC. Stripe account | **E1:** finish 20 interviews (a Reddit/Facebook pain-quote pass included). **E2:** landing page + pricing live. Draft notification copy for every trigger in prd §8.1/8.5 |
| **1** | Schema + migrations for all prd §15 entities; MR/WO counters; org + user auth; Admin/Manager roles; team invites | **E3:** concierge MVP for 2–3 firms starts (Google Form + Twilio texts + Sheet). Log every message and delay. These become the templates and test data |
| **2** | Properties, units (bulk add), owners, tenants, vendors: CRUD, lists with search/filter/archive/deactivate. **CSV import** with preview + idempotent re-import | Concierge continues. Collect real CSV exports from partners' PMSs (Buildium first) to test the importer |
| **3** | Tenant request link (public per firm/property + QR), form with required photos, emergency keyword banner + disclaimer, self-help checklist (5 items), tracking page, "My requests" link. MR list/detail, internal notes, close/cancel with reason, needs-info | Write the self-help content and emergency copy; get a quick legal read on disclaimer wording (estimate $500–1,000). **E4 prep:** clickable vendor-link prototype |
| **4** | Work orders: create from MR / "New job", `transitionWorkOrder` state machine with all transitions in prd §6.5 (including the review additions: diagnose-then-quote, emergency fast path, no-access, invoice overage), timeline/events, **access_links** (token, scope, expiry). Vendor job link: accept/decline. Compliance gate on assign | **E4:** send 30 real vendors the mock job link. Pass bar: ≥70% open, ≥50% complete accept or decline unaided |
| **5** | Vendor link continued: quote (with versions), schedule (date + window), start, completion screen (photos + notes + invoice). Proxy updates by PM. Vendor documents + expiry status + vendor self-onboarding link | Recruit design partners for launch (target 10). **E5:** ask for card on file / LOI at 50% discount |
| **6** | Approval routing: thresholds (org default + per owner, auto-approve), owner approval email link (Approve / Decline / Call me), approval history. Owner completion summary + "PM forwards manually" mode | Prepare design-partner onboarding kit: CSV templates, vendor intro message, tenant welcome-email snippet + QR poster |
| **7** | Notification engine: queue + cron sender, all email triggers (prd §8.1), SMS for vendor links/reminders/appointments/emergency, **per-firm SMS registration via Twilio ISV API** (signup collects legal name, EIN, website, policy URLs; status shown in Settings), STOP/HELP, inbound SMS auto-reply + forward, Postmark delivery webhooks → communication history. **Reminders** (all of prd §8.5) with configurable periods | Internal dogfood: founder runs a concierge partner's live jobs through the real app in parallel with the sheet |
| **8** | Dashboard: 8 stat tiles + waiting-on queue + At-risk group. AI triage suggestions. Tenant confirm-fixed + rating; "Not fixed" reopens. Settings screens (company, notifications, categories, priorities/SLAs, thresholds, reminders) | **Private beta:** 2–3 concierge partners switch fully to the app. Daily check-ins. **E6** starts (real owner approvals via link) |
| **9** | Reports: summary, property, vendor performance, financial; CSV export; print-to-PDF views; expense CSV for PMS bill import. Vendor profile metrics (response times) | Beta expands to 5–6 partners. Collect bug list + top-3 friction items. Draft 1 case study from concierge numbers |
| **10** | Stripe Billing: trial (full import, 15-work-order cap), metered active doors + $99 minimum, Customer Portal, failed-payment grace → read-only. Security pass (link scoping tests, RLS check, W-9 access). Playwright e2e for 3 flows. Fix beta top-10 | Launch prep (see checklist). Pricing page final. Convert partners to paid (50% off, 12 months) |
| **11** | Buffer: bugs, performance on link pages (target < 2 s on 3G), onboarding polish, empty states | **Launch** to design partners + waitlist (E2 signups). Start NARPM chapter outreach + BiggerPockets content |

**Slack:** week 11 is buffer, plus one optional extra week (12) if needed. If the plan slips, cut in this order:
1. AI suggestions
2. Vendor profile metrics
3. Financial chart (keep tables)
4. Self-help checklist

**Never cut:** links, reminders, approvals, emergency banner, CSV import.

**Post-MVP order (weeks 13–20, estimate):**
1. TOTP 2FA
2. Buildium API sync (→ Buildium Marketplace listing)
3. Email-forward intake
4. Owner monthly statements (Pro)
5. Two-way SMS

---

## 5. Validation alongside the build

These are the E1–E6 experiments from business-strategy §7, mapped onto the weeks above.

| When | Experiment | Pass bar | If it fails |
|---|---|---|---|
| Wk −4 to 0 | **E1** 20 ICP interviews | ≥12/20 put vendor chasing or owner approval in their top-2 pains; ≥8/20 are on Buildium/Rentvine/DoorLoop/Rent Manager | Stop. Re-interview a different segment, or pivot the wedge to whatever pain dominated |
| Wk −3 to 2 | **E2** landing page + pricing | ≥5% signup rate, ≥30 signups from 50+ door firms | Re-test messaging ("stop chasing vendors" vs "owner approvals in hours"). If still low, the price/ICP is wrong |
| Wk 1 to 2 | **E3** concierge MVP | Time-to-assign and approval time measurably drop; partner says they'd pay ≥ $1/door | Find what they valued and narrow scope to it before week 4 |
| Wk 4 | **E4** vendor link test | ≥70% open, ≥50% accept/decline unaided | Redesign the link (fewer fields, SMS-first) before building weeks 5–6 on it |
| Wk 5 to 8 | **E5** pre-sales | ≥5 paid or LOI | Pricing or value problem. Run 5 more interviews focused on willingness to pay |
| Wk 8 to 10 | **E6** owner approval via link | Median approval < 24 h | Add an SMS approval link + PM "nudge owner" button. Re-check |

**Weekly ritual:** every Friday, review this table and the beta metrics below; decide to continue, adjust or cut.

**Beta metrics to instrument from week 8** (subset of business-strategy §8):
- time request → assigned
- owner approval turnaround
- request → closed
- % of vendor actions done via link (vs. PM proxy)
- % of WOs "at risk"
- tenant confirm rate

---

## 6. Launch checklist

**Compliance and deliverability**
- [ ] Twilio ISV primary profile **approved**. Design partners' brand + campaign (or toll-free) **approved**. Automated per-firm registration tested end to end with one new signup. Opt-in language on tenant form and vendor onboarding. STOP/HELP tested. Any firm not yet approved runs email + "copy link" automatically
- [ ] Postmark: SPF, DKIM, DMARC pass. Approval and job emails land in the Gmail/Outlook inbox (test with 5 real accounts)
- [ ] Emergency disclaimer on form, confirmation page and email; keyword banner tested with every keyword; legal read done
- [ ] Terms of Service, Privacy Policy, DPA template; SMS terms; data retention (photos and W-9s) stated

**Security**
- [ ] Link tokens: hashed, scoped, expiring; tests prove a vendor/tenant link cannot read other jobs, internal notes, or other tenants' data
- [ ] RLS on all tables; cross-org access test
- [ ] W-9 bucket private; signed URLs ≤ 10 min; Admin/Manager only
- [ ] Backups (PITR) on; restore tested once
- [ ] Rate limits on public request link + simple bot protection (honeypot / Turnstile)

**Product**
- [ ] All 27 prd §13 user stories pass their acceptance criteria
- [ ] Three Playwright e2e flows green in CI
- [ ] Link pages < 2 s on throttled 3G; work at 375 px width
- [ ] Reminders fire within 15 min; no reminder fires after the state changed (tested)
- [ ] Empty states + onboarding checklist: import → invite vendors → share tenant link → first job
- [ ] CSV templates + Buildium-export mapping documented

**Business**
- [ ] Stripe live: trial, metered doors, $99 minimum, portal, dunning → read-only
- [ ] Pricing page matches business-strategy §3.2
- [ ] Support: shared inbox + founder phone for design partners; status page (free tier)
- [ ] Analytics events for activation and beta metrics (§5)
- [ ] ≥5 design partners paid or committed (E5) and ≥1 case study draft
- [ ] Launch posts ready: BiggerPockets (helpful, not ad), PM Facebook groups, NARPM chapter contact list, waitlist email

---

## 7. Risks specific to the build

| Risk | Mitigation |
|---|---|
| 10DLC approval drags past launch, or each new firm waits days to weeks for SMS | Started week 0; registration automated at signup; email + "copy link to text from your phone" fallback is built in week 7 regardless, so a firm is never blocked |
| State machine bugs leave jobs stuck | Single transition function, table-driven tests for every transition in prd §6.5, PM proxy action as escape hatch |
| CSV import is messier than expected (every PMS exports differently) | Get real exports in week 2; founder does white-glove imports for the first 10 customers anyway |
| Scope creep from design partners | Any request not in prd.md goes to a "Later" list and is revisited only after launch, unless ≥3 partners ask for it |
| Single engineer is a bus factor | Boring stack, tests on core paths, short written architecture notes in the repo |
