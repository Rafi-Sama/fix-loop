# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite + React + TypeScript SPA in `web/`, talking to the Fastify API in `server/` (cookie sessions, `APP_URL` = the web origin, dev port 5173). Confirmed by the user 2026-11-07.

## Users

- **Primary: the property manager.** A PM or coordinator at a US residential firm with 50–300 doors and 1–5 staff, using only third-party vendors. They work at a laptop most of the day and check a phone between showings. Their job is to keep every repair moving, so they need to see what's stuck and on whom, and act in one click.
- **Admin** (firm owner): also manages team, settings, thresholds.
- **Fixloop superadmin** (our own staff, not a firm user): the `/ops` console for firm accounts, sign-in security and suspensions. Sees counts only, never a firm's tenants, properties or jobs.
- **Vendors, tenants and owners never log in.** They act through single-purpose links on their phones: a vendor runs the whole job from a text message, a tenant reports and tracks a repair, an owner approves a quote from one email.

## Product Purpose

Fixloop is a maintenance follow-up layer that sits beside the firm's existing PMS. Every open job has an owner, a clock and a one-tap link, so nothing goes stale silently. Success: the PM opens the app, sees the "waiting on" queue, and clears it; vendors accept in under 30 seconds; owners approve in one tap.

## Positioning

Not a PMS, not a vendor marketplace, not an "AI coordinator". The wedge is no-login links for vendors, tenants and owners, plus a compliance gate that warns before dispatching a vendor with expired insurance. Tagline from the docs: "Stop chasing vendors. Every repair closes itself."

## Operating Context

- 12-step workflow (docs/prd.md §12): tenant reports → PM triages → work order → assign vendor → accept → quote → approval → schedule → start → complete → PM review → close.
- Work order statuses map to who it's waiting on (PM / vendor / tenant / owner). The dashboard's default view is that queue, with an "At risk" group.
- Reports (summary, vendor performance, financial, per-property) export to CSV and print to PDF from the browser.
- Emergency handling is a liability surface: the 911 / gas-utility disclaimer must stay visible on tenant intake, and emergencies are never downgraded.

## Capabilities and Constraints

- Built in the backend: auth (signup with email confirmation, login, sessions, password change/reset, invites), org settings (SLAs, reminder periods, thresholds, emergency keywords), categories, team, owners, properties and units, tenants, vendors with compliance documents, requests (triage, needs-info, notes, close/cancel), work orders (full state machine, proxy updates), dashboard, four reports plus expense CSV, file uploads (presigned S3), public tenant intake with self-help and emergency banner, all link pages, and the Fixloop superadmin console (firm accounts, suspension, an append-only security log).
- Not built in the backend yet: CSV import, Stripe billing, AI triage suggestions, logo upload, notification preferences, 2FA for firm users (superadmins already need an authenticator code). The UI must not pretend these exist.
- Money is integer cents in USD. Reference numbers look like `MR-2026-001` and `WO-2026-001`.
- Product name: **Fixloop** (codename, kept in one constant so it's easy to change).

## Evidence on Hand

Research and planning docs in `docs/`. There are no customers, testimonials, logos or metrics, and none may be invented.

## Product Principles

1. Show who it's waiting on and since when, everywhere.
2. One click for the common path; typed reasons only where liability or money is involved.
3. Link pages for outside parties are phone-first, need no account, and never leak internal data.
4. Be honest about state: never imply a message was sent by SMS when only email is enabled.

## Accessibility & Inclusion

Tenant and vendor pages must work on a 375 px screen (PRD US-05). WCAG AA contrast and full keyboard use in the PM app.
