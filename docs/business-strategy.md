# Business Strategy

Builds on [market-research.md](market-research.md). Pain-point codes (P1, V2, T1, …) refer to that document. Numbers marked **(estimate)** are my own reasoning.

---

## 1. Positioning

**For** small property management firms (50–300 doors) whose maintenance runs on texts, email and memory,
**[Product]** is the maintenance follow-up layer that sits beside their existing PMS.
**Every job has an owner, a clock and a one-tap link.** Vendors, tenants and owners act from a text or email, with no app and no login, and nothing goes stale without someone being nudged.
**Unlike** AppFolio or Buildium, where maintenance is a to-do list inside accounting software, and **unlike** Property Meld or Vendoroo, which are built and priced for bigger operators, we are built for a 3-person firm. It is live in an afternoon at about $1.25/door.

One-liner: **"Stop chasing vendors. Every repair closes itself."**

What we are **not** (said out loud, to keep scope tight):
- Not a PMS. No rent, leases or trust accounting.
- Not a vendor marketplace. You bring your own vendors.
- Not an "AI coordinator" replacing staff. AI is a helper, not the headline. AppFolio, Vendoroo and Latchel already own that pitch.

---

## 2. Differentiation: the five that matter

The order is deliberate. Each item is tied to a pain point and is cheap to build.

| # | Differentiator | Pain it kills | Why it is defensible enough for a small team |
|---|---|---|---|
| 1 | **No-login links for vendors, tenants and owners.** One signed link per person per job. Vendors accept or decline, quote, pick a time, upload photos and invoice from a phone browser. Tenants submit, track and confirm. Owners approve. | V1, V2, V5 (vendors ignore portals), P3, T3 | Incumbents built portals and apps and are invested in accounts. For us, "no login" *is* the product. It also makes vendors a distribution channel (§6) |
| 2 | **"Waiting on ___ since ___" clocks, auto-nudges and escalation.** Every open job shows who it is waiting on (vendor, tenant, owner, PM) and for how long. Reminders fire automatically: no acceptance after X hours, appointment tomorrow, overdue, approval pending. Breaches go to an "At risk" queue. | P1, P2, P10 ("no reminder system for overdue work orders") | This is the core loop of the product, not a report. Easy to build and hard to bolt onto an accounting-first data model |
| 3 | **One-tap owner approval.** The owner gets an email (SMS later) with the issue, photos, quote and Approve / Decline / Call me buttons. Per-owner auto-approve threshold (e.g. under $300 skips approval). Decision timestamped in the timeline. | P3 ("repair takes a day, approval takes a week"), Jon Westrom's trust point | No owner portal to build or onboard. Photos and quotes build trust |
| 4 | **Intake that gets it right the first time.** Structured form with required photos and access details. **Emergency keywords** (gas, flooding, sparks, no heat, …) trigger the emergency banner and the PM's emergency phone number. A **self-help checklist** for safe, common issues (breaker, GFCI, disposal reset, thermostat batteries, clogged toilet) before submitting. **AI suggests** category, priority and missing-info questions to the PM. | P4, P5, T2. Remote resolution is worth about 25–30% of requests according to AppFolio and Latchel (self-reported) | The checklist is deterministic content (cheap, safe, low liability). AI only *suggests*; the PM decides |
| 5 | **Compliance at dispatch.** Vendor COI, W-9 and licence with expiry dates. The vendor uploads renewals through their link. **Assigning a vendor with expired insurance shows a hard warning that needs a reason to override.** | P7 | Point tools (bcs, CertLedger) don't know about dispatch. PMS tools store the file but don't gate on it |

**Honest parity check (2026-11-07 review).** These five are not equally unique.

| # | vs Buildium / DoorLoop / Rentvine | vs Property Meld / LeadSimple | vs AppFolio Realm-X |
|---|---|---|---|
| 1 No-login vendor links | Differentiator | **Differentiator** (Meld requires vendor registration) | Differentiator |
| 2 Waiting-on clocks + nudges | Differentiator, but Buildium Lumina (Premium) now flags overdue work and drafts chases | Parity (Meld auto-nudges and reassigns) | Behind (AI follows up with vendors itself) |
| 3 One-tap owner approval | Differentiator | Parity | Unclear |
| 4 Intake (photos, emergency, self-help) | Differentiator | Parity or behind (LeadSimple and Frontdesk have AI intake) | Behind |
| 5 Compliance gate at dispatch | Differentiator | **Differentiator** (no evidence either gates dispatch on COI) | Unknown |

**So the real wedge is #1 + #5 + simplicity + price.** The product a 3-person firm can switch on in an afternoon is the one where vendors never log in, expired insurance blocks dispatch, and the bill comes in under LeadSimple's $200 floor and Property Meld's minimum. Items #2–#4 are table stakes and must simply be done well. Lead the pitch with #1 and the time-to-live, not "AI".

**Plus the structural choice:** **sit beside the PMS, don't replace it.**
- MVP: CSV import of properties, units, tenants, vendors and owners, plus CSV export of closed work orders and expenses for bill entry.
- Phase 2: Buildium API sync.

This avoids a PMS migration, the biggest objection small firms have, and lets us sell to firms that are happy with their accounting.

**Deliberately not differentiating on (yet):**
- AI chat troubleshooting or AI dispatch. Liability and incumbents.
- Vendor network. Lula owns it.
- Owner portal. Approval links cover 80% of the need.
- Native mobile apps. Links plus a PWA instead.
- Vendor payments. A money-transmission and compliance burden.

---

## 3. Pricing

### 3.1 Competitive anchors

| Product | Effective price for a 150-door firm (approx.) |
|---|---|
| AppFolio Core | about $280–298/mo floor (whole PMS) |
| Rentvine | $375/mo (whole PMS) |
| Buildium Growth | about $192/mo (whole PMS) |
| Property Meld | about $240/mo ($1.60 × 150) |
| LeadSimple Operations + WO sync | about $300/mo ($200 floor; about $1.35 + $0.65/door, third-party review) |
| Vendoroo | $450–900/mo ($3–6 × 150; up to $8.50 on top packages) |
| Latchel via RentRedi | $2,250+/mo ($15 × 150) |

### 3.2 Our pricing (recommended)

| Plan | Price | Includes |
|---|---|---|
| **Trial** | 14 days, no card | Everything in Core, **full portfolio import, capped at 15 work orders**. Vendors, tenants and owners are always free and unlimited. (Changed in review: a 25-door cap meant a 150-door ICP firm couldn't import its real portfolio, which is the activation step. The cost is in work orders and SMS, not doors) |
| **Core** (launch plan) | **$1.25 per active door per month, $99/mo minimum** (covers up to 79 doors). Annual: 2 months free | Unlimited PM users, vendors, tenants and owners. Email plus transactional SMS (fair use about 30 SMS per door per year, estimate). AI intake suggestions. Reports and CSV. Vendor compliance |
| **Pro** (post-MVP) | $2.00/door, $199 minimum | PMS sync (Buildium first), owner monthly statements, custom SLAs and categories per owner, after-hours emergency routing, API |
| **Add-ons** (later) | e.g. AI after-hours intake, extra SMS bundles | Expansion revenue |

**Why this shape**

- **Per door**, because it matches how the ICP thinks and how every competitor bills, and it grows automatically with the customer.
- **About 20–25% below Property Meld at the same door count**, and roughly a third of Vendoroo. Cheap enough to sit on top of Buildium without a budget fight, and enough above Breeze-level ($1) to fund SMS.
- **$99 minimum** keeps DIY landlords with 5 doors from becoming a support burden. At 79 doors or fewer, the minimum applies.
- **No free tier** for PM firms. A free plan pulls in the wrong segment (TurboTenant and RentRedi give away landlord tools). **The free side is the network:** vendors, tenants and owners never pay, which feeds distribution.
- **Billing:** count "active doors" (units with a tenant or any work order in the month). This avoids arguments about vacant or archived units.

### 3.3 Expansion revenue

1. **Door growth.** Automatic as the firm grows.
2. **Pro upgrade.** PMS sync becomes a must once they rely on us.
3. **AI after-hours intake add-on.** Late-night "is this an emergency" calls and texts (BiggerPockets #7297619).
4. **Later, and only if validated:** vendor-side paid features (multi-PM inbox for vendors, faster payment), owner reporting packs, preventive maintenance schedules.

---

## 4. Unit economics (all estimates)

Example account: **150 doors** at $1.25 gives **$187.50 MRR, or $2,250 ARR**.

| Cost per account per month | Estimate | Basis |
|---|---|---|
| Work orders | about 50/mo | about 4 WOs per door per year (estimate) |
| SMS | about $8–20 | Usage: about 12 segments per WO × (about $0.0083 Twilio + about $0.003–0.005 carrier fee) ≈ $6–9. **Plus per-firm registration (corrected in review):** we send on behalf of each PM firm, so Twilio treats us as an ISV and each customer firm needs its own brand + campaign (10DLC) or its own verified toll-free number. 10DLC per firm: $4.50 brand (+$41.50 if standard vetting), $15 campaign vetting, $1.50–10/mo campaign fee, plus about $1–2/mo per number. That's about $20–60 one-off and $3–12/mo per account. Not a shared cost ([Twilio ISV](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv), [Twilio fees](https://support.twilio.com/hc/en-us/articles/1260803965530), [toll-free for ISVs](https://support.twilio.com/hc/en-us/articles/13264118705051-Required-Information-for-Toll-Free-Verification)) |
| Email | about $1 | Postmark or Resend tiers |
| AI triage | under $1 | About 50 calls × about 3k tokens with a small model. Fractions of a cent each |
| Storage (photos) | under $1 | S3 or R2 |
| Hosting (allocated) | about $3–5 | Shared |
| Payment processing | about $5.70 | 2.9% + $0.30 |
| **Total COGS** | **about $20–33** | **About 82–89% gross margin** (one-off SMS registration of about $20–60 per account goes into CAC) |

- **CAC target:** under $900 blended (founder-led for the first 100 customers, then content and marketplace).
- **Payback:** about 6 months at about 85% gross margin.
- **Churn assumption:** 2–3% logo churn per month (SMB norm, estimate). LTV is about $187.5 × 0.85 / 0.025 ≈ **$6,400**, so **LTV:CAC is about 7:1** if the CAC target holds.
- **Break-even (rough):** a 2-founder team at about $15k/mo of burn needs about 80 accounts at 150 doors (estimate).

---

## 5. Go-to-market

### 5.1 First 10 customers: design partners (weeks −4 to 12)

1. Recruit from **customer interviews** (§7): BiggerPockets posters who complained in the threads cited in market research, local **NARPM chapter** members, LinkedIn searches for "maintenance coordinator" at small PM firms, and PM Facebook groups.
2. **Offer:** 50% off for 12 months, plus "we'll set it up for you". White-glove CSV import and vendor list loading. In exchange: a weekly 20-minute call, access to usage data, and a case study.
3. **Concierge before code:** run 2–3 partners' maintenance on a Google Form, Twilio texts sent by hand, and a shared sheet for 2 weeks (§7, E3). This proves the loop and seeds the templates.
4. Success means 10 paying design partners with 8 or more still active after 60 days.

### 5.2 First 100 customers (months 3–12)

| Channel | Tactic | Why it fits |
|---|---|---|
| **Vendor-driven loop** | Every vendor and owner page carries "Powered by [Product]: managing rentals? Try it." Ask happy vendors which *other* PMs they work for. One vendor works for 10–17 PM companies (V1) | Built-in viral surface, free |
| **PMS marketplaces** | Apply to the Buildium Marketplace once the Buildium sync ships (Phase 2). Rentvine and Rent Manager next | Where the ICP shops for add-ons |
| **NARPM** | Chapter talks ("How we cut repair time from 7 to 4 days"), state conferences, small sponsorships | 6,500 members, exactly our segment |
| **Content and SEO** | "Property Meld alternative for small PMs", "Buildium maintenance workflow", "owner approval thresholds template", a free **vendor COI expiry checker** and **maintenance SLA calculator** | High intent, cheap |
| **Communities** | BiggerPockets PM forum, Facebook PM groups, r/PropertyManagement. Helpful answers, not ads | That is where the complaints are |
| **Referral** | One free month for both sides | Small firms talk to each other |

### 5.3 Sales motion

- **Self-serve trial plus an optional 20-minute founder demo.** No SDRs before about $30k MRR.
- **Onboarding:** "Live in an afternoon".
  1. Upload CSVs (or let us do it).
  2. Send vendors a "please confirm your details and upload your COI" link.
  3. Publish the tenant request link or QR code in the tenant welcome email.
  4. Run the first job.
- **Activation milestone:** the first work order closed through vendor links within 7 days.

---

## 6. Business model summary

- B2B SaaS, per-door subscription, monthly or annual, via Stripe.
- The free network side (vendors, tenants, owners) acts as distribution.
- No transaction revenue in v1. Later options: vendor fast-pay fee or a marketplace referral fee. Only after volume, and only if it doesn't conflict with "bring your own vendors".

---

## 7. Validation plan (run before and during the build)

| # | Experiment | When | Pass criteria (kill or pivot if missed) |
|---|---|---|---|
| E1 | **20 customer interviews** with ICP firm owners and coordinators. Include a manual Reddit and Facebook pass for more pain quotes. Ask about the last 3 jobs that went badly, current tools, what they pay, and who approves. Also ask: where requests arrive today (PMS resident portal, phone, text), whether they pay for Buildium Lumina Workforce, and whether they've tried Property Meld or LeadSimple and why they stopped | Weeks −4 to −1 | At least 12 of 20 name chasing vendors or owner approval as a top-2 pain. At least 8 of 20 use Buildium, Rentvine, DoorLoop or Rent Manager (not AppFolio) |
| E2 | **Landing page plus pricing** with a "Join the beta" form ($1.25/door shown). Drive about 500 visitors from communities and NARPM | Weeks −3 to 2 | At least 5% visitor-to-signup. At least 30 beta signups from firms with 50+ doors |
| E3 | **Concierge MVP** for 2–3 firms. Founder runs their maintenance loop by hand (Google Form intake, texts from a Twilio number, Sheet tracker, owner approval by email) | Weeks −2 to 2 | Measurable drop in time-to-assign and approval time. Partner says they would pay at least $1/door |
| E4 | **Vendor link test.** Send 30 real vendors a mock job link (Figma prototype or a basic page) | Week 2 | At least 70% open it and at least 50% complete accept or decline without calling the PM |
| E5 | **Pre-sales.** Ask design partners for a card on file or a signed LOI at the discounted price before week 8 | Weeks 4–8 | At least 5 paid or committed |
| E6 | **Owner approval test.** Real owners approve real quotes through the link | Weeks 8–10 | Median approval under 24h (vs. "a week" in P3) |

---

## 8. Success metrics and KPIs

**North-star:** *median request-to-close time* for work orders handled in the product. Benchmark: Property Meld's industry average of 7.0 days and satisfaction threshold of 6.8 days.

| Category | KPI | MVP target (first 90 days after launch) |
|---|---|---|
| Activation | Share of new accounts closing their first WO through vendor links within 7 days | ≥ 60% |
| Core loop | Share of vendor actions done via link (no PM proxy) | ≥ 80% |
| Speed | Median time request → vendor assigned | < 4 business hours |
| Speed | Median owner approval turnaround | < 24h |
| Speed | Median request → closed | ≤ 5 days (beat 6.8-day benchmark) |
| Hygiene | Share of open WOs past SLA ("at risk") | < 10% |
| Quality | Tenant completion confirmation rate / CSAT | ≥ 50% respond / ≥ 4.3/5 |
| Deflection | Share of requests resolved by self-help before submission | Track only. Aim for 5–10% initially |
| Engagement | Weekly active PM users per account | ≥ 1 on 5 of 7 days |
| Revenue | Paying accounts / MRR | 25 accounts, about $4k MRR by month 4 after launch (estimate) |
| Retention | Logo churn per month | < 3% |
| Love | Design-partner NPS | ≥ 40 |

---

## 9. Risks and mitigations

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| **Incumbents bundle it** (AppFolio Realm-X already follows up with vendors; Buildium Lumina Maintenance Agent shipped Jun 2026 on Premium) | High / High | Avoid AppFolio users. Lead with what the bundles don't do: no-login vendor lifecycle, owner approval links, COI gate. Stay PMS-agnostic (Buildium, Rentvine, DoorLoop, Rent Manager, Breeze). In E1, ask every Buildium prospect whether they pay for Lumina Workforce; if most Premium users say it solved chasing, narrow the ICP to Essential/Growth and non-Buildium firms |
| **LeadSimple already serves this ICP** (beside the PMS, 2-way WO sync, Maintenance AI, owner approvals) | High / Medium | Compete on time-to-live (an afternoon vs a setup project), vendors never logging in, the COI gate, and a $99 floor vs their $200. Don't chase general workflow features. Ask in E1 how many prospects tried LeadSimple and why they left |
| **SMS needs per-customer registration** (ISV rules: each firm is its own brand/campaign or verified toll-free number, approval takes days to weeks per firm) | High / Medium | Automate registration through Twilio's ISV APIs at signup. Email + "copy link to text from your phone" works from minute one, so onboarding never waits on SMS. Budget about $20–60 one-off per firm |
| **Double entry kills adoption** (sitting beside the PMS means two systems) | High / High | CSV import on day 1. Tenant link replaces PMS intake. Expense CSV export formatted for PMS bill import. Buildium API sync is the first post-MVP item. Email-forward intake (forward PMS request emails to a unique inbox) as a fast follow |
| **Platform risk** (Buildium cut the Vendoroo integration without notice) | Medium / High | CSV path always works. Support several PMSs. Never depend on one PMS for core function |
| **SMS / 10DLC delays or filtering** | Medium / Medium | Register our own ISV profile and the design partners' brands in **week 0** (approval can take weeks). Email-only fallback. "Copy link to text from your phone" button so the PM can send links from their own phone. Transactional-only content with opt-out (STOP) handling |
| **Liability on emergencies and self-help** | Low / High | Emergency disclaimer from the PRD everywhere. Keyword-triggered emergency banner with the property's emergency number. Self-help limited to safe, curated items, with "If unsure, stop and submit". AI only suggests priority; it never auto-dismisses |
| **Vendors don't engage** | Medium / High | No login, mobile-first, under 30s to accept. SMS plus email. Validate with E4. PM can act on a vendor's behalf (proxy updates) so jobs never get stuck |
| **Low willingness to pay / SMB churn** | Medium / Medium | $99 minimum. Target 50+ door firms. Annual discount. Show the ROI dashboard (days saved, approvals sped up) |
| **Crowded category, can't be heard** | High / Medium | Narrow message ("stop chasing vendors"), narrow ICP, and community-led GTM in 1–2 metros before going national |
| **Tenant PII and data security** | Medium / High | Signed, expiring, scoped tokens. Per-org row-level isolation. Encrypted at rest. Audit log (timeline). No SSN or payment data stored. W-9 files in a private bucket with short-lived URLs |
| **Lula's free model** | Medium / Low | Different job. We coordinate *your* vendors; Lula can be a fallback vendor later |
