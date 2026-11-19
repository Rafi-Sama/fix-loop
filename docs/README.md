# [Product]: Property Maintenance Coordination for Small PM Firms

Research and planning docs, dated 2026-11-07. Numbers marked *estimate* are reasoning, not sourced facts. Sources are cited inside each doc.

## Docs

| Doc | What it covers |
|---|---|
| [market-research.md](market-research.md) | Pain points with quoted sources (PMs, vendors, tenants), competitor table and profiles, gap analysis, TAM/SAM/SOM, ICP |
| [business-strategy.md](business-strategy.md) | Positioning, the 5 differentiators, pricing, unit economics, GTM (first 10 / first 100 customers), validation experiments E1–E6, KPIs, risks |
| [prd.md](prd.md) | Refined PRD. Every requirement from the original PRD and 12-step workflow, tagged MVP / Later / Changed with reasons. Also user stories with acceptance criteria and the data model |
| [review-2026-11-07.md](review-2026-11-07.md) | Fact-check of these docs against live sources, what was wrong, and what changed |
| [mvp-plan.md](mvp-plan.md) | MVP scope and cuts, tech stack, week-by-week build plan (week 0 + 11 weeks), validation alongside the build, launch checklist |

---

## Executive summary

**Problem.** In small property management firms, the repair itself is rarely the hard part. Coordination is.
- Vendors are chased by text. Jobs sit silently until the tenant calls back angry.
- Intake misses photos and access details. Owner approvals take a week for a one-day repair. Vendor insurance expires unnoticed.
- All-in-one PMS products (Buildium, AppFolio, Yardi Breeze) treat maintenance as "a checkbox feature" (market-research §1).
- Slow repairs matter commercially. Renters rank poor maintenance the **#2 reason they don't renew**, while PMs put it near the bottom of their list. Satisfaction drops once a repair passes about **6.8 days**, and the industry average is 7.0 days.

**Solution.** A maintenance follow-up layer that sits **beside** the firm's existing PMS. Every job has an owner, a clock and a one-tap link.
- Tenants report through a link with guided intake and an emergency banner.
- Vendors accept, quote, schedule, complete and invoice from a text message, with **no login**.
- Owners approve quotes from one email, with per-owner auto-approve thresholds.
- The system chases everyone automatically and shows what is waiting on whom.

Tagline: *"Stop chasing vendors. Every repair closes itself."*

**ICP.** US residential PM firms with **50–300 doors** and 1–5 staff, using only third-party vendors.
- Typical tools: Buildium, Rentvine, DoorLoop, Rent Manager or Yardi Breeze, plus spreadsheets and texts.
- Not targeted: AppFolio customers, firms with in-house tech crews, commercial/HOA, landlords under 20 doors.

**Why now.**
- Incumbents shipped AI maintenance features in 2026 (AppFolio Realm-X vendor follow-up; Buildium Lumina Maintenance Agent on Premium; LeadSimple Maintenance AI). The window is open, but closing: small firms on Essential/Growth tiers and on Rentvine, DoorLoop, Rent Manager or Breeze still chase vendors by text.
- Vendoroo (from $3/door), Property Meld (about $1.60/door, $160 floor) and LeadSimple ($200 floor) prove PMs pay for maintenance software beside their PMS. None of them is live in an afternoon for a 3-person firm, and none lets vendors run the whole job without an account.
- Recent PMS pricing churn (Buildium increase Feb 2026, DoorLoop per-unit switch Oct 2026, TurboTenant acquiring TenantCloud Aug 2026) has small firms re-evaluating tools.

**Differentiation** (business-strategy §2):
1. No-login links for vendors, tenants and owners. **(real wedge)**
2. "Waiting on ___ since ___" clocks with auto-nudges and escalation.
3. One-tap owner approval with thresholds.
4. Intake that gets it right first time: required photos, emergency keywords, a self-help checklist, AI suggestions to the PM.
5. Compliance gate: warns when assigning a vendor whose insurance has expired. **(real wedge)**

Items 2–4 are parity with Property Meld and LeadSimple; they are differentiators only against the PMSs (business-strategy §2, parity check).

Structurally it is **not** a PMS, **not** a vendor marketplace and **not** an "AI coordinator" pitch.

**Pricing.**
- **$1.25 per active door per month, $99 minimum**, with a 14-day trial (full portfolio import, capped at 15 work orders).
- Unlimited users. Vendors, tenants and owners are free.
- About 20–25% below Property Meld and about a third of Vendoroo.
- Pro tier ($2/door, with PMS sync and owner statements) comes after the MVP.
- Estimated gross margin about 82–89% (after per-firm SMS registration costs). Break-even at about 80 accounts of 150 doors (*estimate*).

**Market (estimates).** TAM about $345M/yr. SAM about $45–70M/yr (20–30k firms, 3–4.5M doors). 36-month SOM about 350 customers, about $0.8M ARR. That is a solid, profitable small company. Reaching venture scale requires expansion: PMS integrations, AI tier, larger firms.

**MVP scope** (about 11 build weeks + week 0, 2-person team, *estimate*):
- Properties/units/owners/tenants/vendors with CSV import.
- Tenant request link with self-help and emergency handling. Request triage with needs-info and AI suggestions.
- Work orders with a 10-state status machine mapped to "waiting on".
- Vendor job link for the full job lifecycle. Quote approval routing with an owner one-tap link.
- Vendor documents with expiry reminders and a dispatch warning.
- Timeline and communication history. Configurable automated reminders. Email plus outbound transactional SMS.
- Dashboard with waiting-on queue. 4 reports with CSV and print-to-PDF. Settings. Stripe per-door billing.
- Stack: Next.js + Supabase Postgres + Vercel + Postmark + Twilio + Stripe, about $100–150/mo infra.

**Deferred:** two-way SMS, availability calendars and slot picking, server-side PDFs, custom statuses, 2FA (fast follow), owner portal, Buildium API sync (first post-MVP item).

**Top risks** (business-strategy §9):
1. **Incumbents bundle it.** Mitigation: avoid AppFolio users, win on vendor UX and price, stay PMS-agnostic.
2. **Double entry beside the PMS kills adoption.** Mitigation: CSV import and export on day 1, Buildium sync next, email-forward intake.
3. **Vendors don't engage with links.** Mitigation: SMS-first, under 30 seconds to accept, PM proxy updates. Tested by E4 in week 4.
4. **SMS needs per-firm registration** (we're an ISV, so each customer is its own brand/campaign). Mitigation: automate it at signup, start design partners in week 0, and email plus "copy link" means no firm ever waits on it.
5. **Emergency and self-help liability.** Mitigation: disclaimer everywhere, keyword banner, curated safe checks only, AI never downgrades priority.
6. **LeadSimple and Buildium Lumina are closing in on this ICP** (both shipped maintenance AI in Jun 2026). Mitigation: lead with what they don't do (vendors never log in, COI gate, live in an afternoon, $99 floor) and test it in E1.

**Kill criteria** come before the code. If fewer than 12 of 20 interviews name vendor chasing or owner approval as a top-2 pain (E1), or fewer than 5 design partners pay or commit by week 8 (E5), stop and re-scope. See mvp-plan §5.
