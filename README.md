# MM Logistic

> Smart Logistics. Clear Numbers. — multi-tenant SaaS for logistics, depots, fleet, HR, and full-cycle accounting.

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-trhxephn)

Production: **[mm-logistic.eu](https://www.mm-logistic.eu)**

---

## Stack

- **Frontend**: React 18 + TypeScript + Vite 5 + Tailwind CSS + react-router v7
- **Backend**: Supabase (Postgres + Auth + Storage + Edge Functions)
- **i18n**: 4 languages — Albanian (sq), English, German, French
- **Maps**: Leaflet + react-leaflet
- **Rich text**: TipTap
- **Scanning**: html5-qrcode (QR + barcode)
- **Payments**: Stripe (subscriptions + webhooks)
- **Notifications**: FCM (Android), APNs (iOS), Web Push
- **PWA**: installable, offline-capable shell, push notifications
- **Monitoring**: Sentry (lazy-loaded when `VITE_SENTRY_DSN` is set)

## Domains covered

The app exposes 5 role-scoped surfaces under shared auth:

| Role | Surface | What they manage |
|---|---|---|
| `super_admin` | `/super-admin` | Companies, plans, branding, email templates, push, legal pages |
| `company_admin` | `/company` | Depots, drivers, vehicles, partners, invoices, HR, compliance |
| `depot_worker` | `/depot` | Stock receiving, sorting, repairs, delivery notes |
| `driver` | `/driver` | Trips, tracking, route planner, documents |
| `accountant` | `/accounting` | Invoices, purchases, bank rec, DATEV/SAFT exports, financials |
| `logistics_admin` | `/logistics` | Dispatch, live map, active drivers |

## Getting started

### Prerequisites
- Node.js 20+
- A Supabase project (free tier works for development)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy the env template and fill it in
cp .env.example .env
# Edit .env with your Supabase URL and anon key

# 3. Start the dev server
npm run dev
```

The app runs at `http://localhost:5173`.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase anon (public) key |
| `VITE_SENTRY_DSN` | optional | Sentry DSN for production error tracking |

Server-side secrets (Stripe, Resend, FCM, etc.) are configured per edge function in the Supabase Dashboard → Edge Functions → Settings.

## Scripts

```bash
npm run dev         # Start Vite dev server
npm run build       # Production build to dist/
npm run preview     # Preview the production build locally
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm test            # Run Vitest unit tests once
npm run test:watch  # Vitest watch mode
```

## Repository layout

```
src/
├── App.tsx              # Route map (lazy-loaded per role)
├── main.tsx             # Entry point, ErrorBoundary + SW registration
├── pages/               # Role-scoped pages (super-admin/, company/, depot/, driver/, accounting/, logistics/)
├── components/          # Reusable UI grouped by domain
├── contexts/            # AuthContext, SubscriptionContext
├── hooks/               # Custom hooks (notifications, push, platform settings)
├── layouts/             # Per-role layout shells with sidebars
├── i18n/                # sq/en/de/fr translation files + LanguageProvider
├── lib/supabase.ts      # Single shared Supabase client
├── utils/               # logger, scanProcessor, weeklyHours, pdf helpers
└── types/               # Shared TypeScript types

supabase/
├── migrations/          # Numbered SQL migrations (apply with `supabase db push`)
└── functions/           # ~40 Deno edge functions (stripe-webhook, send-email, ...)

docs/                    # Architecture notes & audit reports
public/                  # PWA assets, manifest, service worker (sw.js)
```

## Database migrations

Migrations live under `supabase/migrations/` with `YYYYMMDDHHMMSS_*.sql` naming.

```bash
# Apply pending migrations to your linked Supabase project
supabase db push

# Reset local DB (development only — destroys data)
supabase db reset
```

If you don't use the Supabase CLI, paste the SQL into the Supabase Dashboard → SQL Editor and run it manually, in chronological order.

## Edge functions

Edge functions are deployed via the Supabase CLI:

```bash
supabase functions deploy <function-name>
# or deploy all at once:
supabase functions deploy
```

Each function has its own secret set in the Supabase Dashboard (Stripe keys, Resend API key, FCM service account, etc.). Never commit secrets — `.env` is gitignored.

## Testing

Tests use Vitest in node environment. Coverage is currently focused on pure data utilities (date math, compliance, scanning inference, weekly hours). Component/integration tests live alongside the modules they cover (`*.test.ts` / `*.test.tsx`).

## CI

GitHub Actions runs on every push/PR to `main` (see `.github/workflows/ci.yml`):

- `typecheck` (blocking)
- `lint` (non-blocking — tracked while we drive `any` count down)
- `test` (blocking)
- `build` (blocking)

## Deployment

The `dist/` build output is static. Deploy it to any static host (Vercel, Netlify, Cloudflare Pages, S3+CloudFront, etc.). The PWA service worker requires HTTPS and a stable origin.

The backend (Supabase project + edge functions) is deployed separately via the Supabase CLI or Dashboard.

## License

Proprietary. © MM Logistic.
