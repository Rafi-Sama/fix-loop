# Product Requirements Document (refined)

**Product:** [Product], a property maintenance coordination layer for small property management firms
**Version:** v1 (MVP) · **Date:** 2026-11-07
**Inputs:** the original PRD and 12-step workflow (now merged into this file), [market-research.md](market-research.md), [business-strategy.md](business-strategy.md). Codes like P1, V2 and T1 refer to pain points in market-research.md §1.

**Goal (unchanged from the original):** reduce the manual work involved in managing maintenance operations and make every repair job easier to track.
**Sharpened goal:** every open job has a clear owner, a clock and a one-tap link, so nothing goes stale silently (P1, P2).

### How to read the tags

| Tag | Meaning |
|---|---|
| **MVP** | Ships in v1, as in the original PRD |
| **Later** | Kept in the backlog, not in v1. The reason is given |
| **Changed** | Ships in v1, but differs from the original PRD. The reason is given and tied to the research |

Every requirement from the original PRD and workflow appears below with one of these tags. The full list of deferrals and changes is in §14.

---

## 1. Users and roles

### 1.1 Design principle (Changed)

The original PRD implied that every role logs into the product. Research shows vendors won't adopt yet another portal (V1, V2, V5), and owners are a bottleneck when they have to be chased (P3).

- **Property managers** get full accounts.
- **Vendors, tenants and owners never create accounts.** They act through signed, expiring, single-purpose links sent by email (and SMS for vendors and tenants).

This is differentiator #1 in business-strategy.md §2.

### 1.2 Property Manager (paying user, full account)

"Property Manager" covers the firm owner and any authorised team members (coordinators, assistant PMs).

| Responsibility (original) | Status | How |
|---|---|---|
| Manage rental properties | MVP | §3 |
| Receive maintenance requests | MVP | §5. Email + in-app notification |
| Review repair issues | MVP | §5.6 triage actions |
| Assign contractors | MVP | §6.2. Warns on expired compliance documents |
| Monitor job progress | MVP | Dashboard "waiting on" queue (§2), timeline (§6.5) |
| Manage repair quotations | MVP | §6.3 |
| Obtain owner approvals | **Changed** | One-tap owner approval link instead of the PM forwarding emails (§1.5) |
| Review invoices | MVP | §6.4 |
| Generate reports | MVP | §9 |

**User roles inside a firm (Changed, minimal):**
- **Admin:** billing, settings, users.
- **Manager:** everything else.

The original PRD didn't define team permissions. It only mentioned "authorised team members" (§8.3). Finer permissions are **Later**.

### 1.3 Maintenance Contractor / Vendor (free, no login)

| Responsibility (original) | Status | How |
|---|---|---|
| Receive maintenance assignments | **Changed** | Job link via SMS + email. No portal account (V1, V5) |
| Accept or decline jobs | MVP | Accept or decline (with reason) on the job link |
| Communicate availability | **Changed** | Free-text availability on the vendor record, plus a decline reason or note on each job. A structured availability calendar is **Later**: small vendors won't maintain one |
| Schedule appointments | **Changed** | Vendor enters the agreed date and time window on the link, using the tenant's stated availability. The tenant can ask for a different time. Self-serve slot picking is **Later** |
| Submit repair quotations | MVP | Amount, description, optional PDF/photo |
| Update job progress | MVP | "Start job", "Mark complete" buttons |
| Upload completion photos | MVP | From the phone camera on the link |
| Submit invoices | MVP | Amount, invoice number, file |
| *(added)* Keep compliance docs current | **Changed (added)** | Vendor uploads renewed COI/licence/W-9 through a document link (P7) |

### 1.4 Tenant / Resident (free, no login)

| Responsibility (original) | Status | How |
|---|---|---|
| Submit maintenance requests | MVP | Public request link / QR per firm or property (§4.3) |
| Explain the maintenance issue | MVP | Structured form, plus a self-help checklist for safe common issues (Changed, §5.2) |
| Upload photos | MVP | Required for most categories. Can add more later |
| Provide access availability | MVP | Availability text + permission to enter + access notes |
| View request progress | MVP | Request tracking link showing status and appointment |
| Receive appointment updates | MVP | Email + SMS |
| Confirm whether the repair was completed satisfactorily | MVP | "Fixed / Not fixed" + optional 1–5 rating on the closing message |

### 1.5 Property Owner (Changed)

**Original note:** if the owner manages the property themselves, they are simply the Property Manager. Otherwise, v1 does not build a full owner platform. An owner who wants updates gets them by email, forwarded by the property manager.

| Item | Status | Reason |
|---|---|---|
| Self-managing owner uses the PM role | MVP | As in the original |
| No full owner platform/portal in v1 | MVP | As in the original. Owner portal is **Later**, if ever |
| Owner updates by email, forwarded manually by the PM | **Changed** | The system sends owner emails **directly** on the PM's behalf, branded with the firm's logo and reply-to set to the PM. Owners receive: (a) a **one-tap approval link** for quotes above their threshold, and (b) an optional completion summary. A per-owner setting "PM forwards manually" keeps the original behaviour for PMs who want it. Reason: owner approval is the largest single delay ("The actual repair takes a day. The approval process takes a week", P3) |
| *(added)* Per-owner auto-approve threshold | **Changed (added)** | Quotes under the threshold skip owner approval (P3: "Every owner had different approval thresholds") |

---

## 2. Dashboard (Property Manager)

| Item (original) | Status | Definition |
|---|---|---|
| Total properties managed | MVP | Non-archived properties |
| Total maintenance requests | MVP | All requests in the selected period (default: last 30 days) |
| Open maintenance requests | MVP | Request status `new`, `needs_info` or `in_progress` |
| Jobs awaiting contractor acceptance | MVP | WO status `awaiting_acceptance` |
| Jobs currently in progress | MVP | WO status `scheduled` or `in_progress` |
| Jobs awaiting approval | MVP | WO status `awaiting_approval` (quote). Shown split as "owner" vs "you" |
| Completed jobs | MVP | WO status `completed` (awaiting your review), plus a count closed this period |
| Overdue maintenance jobs | MVP | Open WOs past `expected_completion_date` **or** past their priority SLA |
| *(added)* **"Waiting on" queue** | **Changed (added)** | The default landing view lists every open job grouped by who it is waiting on (Vendor / Tenant / Owner / You), with time waited, sorted by SLA risk. A red "At risk" group appears at the top. Reason: P1, P2. This is the core loop, not a stat tile |

---

## 3. Property Management

### 3.1 Add Property: MVP

| Field (original) | Status | Notes |
|---|---|---|
| Property name or reference | MVP | Required |
| Property address | MVP | Required (street line) |
| City | MVP | Required |
| State | MVP | Required (US state code) |
| ZIP code | MVP | Required |
| Property type | MVP | Enum: `single_family`, `multi_family`, `condo`, `townhouse`, `mobile_home`, `other` |
| Number of units | **Changed** | Derived from the unit records, not typed in. Creating a single-family property auto-creates one unit. Reason: avoids a number that disagrees with reality |
| Property owner | MVP | Link to an Owner record (name, email, phone, approval threshold). Required for approvals |
| Property notes | MVP | Free text (gate codes, shut-off valve location, etc.) |
| *(added)* Emergency contact phone | **Changed (added)** | Shown in the emergency banner (§5.4). Defaults to the firm's emergency number |
| *(added)* CSV import | **Changed (added)** | Properties, units, owners, tenants and vendors import from CSV, so firms can go live without retyping their PMS. Reason: double entry is the #1 adoption risk (business-strategy §9) |

### 3.2 Property List: MVP

Search ✔, filter (by type, owner, city, has open requests) ✔, view details ✔, edit ✔, archive ✔. All MVP.

Archived properties are hidden by default and keep their history. They can't receive new requests.

### 3.3 Property Details page: MVP

Displays all of the following (MVP):
- property information
- property owner
- associated tenants
- maintenance history
- open maintenance requests
- completed maintenance jobs
- recorded maintenance expenses (sum of approved invoice amounts, by month)

### 3.4 Unit Management: MVP

- Managers create unit records under a property. For example, Green Valley Apartments → Unit 101, 102, 103, 104.
- Each unit has its own maintenance history (requests and WOs filtered by unit).
- Bulk-add units ("101–124") is MVP because it's cheap and saves real time.

---

## 4. Tenant Management

**Purpose:** maintain tenant information and connect tenants to their properties and units.

### 4.1 Add Tenant: MVP

| Field (original) | Status |
|---|---|
| Tenant name | MVP |
| Email address | MVP (email or phone required) |
| Phone number | MVP (mobile, for SMS) |
| Associated property | MVP |
| Unit number | MVP (link to Unit) |
| Occupancy status | MVP. Enum: `current`, `notice_given`, `past` |
| *(added)* SMS consent flag + timestamp | **Changed (added)**. Required for 10DLC compliance |

### 4.2 Tenant Directory: MVP

View all ✔, search ✔, filter by property ✔, view details ✔, update ✔, mark tenancy inactive ✔ (sets `occupancy_status = past`, which revokes the tenant's links).

### 4.3 Tenant Maintenance Portal: Changed (no-login)

The original asked for a "simple way to submit and monitor requests". The way changes; every capability is kept.

| Capability (original) | Status | How |
|---|---|---|
| Submit a new request | MVP | Public firm or property request link (shareable URL + printable QR). The tenant identifies themselves by email or phone and is matched to their tenant record. Unmatched submissions go to the PM marked "Unverified tenant" |
| View previously submitted requests | MVP | A "My requests" magic link, emailed or texted on demand, lists all of the tenant's requests |
| Upload additional photos | MVP | On the request tracking page |
| Provide appointment availability | MVP | On submission. Editable on the tracking page while unscheduled |
| Receive maintenance updates | MVP | Email/SMS on status changes that matter to the tenant (§8.1) |
| Confirm repair completion | MVP | "Fixed / Not fixed" + optional rating |

Reason for no-login: tenants submit a few times a year. Passwords cause drop-off and support tickets (T3: tenants need visibility, not accounts).

---

## 5. Maintenance Request Management

**Purpose:** this is one of the most important modules. A maintenance request is a reported problem that needs attention. Tenants **or property managers** can create one (MVP: PMs log phone and email reports on the tenant's behalf).

### 5.1 Submit Maintenance Request: form fields

| Field (original) | Status | Notes |
|---|---|---|
| Property | MVP | Prefilled from tenant record |
| Unit number | MVP | Prefilled from tenant record |
| Issue title | MVP | Required |
| Issue description | MVP | Required |
| Maintenance category | MVP | Required. List below |
| Priority | **Changed** | The tenant picks an *urgency* from plain-language options mapped to the 4 levels. The **PM confirms the final priority** during triage. Reason: P5, everything gets marked an emergency |
| Photos or attachments | **Changed** | Required (≥1) for categories where a photo helps (plumbing, appliance, roofing, pest, painting, general). Optional otherwise. Reason: P4, bad intake causes back-and-forth |
| Preferred appointment availability | MVP | Free text + quick picks (weekday mornings, etc.) |
| Permission to enter the property, where applicable | MVP | Yes / No / Only if I'm home |
| *(added)* Access notes and pets | **Changed (added)** | Reason: V4, access problems delay jobs |

**Example (original, kept as the canonical demo and test fixture):**
- **Title:** Kitchen Sink Leak
- **Description:** Water is leaking from the pipe underneath the kitchen sink.
- **Category:** Plumbing
- **Priority:** Normal
- **Property:** 123 Main Street
- **Unit:** 204

### 5.2 Self-help checklist before submit: Changed (added)

For a small, curated set of safe issues, the form shows 2–4 checks first, then "Still broken? Continue".
- Tripped breaker or GFCI
- Garbage disposal reset
- Thermostat batteries or mode
- Clogged toilet (plunger)
- Smoke alarm chirp (battery)

Rules:
- The content is deterministic. No AI chat.
- Each check ends with "If unsure, stop and submit".
- Never shown for emergency keywords.

Reason: remote resolution handles about 25–30% of requests per AppFolio and Latchel (self-reported, market-research §1.4). Fixflo uses this same pattern.

### 5.3 Maintenance Categories: MVP

Predefined categories (all 10 from the original):
1. Plumbing
2. Electrical
3. HVAC
4. Roofing
5. Appliance repair
6. Pest control
7. Cleaning
8. Painting
9. General maintenance
10. Other

Managers can customise categories (add, rename, deactivate; history keeps the old name): **MVP**.

### 5.4 Priority Levels: MVP (definitions kept, SLA targets added)

| Priority | Original definition | Default SLA: assign / complete (**estimate, configurable**) |
|---|---|---|
| **Emergency** | Potentially urgent issues requiring immediate escalation through the property's designated emergency procedure | 1 h / 24 h |
| **High** | Issues requiring prompt attention | 4 h / 3 days |
| **Normal** | Regular maintenance problems | 24 h / 5 days |
| **Low** | Non-urgent maintenance or minor repairs | 72 h / 14 days |

- **SLA targets: Changed (added).** Reason: overdue and "at risk" need a clock (P2). The 5-day Normal target is below Property Meld's 6.8-day satisfaction threshold (T2).
- SLAs use calendar hours in v1. A business-hours calendar is **Later**.

**Emergency disclaimer: MVP, strengthened.** The platform clearly communicates that submitting a request does not replace emergency services or the property's emergency contact procedure.

- The text appears on the request form header, on the confirmation screen and in the confirmation email.
- *(Changed, added)* When the tenant selects Emergency **or** the description contains emergency keywords (gas, smell gas, flood, flooding, sparks, smoke, fire, no heat, carbon monoxide, sewage), a blocking banner appears: "If anyone is in danger call 911. For gas leaks leave and call your gas utility. Then call [property emergency number]". The tenant must tick "I understand" before continuing.
- The PM is notified immediately by SMS + email.
- Reason: P5 and liability (business-strategy §9). We never auto-dismiss or downgrade an emergency.

### 5.5 Request Tracking: reference numbers: MVP (format clarified)

- Every request gets a unique reference: `MR-2026-001`. The format is `MR-{YYYY}-{seq}`, where the sequence is per firm, resets each calendar year and is zero-padded to 3 digits. It grows naturally past 999 (`MR-2026-1000`).
- Work orders use the same scheme: `WO-2026-001`.

### 5.6 Manager actions on requests: all MVP

- View requests
- Search requests (reference, title, tenant, address)
- Filter by priority
- Filter by property
- Filter by status
- Edit request details (edits are logged to the timeline)
- Add internal notes (never visible to tenant/vendor/owner)
- Convert a request into a work order (prefills the WO from the request)
- Close or cancel a request with a recorded reason (reason required; picklist + free text)
- *(added)* **Request more info from the tenant.** Status becomes `needs_info` and the tenant gets a link to answer or add photos. The clock waits on the tenant. Reason: P4; also workflow step 2 ("whether additional information is needed")
- *(added)* **AI suggestions.** Suggested category, priority and "missing info" questions are shown to the PM. Suggestions only, never auto-applied. Reason: P4 and P5 at under $1/account/month (business-strategy §4)

**Request status enum:** `new` → `needs_info` ↔ `new` → `in_progress` (has an active WO) → `resolved` (WO closed). Two side exits: `closed` (no work needed, with reason: duplicate, resolved by tenant, not our responsibility, …) and `cancelled` (withdrawn, with reason).

The original specified "close or cancel with a reason" and "marked resolved" but no enum. This one is new.

---

## 6. Work Order Management

**Purpose:** a maintenance request describes a problem. A work order is the actual job created to resolve it.
- *Request:* Kitchen sink leaking.
- *Work order:* Inspect and repair the leaking kitchen sink pipe.

One request can have **several** work orders (follow-up or rework). Each WO belongs to exactly one request.

### 6.1 Create Work Order: MVP

Created from a maintenance request. A PM-initiated job without a tenant report uses "New job", which creates the request and WO together.

| Field (original) | Status | Notes |
|---|---|---|
| Work order ID | MVP | `WO-2026-001` |
| Related maintenance request | MVP | Required |
| Property and unit | MVP | Inherited from the request |
| Repair description | MVP | Prefilled from the request |
| Assigned contractor | MVP | Optional at Draft |
| Priority | MVP | Inherited, editable |
| Expected completion date | MVP | Defaults to the priority SLA |
| Estimated cost | MVP | PM's estimate. Compared against the owner threshold to predict whether owner approval is needed |
| Required work | MVP | Scope of work / checklist text shown to the vendor |
| *(added)* Quote required? | **Changed (added)** | Toggle. Defaults to on when estimated cost ≥ owner threshold. Drives `awaiting_quote` |
| *(added)* Bill to | **Changed (added, review)** | `owner` (default), `tenant` (tenant-caused damage, chargeback) or `warranty` (home warranty / manufacturer). Shown on the expense CSV so the PM bills the right party in the PMS. Reason: it's a common split in SFR management, and getting it wrong is lost money |

### 6.2 Assignment: MVP + compliance gate (Changed)

- The PM picks a vendor from the directory, filtered by category and coverage area.
- **If the vendor's insurance or licence is expired or missing**, a hard warning appears and the PM must type a reason to override. The override is logged. Reason: P7.
- On assignment, the vendor gets the job link by SMS + email.

### 6.3 Quotations and approvals: MVP (approval routing Changed)

**Quote submission**
- The vendor submits a quote (amount, description, optional file) via the job link.
- The vendor can revise a quote; old versions are kept, which gives the "historical quotations" list.

**Approval routing (Changed, added)**
- If the quote amount ≤ the owner's auto-approve threshold (falling back to the firm default), the PM approves in one click, or it is auto-approved if the firm enables that.
- If the amount is above the threshold, the PM reviews it and taps "Send to owner". The owner receives an approval link with photos, quote and Approve / Decline / "Call me" (with note).

**Recording decisions**
- Every decision is stored with who, when, the channel and the amount: the **approval history**.

**When a quote is declined**, the PM chooses one of:
- ask for a revised quote (→ `awaiting_quote`)
- reassign (→ `draft`)
- cancel

### 6.4 Invoices: MVP

- The vendor submits an invoice (amount, invoice #, file) with the completion report.
- The PM approves the invoice as part of closing the job.
- Approved invoice amount = the **recorded expense** on the property, category and vendor.
- **Paying the vendor is out of scope.** It stays in the PMS. A CSV export of closed WOs/expenses is formatted for bill import (§9.5).

### 6.5 Work Order Status: Changed

The original's 11 suggested statuses are kept as concepts but reshaped. Two of them are moments, not states. One is ambiguous. One real waiting state was missing.

Each status maps to **who the job is waiting on**, which powers the dashboard queue and reminders (P1).

| Original status | MVP status | Waiting on | Decision |
|---|---|---|---|
| Draft | `draft` | PM | MVP |
| Assigned | *(merged into `awaiting_acceptance`)* | — | **Changed.** Assignment immediately sends the job link, so "assigned but not awaiting acceptance" never exists. Kept as a timeline event |
| Awaiting contractor acceptance | `awaiting_acceptance` | Vendor | MVP |
| Accepted | *(merged; next state is `awaiting_quote` or `awaiting_scheduling`)* | — | **Changed.** Acceptance is an event. What matters for the clock is the next wait. Kept as a timeline event |
| *(none)* | `awaiting_quote` | Vendor | **Changed (added).** Workflow step 6 is a real wait on the vendor that needs its own reminder |
| Awaiting approval | `awaiting_approval` | Owner or PM | **Changed (clarified).** Means *quote approval before work starts* (workflow step 7). The original list placed it after "In progress", which conflicted with the workflow |
| Awaiting scheduling | `awaiting_scheduling` | Vendor (+ tenant) | MVP |
| Scheduled | `scheduled` | Vendor (appointment) | MVP |
| In progress | `in_progress` | Vendor | MVP |
| Completed | `completed` | PM | MVP. Means "vendor reported done; PM review pending" (workflow steps 10–11) |
| Closed | `closed` | — | MVP (workflow step 12) |
| Cancelled | `cancelled` | — | MVP. Reason required |

**Allowed transitions (MVP)**

```
draft → awaiting_acceptance                (assign)
awaiting_acceptance → draft                (vendor declines with reason / PM unassigns)
awaiting_acceptance → awaiting_quote       (accept, quote required)
awaiting_acceptance → awaiting_scheduling  (accept, no quote)
awaiting_quote → awaiting_approval         (quote submitted)
awaiting_approval → awaiting_scheduling    (approved)
awaiting_approval → awaiting_quote | draft | cancelled   (declined)
awaiting_scheduling → scheduled            (appointment set)
scheduled → scheduled                      (rescheduled)
scheduled → in_progress                    (vendor taps Start)
in_progress → completed                    (vendor submits completion: photos, notes, invoice)
completed → in_progress                    (PM requests more work/info)
completed → closed                         (PM approves)
any open state → cancelled                 (PM, reason required)

# added in review: real-world paths the happy path misses
scheduled | in_progress → awaiting_quote   (vendor inspected, needs approval for the real repair)
awaiting_approval → in_progress            (approved while vendor is on site)
scheduled → awaiting_scheduling            (no access / tenant no-show / vendor cancels; reason required)
awaiting_acceptance | awaiting_scheduling → in_progress   (emergency only: vendor is on the way)
```

**Review additions (Changed):**
- **Diagnose, then quote.** Most real jobs are "go look, then tell me the price". The vendor can request approval from `scheduled` or `in_progress` with a quote. The same approval routing applies.
- **Emergency fast path.** For `emergency` priority, the vendor can go straight from accept to `in_progress`. Quote approval is skipped up to the firm's **emergency spend limit** (org setting, default $500, *estimate*); management agreements normally give the PM that authority. The owner gets an after-the-fact notice. Above the limit, the PM is asked to approve by phone and log it.
- **Missed appointment.** "No access" is a first-class outcome with a reason (`tenant_no_show`, `no_permission`, `vendor_cancelled`). It goes back to scheduling and is counted in vendor and tenant reports (V4).
- **Invoice over the approved amount.** If the invoice is more than the approved quote (or estimated cost) by more than 10% (*estimate, configurable*), closing requires the PM to confirm the overage. If the new total crosses the owner's threshold, the owner must also approve it. This stops "approved $300, invoiced $700" surprises (P3: owners "don't trust what they're being charged").

- The PM can **act on a vendor's behalf** at any step ("proxy update", logged as such), so jobs never get stuck on an unresponsive vendor (business-strategy §9).
- **Custom statuses: Later.** See §10.3.

### 6.6 Work Order Details page: MVP

Each work order displays all of the following (MVP):
- the maintenance issue (request, photos)
- property details
- **tenant information needed for the job:** name, phone, availability, permission to enter, access notes. Vendors see only this subset; no other tenant data
- contractor information
- quotation (current + history)
- approval history
- appointment details
- communication history (§8.4)
- uploaded documents
- completion photos
- invoice information

### 6.7 Work Order Timeline: MVP

Every important action is shown in chronological order, with actor and channel. Internal-only events are marked and hidden from external links.

Example (original, used as the acceptance fixture):
- 10:00 AM: Work order created.
- 10:15 AM: Contractor assigned.
- 10:45 AM: Contractor accepted.
- 11:30 AM: Appointment scheduled.
- Next day, 9:00 AM: Repair started.
- Next day, 11:30 AM: Repair completed.
- Next day, 12:00 PM: Manager closed work order.

---

## 7. Vendor Management

**Purpose:** store and manage information about all contractors and service providers working with the firm.

### 7.1 Add Vendor: MVP

| Field (original) | Status | Notes |
|---|---|---|
| Vendor/company name | MVP | |
| Contact person | MVP | |
| Email address | MVP | |
| Phone number | MVP | Mobile for SMS |
| Business address | MVP | |
| Service categories | MVP | Multi-select from the firm's categories |
| Service coverage areas | **Changed** | ZIP codes and/or cities as tags. Map-radius coverage is **Later** |
| Availability | **Changed** | Free text (e.g. "Mon–Fri 8–5, emergencies 24/7"). Structured calendar is **Later** (§1.3) |
| Notes | MVP | Internal |
| *(added)* SMS consent flag | **Changed (added)** | 10DLC |
| *(added)* "Invite vendor to confirm details" link | **Changed (added)** | Vendor fills in or confirms their own details and uploads docs. Reduces PM typing |

### 7.2 Vendor Directory: MVP

View all ✔, search ✔, filter by service category ✔, filter by location (coverage ZIP/city) ✔, view profiles ✔, edit ✔, activate/deactivate ✔. Deactivated vendors can't be assigned; their history is kept.

### 7.3 Vendor Profile: MVP

Displays all of the following (MVP):
- contact information
- services offered
- service locations
- assigned work orders
- completed jobs
- pending jobs
- historical quotations
- **recorded response times** (median assign → accept, and accept → scheduled, computed from timeline events)
- internal manager notes
- *(added)* compliance status badge (OK / Expiring / Expired)

### 7.4 Vendor Documents: MVP + dispatch gate (Changed)

- Store and track: business licences, insurance certificates (COI), W-9 forms and other compliance documents (type `other` with a label).
- Each document has an **expiration date and reminders**: MVP. Defaults (**estimate, configurable**): remind the vendor and PM 30 days and 7 days before expiry and on the expiry date. The vendor's reminder contains an upload link.
- *(Changed, added)* Expired or missing insurance triggers the assignment warning (§6.2).
- W-9s contain tax IDs, so they are stored in a private bucket, served by short-lived signed URL and visible to Admin/Manager only.

---

## 8. Communication and Notifications

**Purpose:** keep everyone informed without the PM manually contacting every participant.

### 8.1 Email Notifications: MVP (all 8 original triggers)

| Trigger (original) | Recipients (MVP) |
|---|---|
| A maintenance request is submitted | PM (all managers, or the property's assigned manager); tenant (confirmation + tracking link) |
| A work order is assigned | Vendor (job link) |
| A vendor accepts or declines | PM; tenant on accept ("a vendor has been assigned") |
| An appointment is scheduled | Tenant, vendor, PM |
| A quotation is submitted | PM |
| An approval is requested | Owner (approval link) or PM |
| A repair is completed | PM; tenant after close (confirm-fixed link) |
| An invoice is submitted | PM |

Added triggers (Changed): needs-info request to tenant; approval decided (PM, vendor); emergency submitted (PM, immediate); document expiring (vendor, PM).

### 8.2 SMS Notifications: Changed (moved into MVP, narrowly)

- **Original:** "potential later feature for important updates and appointment reminders".
- **Research:** vendors ignore email and portals (V5). Moving vendor confirmation "out of email and into SMS" was the fix one PM reported (#1283143).
- **MVP SMS covers only:**
  - vendor job links and reminders
  - appointment reminders (tenant + vendor)
  - emergency alerts to the PM
  - tenant status updates (opt-in)
- **Safeguards:**
  - transactional content only
  - STOP/HELP handling
  - 10DLC registration starts in week 0
  - **per-firm registration (Changed, review):** we send on behalf of each PM firm, so carriers treat us as an ISV. Each firm needs its own brand + campaign (10DLC) or its own verified toll-free number, submitted with *that firm's* business details through Twilio's ISV APIs. Signup collects legal name, EIN, address, website, privacy and terms URLs. SMS turns on per firm once approved (days to weeks). Messages read "[Firm name]: …"
  - until a firm's SMS is approved, and as a permanent fallback: email plus a "Copy link to text from your phone" button. Onboarding never waits on SMS
- **Later:** inbound two-way SMS threading into the WO. In v1, inbound SMS gets an auto-reply with the job link and is forwarded to the PM's email.

### 8.3 Internal Comments: MVP

Property managers and authorised team members can add internal notes to work orders (and requests). These notes are **never** visible to tenants, contractors or owners. This is enforced server-side by a `visibility = internal` flag, not just hidden in the UI.

### 8.4 Work Order Communication History: MVP

A chronological record of communications related to each work order:
- every notification sent (channel, recipient, template, delivery status)
- every note posted via a link by a vendor, tenant or owner
- every shared comment

Rendered inside the timeline with a "Communications only" filter.

### 8.5 Automated Reminders: MVP (reminder periods configurable)

| Reminder | Original example? | Default (**estimate, configurable**) |
|---|---|---|
| Contractor has not accepted | Yes ("after 24 hours") | Nudge the vendor at 4 h; **alert the PM at 24 h** (the original's period, kept as the escalation). Emergency: nudge at 30 min, alert at 1 h |
| Appointment is scheduled for tomorrow | Yes | Tenant + vendor, 24 h before |
| Job is overdue | Yes | PM + vendor when past expected completion/SLA, then daily |
| Owner approval is still pending | Yes | Re-send to the owner at 24 h; alert the PM at 48 h |
| *(added)* Quote not submitted | | Vendor at 48 h after acceptance |
| *(added)* Completion awaiting PM review | | PM at 24 h |
| *(added)* Tenant hasn't answered a needs-info request | | Tenant at 48 h |
| *(added)* Vendor document expiring | | 30 d / 7 d / 0 d (§7.4) |

- Reminder periods are configurable per firm (Settings §10.2): MVP.
- Every reminder sent appears in communication history.
- A breached reminder moves the job into the dashboard "At risk" group.

---

## 9. Maintenance Reports and Analytics

**Purpose:** help PMs understand their maintenance operations and give owners clear records. All reports filter by date range and property. Owner filtering is **Changed (added)**, since owners receive these.

| Report (original) | Contents (all original items) | Status |
|---|---|---|
| **Maintenance Summary** | Total requests, completed, pending, overdue, average completion time. *(added)* Median request → close, median approval time | MVP |
| **Property Maintenance Report** | Per property: maintenance history, repair descriptions, contractor details, completion dates, recorded costs, photos and invoices | MVP. This is the owner-facing record |
| **Vendor Performance** | Jobs assigned, jobs completed, average response time, average completion time, overdue jobs | MVP |
| **Financial Report** | Total maintenance expenses; by property; by category; by vendor; monthly spending trend | MVP. Simple tables + one bar chart |

### 9.5 Export Reports

| Item | Status | Notes |
|---|---|---|
| CSV export | MVP | Every report. Plus a "closed work orders / expenses" CSV for PMS bill import (Changed, added: business-strategy §2) |
| PDF export | **Changed** | Every report has a print-optimised view with firm logo, exported through the browser's "Save as PDF". Server-generated PDFs (scheduled, emailed to owners) are **Later**. Reason: the same output for a fraction of the build effort |

---

## 10. Settings and Account Management

### 10.1 Company Settings: MVP

Company name ✔, business address ✔, contact details ✔ (incl. emergency phone), logo ✔ (used on emails, links and reports), default timezone ✔. All MVP.

### 10.2 Notification Settings: MVP

- Email notification preferences: per user, per event type. MVP.
- Reminder frequency: the periods in §8.5. MVP.
- Notification recipients: per event, choose all managers or the property's assigned manager, plus extra CC emails. MVP.
- *(added)* SMS on/off per audience. Changed (added).

### 10.3 Maintenance Settings

| Item (original) | Status | Notes |
|---|---|---|
| Custom maintenance categories | MVP | §5.3 |
| Priority definitions | MVP | Editable description text + SLA targets per priority (§5.4) |
| Approval thresholds | MVP | Firm default + per-owner override + optional "auto-approve under threshold". *(added, review)* Emergency spend limit and invoice-overage tolerance (§6.5) |
| Default job statuses | **Later** | Statuses are fixed in v1 because reminders, clocks and reports depend on them (§6.5). Renaming display labels is Later. Custom statuses only if customers ask repeatedly |

### 10.4 Account Settings: MVP (security partly Later)

| Item (original) | Status |
|---|---|
| User profile | MVP |
| Password management | MVP (change/reset) |
| Login security | **Changed.** MVP: email+password with breached-password check, Google sign-in, session list with "sign out everywhere". TOTP 2FA is **Later** (fast follow, weeks 13–16) |
| Account preferences | MVP (timezone, email digest on/off) |
| *(added)* Team members: invite, role, deactivate | Changed (added). Required for "authorised team members" |

---

## 11. Subscription Management: MVP via Stripe

| Item (original) | Status | Notes |
|---|---|---|
| Current subscription | MVP | Plan, price, active door count, next invoice |
| Unit limits | **Changed** | No tiered unit caps. Billing is **$1.25 per active door per month, $99 minimum**. The trial allows a full portfolio import and is capped at 15 work orders (Changed in review: a 25-door cap blocked 50–300-door firms from importing their real portfolio). "Active door" = a unit with a current tenant or any WO in the month (business-strategy §3.2) |
| Billing information | MVP | Stripe Customer Portal |
| Plan upgrades and cancellations | MVP | Stripe Customer Portal. Monthly/annual switch. Cancel at period end. Data export stays available for 30 days after cancellation |

---

## 12. Complete Maintenance Workflow (12 steps)

The original workflow describes how all modules work together. It is kept in full; the right-hand column shows how v1 implements each step.

| Step | Original | v1 implementation | Status |
|---|---|---|---|
| **1. Tenant reports an issue** | A tenant submits a request (e.g. a leaking kitchen pipe) with property and unit, issue description, photos and preferred availability. The system creates a request with a unique ID | Tenant opens the firm/property request link → self-help checklist (if relevant) → form → emergency banner if triggered → `MR-2026-001` created, status `new`. The tenant gets a confirmation + tracking link; the PM is notified | MVP (self-help + banner Changed, §5.2/5.4) |
| **2. PM reviews the request** | The manager decides: whether the request is valid; its priority; which contractor is appropriate; whether additional information is needed | The request page shows AI suggestions (category, priority, questions). The PM can: confirm priority; close as invalid with a reason; "Request more info" (→ `needs_info`, clock waits on the tenant); or proceed. Vendor suggestions are filtered by category + coverage + compliance | MVP (AI suggestions + needs_info Changed, §5.6) |
| **3. Manager creates a work order** | The request is converted into a WO containing all relevant repair information | "Convert to work order" prefills the WO. Status `draft` | MVP |
| **4. Manager assigns a contractor** | The manager selects a plumber from the vendor directory. The plumber receives a job notification | Pick a vendor (compliance gate) → `awaiting_acceptance` → SMS + email job link. Reminder clock starts | MVP (gate Changed, §6.2) |
| **5. Contractor accepts the job** | The contractor opens the job link and accepts. If unavailable, they decline with a reason | Link → Accept → `awaiting_quote` or `awaiting_scheduling`. Decline (reason required) → `draft`, PM alerted to reassign | MVP |
| **6. Contractor submits a quotation** | If an estimate is needed, the contractor submits the expected cost | If "quote required": the vendor submits amount/description/file → `awaiting_approval` | MVP |
| **7. Approval is obtained** | The manager reviews the quote. If owner approval is required, the owner receives an approval request. The system records the decision | Under threshold: PM one-click (or auto). Over threshold: owner approval link (Approve / Decline / Call me). The decision is logged in the approval history → `awaiting_scheduling` | MVP (owner link + thresholds Changed, §1.5/6.3) |
| **8. Appointment is scheduled** | The contractor and tenant agree on an appointment. The system records the date and time and sends notifications | The vendor sees the tenant's availability, permission to enter and phone; the vendor enters the date + time window → `scheduled`. Tenant, vendor and PM notified. The tenant can tap "This time doesn't work" (alerts vendor + PM). Day-before reminders | **Changed** (vendor records the agreed slot; self-serve slot picking Later, §1.3) |
| **9. Repair work begins** | The contractor changes the status to In Progress. The manager can monitor progress | Vendor taps "Start job" → `in_progress`. Visible on the dashboard and timeline | MVP |
| **10. Contractor completes the repair** | The contractor updates the status, uploads completion photos, adds completion notes and submits the invoice | One completion screen on the link: photos (≥1 required), notes, invoice amount + file → `completed` | MVP |
| **11. Manager reviews the work** | The manager checks the submitted information. If something is incomplete, they can request more work or information | The PM reviews photos, notes and invoice. Either "Approve & close" or "Request more work/info" (with note → vendor link; → `in_progress`) | MVP |
| **12. Work order is closed** | The WO is marked closed; the request is marked resolved; the tenant receives an update; the property history is updated; the expense is recorded | On close: WO `closed`; request `resolved` (if no other open WOs); tenant gets a "Was it fixed?" link (Fixed / Not fixed + rating; "Not fixed" reopens the request to `new` and alerts the PM); property/unit history updated; approved invoice amount recorded as the expense; optional owner completion summary email | MVP (owner summary Changed, §1.5) |

---

## 13. MVP user stories and acceptance criteria

The format is "As a…, I want…, so that…", followed by acceptance criteria (AC). These are the test plan for v1.

**Onboarding and setup**

- **US-01: CSV import.** As a PM, I want to import properties, units, owners, tenants and vendors from CSV, so that I'm live without retyping my PMS.
  AC:
  - Templates are downloadable.
  - A validation preview shows row-level errors before commit.
  - Re-importing the same file doesn't create duplicates (matched on external ID or address+unit / email).
  - A 300-row file imports in under 30 s.
- **US-02: Vendor self-onboarding.** As a PM, I want to send vendors a link to confirm their details and upload their COI/W-9/licence with expiry dates, so that I don't type them in.
  AC:
  - The link works without login and expires after 14 days.
  - Uploads accept PDF/JPG/PNG up to 15 MB.
  - The vendor record shows compliance status immediately.
- **US-03: Team.** As an Admin, I want to invite managers, so that my team shares the workload.
  AC:
  - The invite email arrives.
  - Managers cannot see Billing.
  - A deactivated user loses access immediately.
- **US-04: Company settings.** As an Admin, I want to set logo, timezone, emergency phone, categories, priority SLAs, approval thresholds and reminder periods.
  AC:
  - Changes apply to new events going forward.
  - The logo appears on all outbound emails and link pages.

**Intake and triage**

- **US-05: Tenant submits a request.** As a tenant, I want to report an issue from my phone in under 2 minutes, without an account.
  AC:
  - The form works on a 375 px wide screen.
  - Required fields: title, description, category, urgency, ≥1 photo for photo-required categories, availability, permission to enter.
  - The emergency disclaimer is always visible.
  - On submit: a reference `MR-YYYY-NNN` is shown and emailed/texted with a tracking link.
  - The PM is notified within 1 minute.
- **US-06: Emergency handling.** As a tenant reporting a gas smell, I want to be told what to do right now.
  AC:
  - Choosing Emergency or typing any configured keyword shows the blocking banner with 911/utility guidance and the property emergency number.
  - The banner needs acknowledgement.
  - The PM gets SMS + email immediately.
  - Self-help is never shown.
  - Priority cannot be auto-lowered.
- **US-07: Self-help.** As a tenant with a dead outlet, I want quick safe checks, so that I might not need a visit.
  AC:
  - Checks are shown only for mapped categories/keywords.
  - "Fixed it" records a deflection event (no request created); "Still broken" continues with the answers attached.
- **US-08: PM logs a request.** As a PM, I want to create a request for a tenant who phoned.
  AC: the same fields; the source is recorded as `pm_entered`; the tenant still gets the tracking link.
- **US-09: Triage.** As a PM, I want to see AI-suggested category, priority and missing-info questions, and accept or ignore them.
  AC:
  - Suggestions appear within 10 s of submission or are omitted silently on failure.
  - Nothing is applied without a PM click.
- **US-10: Request more info.** As a PM, I want to ask the tenant a question with one click.
  AC:
  - The tenant gets the question via email/SMS with a reply/upload link.
  - Status is `needs_info`; the dashboard shows "Waiting on tenant".
  - The tenant's answer returns the request to `new` and notifies the PM.
- **US-11: Find and manage requests.** As a PM, I want to search, filter (priority, property, status), edit, add internal notes, and close/cancel with a reason.
  AC:
  - Close/cancel cannot be saved without a reason.
  - Edits and notes appear in the timeline.
  - Internal notes are absent from every external link response (verified by API test).

**Work orders**

- **US-12: Create WO.** As a PM, I want to convert a request into a WO with fields prefilled.
  AC:
  - All §6.1 fields are present.
  - `WO-YYYY-NNN` is assigned.
  - The request moves to `in_progress` when the WO leaves `draft`.
- **US-13: Assign with compliance gate.** As a PM, I want to pick a vendor filtered by category and area, and be warned about expired insurance.
  AC:
  - Expired/missing COI shows a warning that requires a typed reason; the override is logged.
  - On assign, the vendor gets SMS + email within 1 minute.
- **US-14: Vendor accepts or declines.** As a vendor, I want to accept or decline from the text message in under 30 s.
  AC:
  - The link opens without login on mobile.
  - It shows address, issue, photos, required work and tenant access info.
  - Decline requires a reason and returns the WO to `draft` with a PM alert.
  - The link is scoped to this WO only and expires 30 days after close.
- **US-15: Quote.** As a vendor, I want to submit or revise a quote.
  AC: the amount is required; revisions keep history; the PM is notified.
- **US-16: Approval routing.** As a PM, I want quotes under the owner's threshold to need only my click (or auto-approve), and quotes over it to go to the owner.
  AC:
  - The threshold falls back owner → firm default.
  - The owner email contains photos, quote and Approve/Decline/Call me, and works without login.
  - The decision records actor, timestamp, channel and amount.
  - Reminders follow §8.5.
- **US-17: Schedule.** As a vendor, I want to record the appointment I agreed with the tenant.
  AC:
  - Date + time window are required.
  - Tenant, vendor and PM are notified.
  - The tenant's "doesn't work" alerts the vendor and PM.
  - Day-before reminders go out.
  - Rescheduling is logged.
- **US-18: Progress and completion.** As a vendor, I want to start the job, then submit photos, notes and invoice in one screen.
  AC:
  - Completion requires ≥1 photo and an invoice amount.
  - Status becomes `completed`; the PM is notified.
- **US-19: Review and close.** As a PM, I want to approve and close, or send it back.
  AC:
  - Close sets the WO `closed` and the request `resolved` (if no other open WOs), records the expense = invoice amount, and sends the tenant the confirm-fixed link.
  - "Request more work" returns the WO to `in_progress` with a note to the vendor.
- **US-19a: Real-world paths (review).** As a PM, I want the job to survive inspections, emergencies, missed appointments and invoice overages.
  AC:
  - A vendor on site can submit a quote from `scheduled`/`in_progress`; approval returns the job to `in_progress` or `awaiting_scheduling`.
  - An emergency WO can go accept → `in_progress`; approval is skipped up to the emergency spend limit and the owner gets a notice.
  - "No access" needs a reason, returns the WO to `awaiting_scheduling` and is logged.
  - An invoice more than 10% over the approved amount can't be closed without PM confirmation (plus owner approval if it crosses the threshold).
  - `bill_to` appears on the WO and on the expense CSV.
- **US-20: Proxy update.** As a PM, I want to perform any vendor step on their behalf when they call me instead.
  AC: every proxy action is labelled "by [PM] on behalf of [vendor]" in the timeline.
- **US-21: Timeline and communication history.** As a PM, I want every action and message on one chronological timeline.
  AC:
  - It covers all status changes, assignments, quotes, approvals, appointments, notifications (with delivery status) and comments.
  - The original timeline example renders as specified.
  - External viewers see only shared events.

**Visibility**

- **US-22: Waiting-on dashboard.** As a PM, I want to open the app and see what's stuck and on whom.
  AC:
  - All 8 original stat tiles are shown.
  - The queue is grouped Vendor/Tenant/Owner/You with time waited.
  - "At risk" holds jobs past an SLA or reminder escalation.
  - Counts match the report numbers for the same filter.
- **US-23: Reminders.** As a PM, I want the system to chase people for me.
  AC:
  - Each reminder in §8.5 fires within 15 minutes of its due time.
  - It doesn't fire if the state has already changed.
  - It is logged in communication history.
  - Periods are editable in Settings.
- **US-24: Tenant tracking and confirmation.** As a tenant, I want to see status and appointment, add photos, and confirm the fix.
  AC:
  - The tracking link shows status in plain words.
  - "My requests" lists all of the tenant's requests.
  - "Not fixed" reopens the request and alerts the PM.
- **US-25: Reports.** As a PM, I want the four reports with CSV and print-to-PDF.
  AC:
  - Date/property/owner filters work.
  - The CSV opens cleanly in Excel/Sheets.
  - The print view fits US Letter with the logo.
  - The Property report includes photo thumbnails and invoice links.
- **US-26: Vendor document expiry.** As a PM, I want to be reminded before a COI expires.
  AC:
  - Reminders go out at 30/7/0 days to vendor (with upload link) and PM.
  - The vendor badge changes to Expiring/Expired.
- **US-27: Billing.** As an Admin, I want to start a trial, add a card, see my active-door count and manage my plan.
  AC:
  - The trial imports any number of doors and blocks the 16th work order with an upgrade prompt.
  - The Stripe portal handles card/plan/cancel.
  - A failed payment gives a 7-day grace period, then read-only.

---

## 14. Change log vs. the original PRD/workflow

**Deferred (Later):**
1. SMS: two-way inbound threading (outbound SMS moved into MVP, see Changed)
2. Structured vendor availability calendar
3. Self-serve appointment slot picking by tenant/vendor
4. Map/radius vendor coverage areas
5. Server-generated / scheduled PDF reports
6. Custom ("default") job statuses and renamable status labels
7. TOTP two-factor authentication
8. Full owner portal (was already out of v1 in the original)
9. Finer team permissions beyond Admin/Manager
10. Business-hours SLA calendars

**Changed:** see §1.1, 1.3, 1.4, 1.5, 2, 3.1, 4.3, 5.1, 5.2, 5.4, 5.6, 6.2, 6.3, 6.5, 7.1, 7.4, 8.2, 8.5, 9.5, 10.4, 11 and workflow step 8. The main items are:
- no-login links instead of vendor/tenant portals
- owner emails sent directly + one-tap approval + thresholds
- work order statuses reshaped (11 → 10)
- PM confirms priority
- required photos
- SLA targets
- emergency keyword banner
- self-help checklist
- AI suggestions
- compliance gate on assignment
- SMS moved into MVP for vendors and reminders
- number of units derived
- per-door billing instead of unit limits
- PDF via print view

**Added in the 2026-11-07 review** (§6.1, §6.5, §8.2, §11):
- diagnose-then-quote, emergency fast path with spend limit, missed-appointment outcome, invoice-overage check
- `bill_to` (owner / tenant / warranty)
- per-firm SMS registration with an email + copy-link fallback
- trial capped by work orders (15) instead of doors (25)

**Later, noted in the review:** preventive and recurring maintenance (e.g. HVAC filters, gutter cleaning) and turnover/make-ready jobs. Both are common SFR workflows and an expansion path, but not part of the reactive-repair MVP.

**Dropped:** none. Every original requirement is kept, deferred or changed.

---

## 15. Data model outline

Postgres. Every table has `id` (uuid), `org_id` (except `organizations`), `created_at` and `updated_at`. Row-level isolation is by `org_id`.

### Entities

| Entity | Key fields | Relationships |
|---|---|---|
| **organizations** | name, address, phone, emergency_phone, logo_url, timezone, default_approval_threshold, auto_approve_under_threshold (bool), emergency_spend_limit_cents, invoice_overage_pct, legal_name, ein, website, sms_registration_status (`none`\|`pending`\|`approved`\|`rejected`), sms_sender, sla_config (jsonb per priority), reminder_config (jsonb), stripe_customer_id, plan, trial_ends_at, status | has many of everything below |
| **users** (PM accounts) | email, name, phone, role (`admin`\|`manager`), notification_prefs (jsonb), active | belongs to org |
| **owners** | name, email, phone, approval_threshold (nullable → org default), notify_mode (`direct`\|`pm_forwards`), send_completion_summary (bool) | org; has many properties |
| **properties** | name_ref, address_line, city, state, zip, type (enum), notes, emergency_phone, archived_at, external_id | org, owner; has many units |
| **units** | label ("101"), notes, external_id | property; has many tenants, requests |
| **tenants** | name, email, phone, occupancy_status (enum), sms_consent_at, external_id | unit (→ property) |
| **vendors** | company_name, contact_name, email, phone, address, categories (uuid[]), coverage_zips (text[]), coverage_cities (text[]), availability_text, notes, active, sms_consent_at | org; has many vendor_documents, work_orders |
| **vendor_documents** | type (`license`\|`insurance`\|`w9`\|`other`), label, file_key, expires_on, status (computed: `valid`\|`expiring`\|`expired`) | vendor |
| **categories** | name, active, photo_required (bool), self_help_key (nullable) | org |
| **maintenance_requests** | ref (`MR-2026-001`), title, description, category_id, tenant_urgency, priority (enum), status (enum), source (`tenant_link`\|`pm_entered`), availability_text, permission_to_enter (enum), access_notes, emergency_ack_at, close_reason, ai_suggestions (jsonb), tenant_rating, tenant_confirmed (`fixed`\|`not_fixed`\|null) | unit, tenant (nullable for unverified), category; has many work_orders, attachments |
| **work_orders** | ref (`WO-2026-001`), description, required_work, priority, status (enum), vendor_id (nullable), expected_completion_date, estimated_cost, quote_required (bool), bill_to (`owner`\|`tenant`\|`warranty`), waiting_on (derived: `pm`\|`vendor`\|`tenant`\|`owner`\|null), status_changed_at, cancel_reason | maintenance_request, unit, vendor; has many quotes, appointments, invoices, attachments, events |
| **quotes** | amount_cents, description, file_key, version, status (`pending`\|`approved`\|`declined`\|`superseded`) | work_order, vendor |
| **approvals** | approver_type (`pm`\|`owner`\|`auto`), approver_id, decision (`approved`\|`declined`\|`call_me`), note, amount_cents, channel (`app`\|`email_link`\|`sms_link`), decided_at | quote |
| **appointments** | starts_at, ends_at, status (`scheduled`\|`rescheduled`\|`tenant_conflict`\|`no_access`\|`done`\|`cancelled`), no_access_reason (`tenant_no_show`\|`no_permission`\|`vendor_cancelled`), set_by (actor) | work_order |
| **invoices** | invoice_number, amount_cents, file_key, status (`submitted`\|`approved`\|`rejected`), approved_at | work_order, vendor |
| **expenses** | amount_cents, incurred_on, category_id, bill_to, exported_at | work_order (1:1 on close), denormalized property_id, unit_id, vendor_id for reporting |
| **attachments** | file_key, mime, size, kind (`issue_photo`\|`completion_photo`\|`document`), uploaded_by (actor) | polymorphic: request or work_order |
| **events** (timeline + audit) | subject_type, subject_id, type (e.g. `wo.assigned`, `wo.accepted`, `notification.sent`), actor_type (`user`\|`vendor`\|`tenant`\|`owner`\|`system`), actor_id, on_behalf_of, visibility (`internal`\|`shared`), payload (jsonb) | request or work_order. Append-only |
| **comments** | body, visibility (`internal`\|`shared`), author (actor) | request or work_order |
| **notifications** | channel (`email`\|`sms`), recipient_type, recipient_id, to_address, template, status (`queued`\|`sent`\|`delivered`\|`failed`\|`bounced`), provider_id, sent_at | work_order or request; written to events too |
| **reminders** | type (enum from §8.5), subject_id, due_at, fired_at, cancelled_at | work_order / request / vendor_document |
| **access_links** | token_hash, subject_type (`vendor`\|`tenant`\|`owner`), subject_id, scope_type, scope_id, purpose (`job`\|`approval`\|`request_track`\|`my_requests`\|`vendor_profile`\|`doc_upload`\|`confirm_fix`), expires_at, revoked_at, last_used_at | points to work_order / request / quote / vendor |
| **deflections** | category_id, self_help_key, created_at | org. Self-help "fixed it" events, for KPI |
| **counters** | kind (`MR`\|`WO`), year, next_value | org. Used for reference numbers inside a transaction |

### Enums

- **property_type:** `single_family`, `multi_family`, `condo`, `townhouse`, `mobile_home`, `other`
- **occupancy_status:** `current`, `notice_given`, `past`
- **priority:** `emergency`, `high`, `normal`, `low`
- **request_status:** `new`, `needs_info`, `in_progress`, `resolved`, `closed`, `cancelled`
- **work_order_status:** `draft`, `awaiting_acceptance`, `awaiting_quote`, `awaiting_approval`, `awaiting_scheduling`, `scheduled`, `in_progress`, `completed`, `closed`, `cancelled`
- **permission_to_enter:** `yes`, `no`, `only_if_home`

### Rules worth stating

- `waiting_on` and the SLA clock are derived from `status` + `status_changed_at`. Reminders are rows created on each transition and cancelled on the next.
- Link tokens are 128-bit random, stored hashed, and scoped to one subject + one object. A tenant link can never read another tenant's data. A vendor link exposes only the tenant subset listed in §6.6.
- Money is stored as integer cents in USD.
