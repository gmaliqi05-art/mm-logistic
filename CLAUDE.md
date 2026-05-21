# CLAUDE.md

This document orients AI assistants working in the `mm-logistic` repository. Read this first before exploring the codebase.

## Project overview

`mm-logistic` is a multi-tenant SaaS platform for logistics, fleet, depot, repair, and accounting operations. It is targeted at pallet/transport companies operating in the EU (DE/FR/AL/EN locales). Recent commits show heavy focus on:

- Pallet stock with conditions (good / damaged), sorting, and repair workflows (depot "depoist" workers process incoming pallets; "reparature" workers repair damaged stock).
- Fleet management: vehicles, trailers, drivers, compliance documents, live GPS tracking, route planning.
- Accounting: invoices, purchases, VAT regimes, bank reconciliation, fixed-asset depreciation, DATEV/SAF-T exports, journal posting.
- HR: leave, attendance, work hours.
- Multi-language UI (Albanian primary, plus English, German, French).

User roles (gated by `profile.role`):

- `super_admin` — platform operators (`/super-admin`).
- `company_admin` — tenant owners (`/company`).
- `logistics_admin` — dispatch-only role (`/logistics`).
- `depot_worker` — partitioned further by `worker_category` (`depoist` vs `reparature`) (`/depot`).
- `driver` — mobile / PWA users (`/driver`).
- Accounting access is gated through a subscription check, not a single role (`/accounting`).

## Tech stack

From `package.json`:

- React 18.3 + TypeScript 5.5, Vite 5.4 build (`vite.config.ts`).
- Routing: `react-router-dom` v7.
- Backend: Supabase (`@supabase/supabase-js` v2.57) — Postgres + Auth + Storage + Edge Functions.
- UI: Tailwind CSS 3.4, `lucide-react` icons.
- Editor: TipTap v3 (`@tiptap/react`, `starter-kit`, `link`, `placeholder`).
- Maps: Leaflet + `react-leaflet` v4.
- Scanning: `html5-qrcode` (barcode/QR), plus custom OCR via edge functions.
- Testing: Vitest 2 (node environment, `*.test.ts(x)` under `src/`).
- Lint: ESLint 9 with `typescript-eslint`, `react-hooks`, `react-refresh`.

## Common commands

From `package.json`:

```bash
npm run dev         # start Vite dev server
npm run build       # production build (vite build)
npm run preview     # preview built bundle
npm run lint        # eslint .
npm run typecheck   # tsc --noEmit -p tsconfig.app.json
npm run test        # vitest run (one-shot)
npm run test:watch  # vitest watch mode
```

There is no `format`, `prettier`, or `start` script. CI should run `lint`, `typecheck`, `test`, `build`.

Required env vars (see `.env.example`):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The Supabase client throws if these are unset (`src/lib/supabase.ts`). Auth session is persisted to `localStorage` under the key `mm-logistic-auth`.

## Project structure

Top-level layout (`/home/user/mm-logistic`):

```
src/                    Frontend application
supabase/migrations/    SQL migrations (timestamped, applied in order)
supabase/functions/     Deno edge functions
docs/                   Project documentation (mostly Albanian)
public/                 Static assets (icons, manifest)
.bolt/                  Bolt.new template metadata — do not edit
.github/workflows/      GitHub Actions
index.html              Vite entry HTML
```

### `src/` tree

- `src/App.tsx` — root component; declares all routes, wires `AuthProvider`, `SubscriptionProvider`, `LanguageProvider`, push subscription banners, install prompt. Uses `lazy` + a `lazyWithRetry` helper for chunked routes.
- `src/main.tsx` — Vite entry, mounts `<App />`.
- `src/index.css`, `src/styles/` — global styles (Tailwind layer + custom CSS).
- `src/components/` — shared UI. Subfolders by domain: `accounting/`, `chat/`, `compliance/`, `delivery/`, `depot/`, `documents/`, `driver/`, `fleet/`, `hr/`, `location/`, `scanner/`, `stock/`, `subscription/`, `superadmin/`, `support/`, `trailers/`, `ui/`. Loose files at the root cover banners and global widgets (`InstallPromptBanner.tsx`, `PushEnableBanner.tsx`, `LanguageSwitcher.tsx`, `ErrorBoundary.tsx`, etc.).
- `src/contexts/` — React contexts. `AuthContext.tsx` (session + profile + role), `SubscriptionContext.tsx` (plan gating), `DriverTrackingContext.tsx` (live geolocation pushes).
- `src/hooks/` — domain hooks: notifications, push, compliance, signed URLs, branding, subscriptions, driver tracking, etc.
- `src/layouts/` — one per role: `SuperAdminLayout`, `CompanyAdminLayout`, `DepotLayout`, `DriverLayout`, `AccountingLayout`, `LogisticsLayout`, `EmailAutomationLayout`. Each renders a sidebar + `<Outlet />`.
- `src/pages/` — route pages, grouped by role: `super-admin/`, `company/` (also `company/HR/`), `depot/`, `driver/`, `accounting/`, `logistics/`, `hr/`. Top-level pages cover public/auth flows (Home, Login, Register, Legal, etc.).
- `src/lib/` — domain logic libraries: `supabase.ts` client, `complianceEngine.ts`, `fleetCompliance.ts`, `subscriptionPlans.ts`, `registrationFields.ts`.
- `src/utils/` — pure helpers, many with co-located `*.test.ts` (Vitest). Includes scan processing, audit summaries, compliance expiry, push notifications, Peppol/e-invoice helpers, product matching/sort, stock alerts, weekly hours.
- `src/i18n/` — translation provider (`index.tsx`) and per-language modules `sq.ts`, `en.ts`, `de.ts`, `fr.ts`, plus `legal/` subfolder (impressum, terms, cookies, privacy, DPA, subprocessors, AUP, refund). `Language = 'sq' | 'en' | 'de' | 'fr'`. Albanian is the source-of-truth.
- `src/types/` — shared TypeScript types: `index.ts`, `accounting.ts`, `location.ts`.

## Routing & auth

All routes are declared in `src/App.tsx`. Key role roots:

- `/` `HomePage`; `/login`, `/register`, `/forgot-password`, `/reset-password`, `/sa-access` (super-admin login), `/no-access`, `/features`, `/legal/:slug`, `/payment-{success,pending,cancel}`.
- `/super-admin/*` — wrapped in `<ProtectedRoute roles={['super_admin']}>` → `SuperAdminLayout`. Owns companies, plans, payments, homepage CMS, email templates/campaigns, static pages, branding, push.
- `/company/*` — `company_admin`. Largest surface area: depots, drivers, vehicles, trailers, compliance, stock, categories, partners, pallet accounts, live map, route planner, repair reports, worker repair stats, HR, audit log, invoices, email templates/automation, client prices.
- `/depot/*` — `depot_worker`. Routes that require `worker_category=depoist` are wrapped in a second `<ProtectedRoute roles={['depot_worker']} workerCategories={['depoist']}>` (stock, receiving, sorting, repairs, repair-workers, damage, reports, delivery-notes, trailers). Reparature workers see only the dashboard, HR pages, chat, documents, settings.
- `/driver/*` — `driver`. Includes tracking, route-planner, navigation, trailers, documents.
- `/accounting/*` — gated by `AccountingRoute` (`src/components/subscription/AccountingRoute.tsx`), not a raw role. Requires the accounting subscription plan.
- `/logistics/*` — `logistics_admin` or `company_admin`.

`ProtectedRoute` (in `App.tsx`) redirects unauthenticated users to `/login` and depot-workers without the matching `worker_category` to `/no-access`.

## Supabase / backend

### Migrations

Location: `supabase/migrations/`. Files use the convention `YYYYMMDDhhmmss_short_description.sql`. Always create a NEW migration when changing schema or RPCs — never edit an existing one. The most recent (as of writing) is `20260521200925_create_apply_repair_from_stock_rpc.sql`.

Recent themes:

- Repair attribution & worker productivity (`depot_repairs`, `apply_repair_from_stock`).
- Stock movement contact linking, admin notifications.
- VAT regime detection + manual override (`acc_invoices_vat_override`).
- French email templates and UTF-8 fixes.
- Audit pass migrations (`post_audit_security_fixes`, `audit_round2_consistency_fixes`).
- Cron-job guards against empty Vault entries.

There are two pending migrations parked in `docs/` (`PENDING_MIGRATION_flow_roles.sql`, `PENDING_MIGRATION_stock_hierarchy.sql`) — these are drafts, not applied.

### RPC functions (notable)

- `apply_repair_from_stock(p_stock_id, p_repaired_qty, p_scrapped_qty, p_target_category_product_id, p_worker_id)` — decrements damaged stock, increments good stock, logs `stock_movements` and a `depot_repairs` row. `SECURITY INVOKER`. Error messages are in Albanian (e.g. "Asnje sasi per te raportuar").
- Other RPCs per migration (resolve-username, etc.) — search `supabase/migrations/` for `CREATE OR REPLACE FUNCTION`.

### Edge functions

Location: `supabase/functions/`. Each subdir is one Deno function. Shared code lives in `supabase/functions/_shared/`. Highlights:

- Auth/account: `manage-users`, `register-company`, `request-account-deletion`, `execute-account-deletion`, `cancel-account-deletion`, `export-account-data`, `request-password-reset`, `verify-reset-code`, `create-super-admin`, `create-demo-accountant`, `seed-demo-users`.
- Notifications: `send-email`, `send-email-campaign`, `send-invoice-email`, `dispatch-notification`, `process-notification-queue`, `send-push-notification`, `send-apns-notification`, `send-fcm-notification`, `register-device-token`, `init-push-config`, `notification-config-status`.
- Accounting: `generate-invoice-pdf`, `generate-einvoice`, `generate-datev-export`, `generate-saft`, `import-bank-statement`, `check-overdue-invoices`, `validate-vat-number`, `fetch-ecb-rates`.
- Logistics/fleet: `check-compliance-expirations`, `check-route-traffic`, `plan-truck-route`, `validate-delivery-action`, `scan-document`, `scan-fleet-document`, `generate-pallet-statement`.
- Payments: `stripe-checkout`, `stripe-webhook`.
- Public API: `api-v1`, `create-api-key`, `webhook-dispatcher`.

### RLS & isolation

Tenant isolation is by `company_id` on every business table. The Albanian `docs/COMPANY_ISOLATION_GUIDE.md` explains the model: `manage-users` edge function automatically stamps new accounts with the caller's `company_id`; `company_admin` cannot create `super_admin` or other `company_admin` accounts. Always preserve `company_id` filters in queries and RLS policies. Check existing migrations under `supabase/migrations/` for the canonical RLS pattern before adding policies.

### Env vars

- Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Edge functions: read from `Deno.env` (Stripe keys, SMTP creds, FCM/APNs, ECB, etc.). Configure in Supabase dashboard → project secrets. Some functions rely on the Postgres Vault (see `guard_cron_jobs_against_empty_vault` migration).

## Docs directory

`docs/` (mostly written in Albanian — translate before relying on user-facing wording):

- `ACTION_PLAN.md` — outstanding work plan.
- `AUDIT_REPORT.md` — first-round audit findings.
- `COMPANY_ISOLATION_GUIDE.md` — tenant isolation model (worth reading in full before touching auth or RLS).
- `COMPREHENSIVE_AUDIT_REPORT.md` — extended audit.
- `IMPLEMENTATION_CHECKLIST.md` — checklist for in-flight work.
- `MOBILE_AUDIT_REPORT.md` — mobile/PWA-specific findings.
- `PENDING_MIGRATION_flow_roles.sql` — draft migration (not applied).
- `PENDING_MIGRATION_stock_hierarchy.sql` — draft migration (not applied).
- `SUPER_ADMIN_FEATURE_GUIDE.md` — super-admin walkthrough.

## Styling

- Tailwind CSS 3.4. Config: `tailwind.config.js` — `content` covers `index.html` and `src/**/*.{js,ts,jsx,tsx}`; no theme extensions or custom plugins yet. Use stock Tailwind utility classes; for new tokens, extend `theme.extend` rather than introducing new CSS files.
- Global CSS lives in `src/index.css` and `src/styles/`.
- The accent color is `teal-600` (see loading spinner in `App.tsx`); slate/teal palette dominates.
- PostCSS is configured via `postcss.config.js` (Tailwind + autoprefixer).
- Icons: import from `lucide-react` (excluded from Vite's `optimizeDeps` to avoid huge prebundles).

## Build chunking

`vite.config.ts` manually splits chunks: `i18n` (translation files), `react-vendor`, `supabase`, `tiptap`, `icons`, `maps`. If you add a heavy dependency that's only used on a few routes, consider adding it to `manualChunks`. The `chunkSizeWarningLimit` is 600 KB.

## CI / GitHub Actions

Only one workflow:

- `.github/workflows/stale.yml` — runs daily at 18:24 UTC. Uses `actions/stale@v5` to mark inactive issues and PRs (labels `no-issue-activity` / `no-pr-activity`). It is not a CI build pipeline.

There is no automated lint/typecheck/test/build workflow yet. Run those locally (or via the SessionStart hook described under Claude Code on Web) before pushing.

## Things to be careful about

- **Bolt.new origin.** This project was scaffolded from `bolt-vite-react-ts` (`.bolt/config.json`). The README is a Bolt link. Do not delete `.bolt/`. Do not assume the project has a fully custom build setup — the Vite/Tailwind config is intentionally close to the Bolt template.
- **Albanian UI strings.** The primary language is Albanian (`sq`). Error messages thrown from Postgres RPCs (e.g. `apply_repair_from_stock`) and many user-facing strings are Albanian. When editing or adding strings, add to all four locale files (`src/i18n/sq.ts`, `en.ts`, `de.ts`, `fr.ts`) plus the matching `src/i18n/legal/*.ts` for legal pages. Do not "translate" Albanian error messages in migrations to English unless explicitly asked.
- **`depot_worker` is partitioned.** Routes for `depoist` and `reparature` differ — see the inner `<ProtectedRoute>` wrappers in `src/App.tsx`. A reparature worker landing on a depoist-only route is sent to `/no-access`. Mirror this gate on the server side too.
- **Subscription-gated routes.** Accounting (`/accounting`) is wrapped in `AccountingRoute`, not a role check. Plans live in `src/lib/subscriptionPlans.ts` and the `SubscriptionContext`.
- **Migrations are append-only.** Add a new timestamped file in `supabase/migrations/`. Never edit a committed migration — the live DB has already run them.
- **Edge functions are Deno.** `supabase/functions/_shared/` is the only place to share TypeScript across functions; do not import from `src/`.
- **Strict TS.** `tsconfig.app.json` enables `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`. Don't suppress with `any` — use proper types from `src/types/`.
- **Vitest only sees `src/**/*.test.ts(x)`.** Add tests next to the file they cover (see existing `src/utils/*.test.ts` for patterns). The test environment is `node`, not `jsdom` — utilities only, no DOM tests yet.

## Git workflow

- The default branch is `main`. PRs are merged via GitHub (recent log shows `Merge pull request #NN from gmaliqi05-art/claude/...`).
- Feature branches follow `claude/<topic>-<suffix>` for AI-assisted work.
- Commit messages use lowercase scoped prefixes: `fix:`, `docs:`, `nav:`, `invoices:`, `audit-round2:`, `depot:`, `stock-movements:`. Keep the subject under ~72 chars; details belong in the body.
- Never force-push to `main`. Open a PR; let CI (when configured) and human review run.
- Pending DB changes go in `docs/PENDING_MIGRATION_*.sql` while drafting; promote to `supabase/migrations/` only when ready to apply.

## Quick reference: common file locations

- Supabase client: `src/lib/supabase.ts`
- Auth/session: `src/contexts/AuthContext.tsx`
- Subscription gating: `src/contexts/SubscriptionContext.tsx`, `src/lib/subscriptionPlans.ts`, `src/components/subscription/AccountingRoute.tsx`
- All routes: `src/App.tsx`
- Per-role sidebar: `src/layouts/<Role>Layout.tsx`
- Translations: `src/i18n/{sq,en,de,fr}.ts` plus `src/i18n/legal/`
- Repair RPC (latest pattern reference): `supabase/migrations/20260521200925_create_apply_repair_from_stock_rpc.sql`
- Edge function shared utilities: `supabase/functions/_shared/`
- Tenant isolation rules: `docs/COMPANY_ISOLATION_GUIDE.md`

## What NOT to do

- Do not run `supabase db reset` or otherwise discard migrations.
- Do not import from `src/` inside `supabase/functions/` (Deno cannot resolve Node-style paths and the type contexts differ).
- Do not introduce a new state library (Redux/Zustand/etc.) — current state lives in React Context + Supabase queries. Match that pattern.
- Do not commit `.env`; use `.env.example` for placeholders.
- Do not add an English-only string without updating `sq.ts`, `de.ts`, `fr.ts` as well.

