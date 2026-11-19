# fixloop web

React SPA for the API in [`../server`](../server). The design system is described in [`../DESIGN.md`](../DESIGN.md). Day-to-day commands (`pnpm dev`, `pnpm check`, seed data, test credentials) are in [`../DEVELOPMENT.md`](../DEVELOPMENT.md).

```bash
npm install
npm run dev        # http://localhost:5173, proxies /api → http://localhost:4000 (API_URL to override)
npm run build      # typecheck + production bundle in dist/
npm test           # unit tests (vitest)
```

The API's `APP_URL` must equal this app's origin: cookies, the CSRF Origin check and every emailed link (`/l/:token`) depend on it. In production, serve `dist/` and route `/api/*` to the API on the same origin, or set `VITE_API_URL`.

## Layout

```
src/
  lib/          api client, query hooks (one cache key per resource), formatting + enum labels, uploads
  components/   ui primitives, dialogs/toasts, files (gallery + uploader), timeline, charts, pickers, QR
  layouts/      AppShell (PM app chrome)
  pages/        one folder per area; every route is lazy-loaded
    links/      the no-login page for vendors, owners and tenants (one route, rendered by link purpose)
    public/     tenant intake (/r/:slug, /r/:slug/p/:propertyId) and "my requests"
    auth/       sign-in, sign-up, forgot password, and the "check your email" gate shown until the address is confirmed
    ops/        Fixloop superadmin console (/ops): its own sign-in, session and lazy chunk; firm users never load it
```

## Rules

- Server reads go through `lib/queries.ts` (the console's in `pages/ops/ops.ts`, with query keys under `'ops'` so its 401s never sign a firm user out); writes go through `useCommand`, which refreshes the cache roots it touches plus the dashboard.
- List filters live in the URL (`useFilters`), so lists can be shared and survive back/forward.
- Enum labels exist only in `lib/format.ts`.
- The UI never decides a state transition. It offers the actions that fit the current status, and the server's state machine has the final say.

## Not wired (no backend yet)

CSV import, Stripe billing, AI triage suggestions, logo upload, per-user notification preferences, 2FA for firm users.
