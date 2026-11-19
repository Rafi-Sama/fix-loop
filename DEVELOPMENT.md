# Developing Fixloop

Everything runs from the repo root with pnpm. You need Node 22+, pnpm and Docker. The scripts install the rest.

```bash
pnpm dev          # install what's missing → docker up → migrate → API + worker + web (first run seeds demo data)
pnpm check        # install, docker, auto-fix, lint, typecheck, tests, build budget, audit, secrets, code health
pnpm seed         # seed the demo firm (skips if it exists)
pnpm seed:reset   # delete the demo firm and seed it again
pnpm links        # newest vendor / owner / tenant links from the worker log
pnpm superadmin   # manage Fixloop staff accounts for the /ops console (see below)
pnpm lint         # Biome lint for web/, server/ and scripts/;  pnpm lint:fix applies safe fixes
```

Guests at `/` see the landing page (`web/src/pages/Landing.tsx`); signed-in users see the queue. Its screenshots in `web/public/landing/` are real captures: `node scripts/landing-shots.mjs <out-dir> <issue.jpg> <fixed.jpg>` runs one repair through the running app and shoots every step as PNG (it adds one closed job at 402 Oak St #A to the demo firm; `pnpm seed:reset` removes it).

| Service | URL | Notes |
|---|---|---|
| Web app | http://localhost:5173 | Vite, proxies `/api` to the API |
| API | http://localhost:4000 | Fastify, `GET /health` |
| Postgres | localhost:5433 | `owner/owner` (migrations, worker), `app_user/app_user` (API, row-level security) |
| MinIO | http://localhost:9101 | console, `minio` / `minio-secret`; S3 API on :9100 |

## Test credentials

`pnpm dev` seeds these on first run. `pnpm seed:reset` rebuilds them.

| Who | Email | Password | What you can test |
|---|---|---|---|
| Admin | `admin@greenvalley.test` | `Fixloop-demo-2026!` | everything, including firm settings, team, categories |
| Manager | `manager@greenvalley.test` | `Fixloop-demo-2026!` | day-to-day work; settings are read-only |
| Deactivated | `former@greenvalley.test` | `Fixloop-demo-2026!` | sign-in is refused |
| Invite pending | `invited@greenvalley.test` | none | shows "Invite pending" in Settings → Team |

Vendors, tenants and owners never have passwords. They act through one-time links that are emailed or texted. In dev, the worker logs those messages instead of sending them, one line each (`email → to · template · subject · link`); set `LOG_LEVEL=debug` in `server/.env` to also see each message's full text:

- `pnpm links` prints the newest link of each kind (vendor job, owner approval, tenant tracking, question, confirm fix, invite, password reset, email confirmation).
- The tenant intake link is printed by `pnpm seed`. It's also in Settings → Request link, and each property page has its own QR link.

### What the demo firm contains

Green Valley Property Co has 4 owners (one forwards approvals manually), 6 properties (1 archived), 15 units (1 archived) and 11 tenants (current, notice given, past). It has 7 vendors, covering every compliance state: compliant, insurance expiring, insurance expired, licence expired, no insurance, deactivated.

Requests and work orders cover every state: draft, awaiting acceptance (past SLA), awaiting quote, quote waiting on you, quote with the owner, revised quote approved by phone, scheduled after a no-show, in progress (overdue), sent back for more work, completed and awaiting review (invoice over the estimate), an emergency started straight away, closed (spread over six months for the charts), and cancelled. There are also a needs-info question, an unverified tenant submission with a photo, a self-help "fixed it", duplicate and cancelled requests, internal and shared notes, and tenant ratings.

### Extra firms in the review database

The 2026-11-09 launch review left these firms in the dev database it ran against. `pnpm seed` doesn't create them, and `pnpm seed:reset` doesn't remove them (it only rebuilds the demo firm).

| Firm | What it's for | Sign-in |
|---|---|---|
| Perf Scale Co | the 300-door target size: 120 properties, 300 units, 5,000 requests, about 4,800 work orders | `perf-admin@scale.test` / `Perf-scale-review-2026!` |
| Perf Noise Co | 10× that (3,000 doors, 50k requests), so tables look multi-tenant | `perf-noise@scale.test` / `Perf-scale-review-2026!` |
| Lakeside Rentals, Critic Security Co, test | sign-ups made while testing email confirmation and security | not needed |
| Northwestern Regional Residential Property Management…, Critic Bulk Firm 01–32 | long names, many users and enough firms for "Load more" in the superadmin console | not needed |

Delete any of them from the dev database with `delete from organizations where name = '…'` as the owner role (the firm and everything it owns cascade).

## Superadmin console (`/ops`)

Fixloop staff use a separate console at http://localhost:5173/ops: every firm's accounts, sign-in problems and the security log, plus suspend / un-suspend a firm and lock-out, session, deactivation and email-confirmation fixes for any user. It shows per-firm counts, never a firm's tenants, properties or jobs.

Superadmins are not firm users. They sign in with a password **and** a 6-digit authenticator code, sessions end after 8 hours or 30 idle minutes, and 5 failures lock the account for 15 minutes. There is no sign-up page; create them on the server:

```bash
pnpm superadmin add you@fixloop.com "Your Name"   # prints a password and an authenticator setup key, once
pnpm superadmin code you@fixloop.com              # dev only: the current 6-digit code, instead of a phone
pnpm superadmin reset you@fixloop.com             # new password + setup key, ends their sessions
pnpm superadmin disable you@fixloop.com           # or enable
pnpm superadmin list
```

In production run the compiled CLI with the API's `DATABASE_URL`: `node dist/cli/superadmin.js add …`. Every command is written to the security log.

## Email confirmation

New sign-ups get a "Confirm your email" link (48 hours) and see only a "Check your email" screen until they open it. Invited teammates and anyone who completes a password reset are confirmed by that link. In dev the email is in the worker log (`pnpm links` → "Email confirmation"). The worker doesn't reload code: restart `pnpm dev` after changing email templates.

## `pnpm check`

Each stage prints PASS / WARN / FAIL. The full findings go to `.check/report.md`, and the command exits 1 if any stage fails.

| Stage | What it does |
|---|---|
| Environment | Node 22+, pnpm, Docker present |
| Dependencies | installs root/server/web when `node_modules` is missing or the lockfile changed (each package keeps its own package manager: server and web use npm lockfiles) |
| Infrastructure | creates `server/.env` from the example, `docker compose up`, waits for Postgres and MinIO, runs migrations |
| Auto-fix | Biome's safe fixes in `web/`, `server/` and `scripts/` |
| Lint | Biome over web, server and scripts, with file:line for every finding |
| Typecheck | strict `tsc` for server and web |
| Tests | server unit + integration (real Postgres and MinIO) and web unit tests |
| Build & bundle budget | production build; initial JS must stay under 130 KB gzip |
| Security | `npm audit` of production dependencies, committed-secret patterns, unsafe `.env` settings, `.gitignore` coverage |
| Code health | documented `shortcut:` debt, TODOs, stray `console.log`, files over 450 lines |

Flags: `--fast` (skip tests, build and audit), `--no-fix` (change nothing).

Lint configuration is in `biome.json`. For CSS, `noImportantStyles` and `noDescendingSpecificity` are off: the `!important`s override inline grid templates on phones, and the specificity-order rule is noise for this stylesheet.

## Troubleshooting

- **"already in use: API :4000":** another `pnpm dev` or a stray server is running. Check with `lsof -i :4000`.
- **Requests appear twice in dev tools:** that's React StrictMode in development. It mounts each component twice and cancels the first fetch. Production makes one request per resource.
- **Seeding pauses with "rate limited":** the API allows 300 requests a minute per user. The seed waits and continues.
