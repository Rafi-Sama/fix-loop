# Audit

Open decisions and accepted limitations first, then the 2026-11-09/10 launch review, then the 2026-11-07 bug hunt it built on. The automated half regenerates with `pnpm check` into `.check/report.md`.

## Open decisions

Calls for the product owner. Each one is a choice, not a bug: the current behaviour works and is tested.

**Product and UX**
- **Emergency downgrades.** The system never downgrades an emergency, but a PM can change it to normal in triage or on the work order (logged on the timeline). The PRD says "the PM confirms the final priority". If liability needs it, require a typed reason.
- **"Shared" notes go nowhere outside the team.** Link pages never show comments, so "shared" only means "not internal". Drop the toggle, or show shared notes on the vendor/tenant link page.
- **"Start free" on sign-in** implies a paid tier, but billing isn't built. Consider "Set up your firm".
- **Emergency keywords vs. the urgency choice.** When intake detects an emergency, the "How urgent" radio still shows the tenant's pick (e.g. Normal) while the button says "Send emergency request". Auto-selecting Emergency is clearer but overrides the tenant.
- **Invoice overruns.** An invoice a little over an owner-approved quote ($455 on $420) closes without asking the owner again. Say if you want a cap.
- **Revisited owner links.** An owner who reopens an approval email after deciding sees "expired", not "already handled".
- **Dashboard at scale.** At 300 doors the dashboard renders every open job (about 1.1 s of main-thread work on a slow CPU). Virtualise, or add "show more" per column. Narrow columns show "1d 22h" without the word "oldest".
- **Suspended message** says "Contact Fixloop support" with no address or link. Add one.
- **Firm security log.** Firm admins can't see their own firm's security log; the data exists (`security_events` by org), only a Settings page is missing.
- **Suspension doesn't queue mail.** Messages skipped while a firm is suspended aren't re-sent after un-suspending (deliberate, so people aren't flooded).
- **Tenant impersonation at intake.** Intake matches tenants by their own email or phone, so anyone who knows them can file a "verified" request. Inherent to no-login intake; PMs see the contact used on each request.
- **Not built:** CSV import, billing, AI triage, logo upload, notification preferences, per-firm SMS registration (so no firm can text yet), inbound SMS, delivery webhooks. See PRODUCT.md.

**Security**
- **2FA for firm users** isn't built (superadmins need an authenticator code).
- **Lockout as a denial of service.** 10 wrong passwords lock a firm account for 15 minutes, 5 lock a superadmin, so anyone who knows the email can keep them out. Alternatives: CAPTCHA, or per-IP throttling only. `pnpm superadmin reset` or another superadmin clears a superadmin lock.
- **Sign-in limit is per IP only.** Someone rotating IPs can keep guessing one account (the lockout, breach check and password rules still apply). A per-email limit is the usual addition. A locked firm account also answers 429, which reveals the lock.
- **Unconfirmed sign-ups are never cleaned up,** so an address someone else registered stays taken until its owner resets the password. Option: delete unconfirmed firms after e.g. 7 days.
- **Superadmin reads aren't logged,** only actions. Add read logging if compliance needs it.
- **TOTP secrets are stored in plain text** (`platform_admins`; the API must read them). Encrypt with a key outside the database if the database is shared.
- **Database error messages include query parameters,** so a 500 on a sign-in query would log the email. Applies to every route.
- **After a reload, an ended session** shows the plain sign-in page without the "session ended" notice (the server can't tell an ended session from none without a new error code).

**Infrastructure**
- **Rate limits are in memory per instance.** Use a Redis store before running a second API instance (marked `shortcut:` in `plugins/security.ts`).
- **Managed Postgres.** Migration 0002 marks `enum_eq`/`enum_ne` LEAKPROOF so status filters can use indexes under RLS; that needs superuser. RDS, Cloud SQL and Supabase don't grant it: the migration logs a NOTICE and those queries fall back to scanning the firm (fine at 300 doors, about 5× slower at 3,000). Pick a host where an admin can run those two `ALTER FUNCTION`s once, or accept it.
- **Hosting.** `deploy/nginx.conf` assumes one host running nginx, the API and the worker. TLS, process supervision, backups and the S3 bucket (private, CORS for `APP_URL`) are yours to choose. `/assets/*` is immutable and safe behind a CDN; without one, first-visit LCP on a phone is about 2 s.
- **Scale.** Measured to 3,000 doors in one firm and about 55k work orders across firms. Above about 1,000 properties the native property pickers want a searchable combobox. Firm search costs about 30 ms per searched column per 50k rows (RLS blocks trigram indexes): 20–40 ms at 300 doors, 160–180 ms at a 50,000-request firm.

## Accepted limitations

Known and kept, with the reason.

- Presigned file URLs issued before a firm is suspended stay valid for their lifetime (up to 15 min); new ones can't be issued.
- Reminders for a suspended firm still fire; the worker drops their messages.
- Uploads trust the declared content type (no magic-byte sniffing). S3 is another origin and SVG/HTML aren't allowed, so the risk is low.
- The cleanup job re-checks request attachments every 15 minutes (about 100 ms at 100k photos). Revisit near 1M.
- Every firm-scoped request costs 4 fixed round trips (session, BEGIN, set_config, COMMIT; about 0.2 ms each). Pipelining would hide `set_config` errors.
- Initial JS is 104 KB gzip, mostly React, react-router and React Query; going lower means changing libraries.
- Dialogs close instantly (their content unmounts, so an exit animation would fade an empty sheet).
- The superadmin CLI's generated passwords have a tiny modulo bias (about 137 bits instead of 138).

## Launch review: 2026-11-09/10

Three parallel critics (features and security; design and UX; performance and code quality), a second end-to-end browser pass, the superadmin and email-confirmation build with its own two critics, a search audit and a docs audit. Final `pnpm check`: all 10 stages pass.

**Features and security**
- Firms can be deleted: `tenants` had no foreign key to `organizations`, and the composite foreign keys are now deferrable (migration 0003).
- Vendor job links are revoked when a job closes (they showed tenant contact and access notes for 60 days).
- Invite and reset links report their purpose, so a mistyped link no longer opens a set-password form.
- `deploy/nginx.conf`: same-origin serving, CSP and security headers, immutable assets, gzip for API JSON.
- Production refuses to boot with `EMAIL_PROVIDER=log`, a non-https `APP_URL` or `TRUST_PROXY=0`.
- The 911 / gas strip shows in every intake state, including dead links and outages.
- Honest messaging: nothing claims an SMS was sent when the firm can't text; unreachable owners and vendors get a 409 instead of a job stuck waiting.
- SMS consent at intake only records for the tenant's own number.
- Constraint names no longer leak in 409s; a rate-limit test was added.
- Owner approval no longer says "expired" right after approving.
- Appointment times are entered and shown in the firm's time zone, not the device's.
- Team emails in the timeline name each recipient instead of showing "→ you" twice.

**Superadmin, security log, email confirmation**
- Sign-up requires email confirmation; unverified users reach only `/auth/me`, logout and resend (a test walks every route).
- `security_events`: an append-only log of sign-ins, failures with reasons, lockouts, password and team changes and every superadmin action; kept 400 days.
- Superadmins: separate accounts, password plus TOTP, lockout, 8 h sessions with a 30 min idle timeout, created only by `pnpm superadmin`.
- The `/ops` console: firms with counts, security tiles, firm page with account actions, security log, superadmin list. Suspension stops sessions, sign-in, links, intake and outgoing mail at once.
- Critic fixes: CSRF for ops sessions, superadmin enumeration through the lock response, missed re-lock logging, confirm links working for suspended firms, `search_path` on the SECURITY DEFINER stats function, and two log-filter bugs.

**Design and UX**
- Focus ring visible on the ink top bar; "Skip to content" visible on focus; dialogs focus their first field; Esc closes the phone menu.
- No horizontal scroll on phones (Settings tables, long pasted URLs); dashboard band titles on one line.
- The note checkbox was inverted; the timeline showed raw template keys and "1 entries"; read-only settings looked editable to managers.
- Toasts slide out, new screens fade in (180 ms), and reduced motion is respected.
- The superadmin users table uses a "Manage" menu; a suspended mid-session user lands on sign-in instead of a crash screen.

**Performance**
- Status filters use indexes under RLS (migration 0002); list and foreign-key indexes (0002, 0004). The slowest endpoint at 3,000 doors went from 215 to 41 ms.
- Photo URLs come with detail payloads (7 requests to 1); the work order page no longer loads the vendor profile.
- Keyset pagination no longer skips rows created in the same millisecond (0005); pickers load past 100 rows.
- Charts load after the dashboard paints (LCP 2.8 to 2.05 s, CLS 0.153 to 0.067).
- Superadmin queries at 1M log entries: every listing under 50 ms (migrations 0008–0010; per-firm counts only for the firms on screen).

**Code and docs**
- Files over 450 lines split with no behaviour change; lint is 0/0 for web, server and scripts, and `pnpm check` now covers `server/` too.
- `pnpm seed` confirms the demo accounts (it broke once confirmation was required).
- Dev logs: one line per email (`pnpm links` reads it), tick and cleanup noise at debug, and the dev API listens on localhost only.
- Every doc was checked against the code and corrected.

## 2026-11-07 bug hunt

A manual bug hunt on top of `pnpm check`: every PM screen loaded with all network calls recorded (dev server and production build), link pages loaded anonymously and checked for internal data, and a code review of the web app and scripts.

### Fixed in this pass (web)

| Area | Problem | Fix |
|---|---|---|
| Security | Link pages carry the access token in the URL. Photos load from S3/MinIO, and the Google Maps link opens another site, so the browser sent the full URL, token included, as `Referer`. | `<meta name="referrer" content="same-origin">`. Verified: the MinIO request now has no Referer. |
| Security | `?next=/\evil.com` after sign-in could slip past the open-redirect guard in some browsers. | `safeNext` also rejects `/\`. |
| Security / leakage | A session that expired (or was revoked by "sign out everywhere" or deactivation) left the firm's cached records on screen, with every action failing. | Any 401 drops all cached firm data and returns to sign-in with a return path. |
| Robustness | No error boundary: one render error, or a lazy chunk missing after a deploy, gave a white screen. | Top-level boundary with a reload screen. Chunk-load failures reload once by themselves. |
| Duplicate calls | With the dashboard on 7 or 90 days, the top bar still polled the 30-day dashboard, so 2 polls a minute. | The period is shared state; the shell and dashboard read one cached query. |
| Duplicate calls | Lists appeared to fetch twice. | Dev-only (React StrictMode re-mount cancels the first request). Confirmed on the production build: 1 call per resource on every screen. |
| Memory leak | Upload previews (`blob:` URLs) were never released. | Revoked on remove and on unmount. |
| Bug | Search boxes kept stale text after back/forward or "Clear filters". | The box now follows the URL. |
| Bug | Set-password "confirm" only re-validated when typing in it, so changing the first field left it falsely valid or invalid. | Controlled field with an inline mismatch message; submit is disabled until they match. |
| Bug | Tenant intake crashed on plain-HTTP LAN addresses (`crypto.randomUUID` needs a secure context). | Fallback UUID from `crypto.getRandomValues`. |
| Bug | The close dialog didn't know the backend's new rule (spend above the owner threshold always needs owner approval), so it showed an enabled button that the server then rejected. | The dialog mirrors the rule and asks for the owner's offline approval. |
| Accessibility | 16 buttons with no `type`; inside a form they submit it. | `type="button"`. |
| Accessibility | ARIA roles standing in for real elements (`div role=button/group/radiogroup/list`), `aria-label` on elements whose role doesn't allow it, a clickable lightbox `div`. | Native `<button>`, `<fieldset>`, `<search>`, radio inputs, `<ol>` for the progress pipe, labelled regions. |
| Code quality | 35 comma-expression handlers, effects with wrong dependency lists, a `useCallback` that never memoised. | Rewritten; Biome is clean for `web/` and `scripts/`. |
| Dev tooling | Vite listens on IPv6 only, so `pnpm dev`'s readiness and port-busy checks missed it. | Probes both `127.0.0.1` and `::1`. |

### Backend findings (`server/`)

Reported here on 2026-11-07, when the backend was maintained separately. All were fixed in the launch review above; the backend is no longer maintained separately.

| Severity | Issue | Evidence | Suggested fix |
|---|---|---|---|
| High | **Fixed 2026-11-09 (migration 0003).** **A firm can't be deleted.** Composite `(org_id, id)` foreign keys don't cascade, so `delete from organizations` fails once the firm has tenants. Cancellation and data-retention deletes will break. | `ERROR: ... violates foreign key constraint "tenants_org_id_unit_id_units_org_id_id_fk"` | `ON DELETE CASCADE` on the composite FKs, or an ordered purge function. `scripts/lib.mjs` `deleteOrg` is a dev-only workaround. |
| Medium | **Fixed 2026-11-09.** **N+1 signed-URL calls.** Every thumbnail fetches its own download URL (`GET /files/:id/url`, `GET /links/:t/files/:id`). A completion report with 6 photos makes 6 calls. | Network probe | Return signed URLs (or a batch endpoint) with `attachments` in the detail payloads. |
| Medium | **Fixed 2026-11-09.** **Work order detail has no vendor compliance status**, so the page loads the whole vendor profile (5 queries) just for the badge. | `GET /vendors/:id` on every work order page | Add `vendor.compliance` to `GET /work-orders/:id`. |
| Medium | **Fixed 2026-11-09.** **Invite and reset tokens look like invalid tokens.** `GET /links/:token` returns 404 for both, so the UI shows a set-password form for any unknown link. | `links.routes.ts` purpose list | Return the purpose (`user_invite` / `password_reset`), or 410 with a reason. |
| Low | **Fixed 2026-11-09 (pinned by digest).** `minio/minio:latest` is unpinned, so `pnpm dev` can change underneath you. | `server/docker-compose.yml` | Pin a release tag. |
| Low | **Fixed 2026-11-09 (`LOG_LEVEL`).** Development API logs every request at debug level, which buries useful lines in `pnpm dev`. | `app.ts` logger level | `info` by default, `LOG_LEVEL` to opt in. |
| Low | **Fixed 2026-11-09 (lint is 0/0).** 7 lint warnings (3 `useOptionalChain`, 4 `noExplicitAny` in test helpers) and a `console.log` in `db/migrate.ts`. | `.check/report.md` | `pnpm lint:fix` fixes the safe ones. |

### Deployment (production config)

**Addressed 2026-11-09:** [`deploy/nginx.conf`](deploy/nginx.conf) serves `web/dist` on the API's origin with these headers.

- **Security headers for the SPA:** whatever serves `web/dist` should send:
  - a CSP: `default-src 'self'`, `img-src 'self' blob: data: <S3 origin>`, `connect-src 'self' <S3 origin>`, `frame-ancestors 'none'`
  - `X-Content-Type-Options: nosniff`
  - long-cache headers for `/assets/*`

  Vite's dev server sends none of these.
- **Same origin:** serve the API under the same origin (`/api`). The session cookie is `SameSite=Lax` and CSRF checks `Origin === APP_URL`.

### Verified clean

- Link pages call only `/api/links/*`. No PM endpoint or session call is made, and no internal notes, override reasons or owner contact details appear for vendors or tenants.
- No vulnerable production dependencies (`npm audit`), no committed secrets, and `.env` is ignored.
- The initial JS was 103 KB gzip (104 KB on 2026-11-09, budget 130 KB). Charts (112 KB) load only on the dashboard, reports and property pages. Link pages never load them.
- No API call slower than 250 ms on the seeded data.
