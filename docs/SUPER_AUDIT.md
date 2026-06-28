# Super Audit — mm-logistic

_Date: 2026-06-28. Method: 7 parallel domain audits (security/RLS, edge functions, frontend, payments, DB/migrations, i18n, build/deps/testing) tracing the latest state of each policy/function/file across the append-only migration set and the React app._

**Overall verdict:** structurally sound. Multi-tenant RLS isolation is intact across all 81 `company_id`-bearing tables, i18n parity is 100%, CI exists, typecheck is clean, 260 tests pass. The findings below are concrete gaps to close, led by three cross-tenant / payment criticals.

Status legend: ✅ fixed in PR `claude/security-payments-hotfix` · ⬜ open.

---

## 🔴 CRITICAL

### C4 — `delivery_notes_3party_view` cross-tenant leak ✅
`supabase/migrations/20260512100000_three_party_logistics_model.sql:115,169`
View created without `security_invoker = true`, `GRANT SELECT TO authenticated`, joining delivery_notes + acc_contacts + companies with no company filter. A non-invoker view runs as owner (BYPASSRLS), so any authenticated user could `SELECT * FROM delivery_notes_3party_view` and read every tenant's delivery notes + party names/addresses via PostgREST.
**Fix:** `ALTER VIEW ... SET (security_invoker = true)` (migration 20260628150000).

### C1 — `verify-checkout-session` crash on new Stripe API ✅
`supabase/functions/verify-checkout-session/index.ts:106-113`
Same bug fixed in the webhook: reads `subscription.current_period_start/end` directly. On API version `2026-04-22.dahlia` these are undefined → `new Date(undefined*1000).toISOString()` → RangeError → 500. This is the **primary activation path** (user returning from Stripe before the webhook lands); a paying tenant gets an error and stays `pending_payment`.
**Fix:** `getSubscriptionPeriod()`/`toIsoOrNull()` with item-level fallback, retrieve made non-fatal, 30-day fallback preserved.

### C5 — `chat_participants` cross-tenant member injection ✅
`supabase/migrations/20260209073824_comprehensive_chat_rls_fix.sql:112`
INSERT policy required only room-creator (or super_admin); no same-company check on the added `user_id`. A room creator could add a foreign-tenant profile, who then reads the room's messages. Same class as the fixed `document_recipients`.
**Fix:** WITH CHECK now requires the added user's `company_id` = room's `company_id` (migration 20260628150000).

### C2 — `verify-checkout-session` "no auth" — NOT a vuln (verified) ✅ dismissed
Flagged by the edge-function pass, but the unauthenticated path is by design and safe: the Stripe `session_id` is the bearer proof, verified against Stripe (`payment_status === 'paid'`), `companyId` is read from the **verified session metadata** (not the request body), and the path is rate-limited. Adding `requireCaller` would break the legitimate redirect-return flow. No change.

---

## 🟠 MAJOR (open)

| ID | Area | File:line | Issue |
|----|------|-----------|-------|
| M-sec1 | Edge | `manage-users/index.ts:46,213,248,363,378` | Service-role client for whole lifecycle + raw `error.message` returned (info disclosure) |
| M-sec2 | Edge | ~10 functions | Raw `error.message` in 500 bodies (send-verification-code, verify-email-code, verify-checkout-session, import-bank-statement, register-device-token, …) |
| M-sec3 | Edge | manage-users, import-bank-statement, scan-document, verify-checkout-session | Mutating endpoints parse raw `req.json()` without zod validation |
| M-pay1 | Payments | `scan-document/index.ts:654-666` | Subscription gate checks only `status IN ('trial','active')`, ignores `current_period_end` expiry (api-v1 does it right) |
| M-pay2 | Payments | `stripe-webhook/index.ts:545,562` | `accounting_enabled` not revoked on `past_due`; `isExpired` is false for past_due → UI access retained |
| M-db1 | DB | 18 `*_company_id_fkey` | `ON DELETE NO ACTION` → company deletion / GDPR purge FK-blocked (2026-05-26 fix covered profiles only) |
| M-fe1 | Frontend | `SubscriptionContext.tsx:117-124` | Stale plan/accountingEnabled across logout→login (no reset on company change) → cross-tenant feature flash |
| M-fe2 | Frontend | DriverDetail:43, VehicleDetail:49, PalletAccountDetail:74 | Detail queries `.eq('id')` without `.eq('company_id')` belt-and-braces |
| M-test | Build | `src/lib/*` | 0% test coverage on complianceEngine, fleetCompliance, subscriptionPlans; peppol/scanProcessor untested |
| M-dep | Build | package.json | `react-router-dom` v7.13 high-sev advisory (runtime); 11 npm vulns total (rest dev-only) |
| M-data1 | DB | `partner_flow_events` (20260510190542:119) | **By-design** cross-tenant read to heuristically-matched partner company — confirm `notes` carries nothing sensitive |

---

## 🟡 MINOR (open)

- **CORS:** 40 edge functions still hardcode `Access-Control-Allow-Origin: *`; webhooks/cron OK, ~28 user-facing should migrate to `_shared/cors.ts` `buildCorsHeaders`.
- **`initialize_company_accounting(uuid)`** (20260520190000:50) trusts `p_company_id` — low-impact idempotent cross-tenant write.
- **`attachments` storage bucket**: non-`chat/` folders readable by any authenticated user (cross-tenant read if path known).
- **`is_chat_room_member/creator`** still granted to `anon` (boolean-only, low risk).
- **DB perf:** un-optimized RLS on `delivery_notes.dnotes_update`; `multiple_permissive_policies` on subscription_plans; duplicate index on pallet_sorting_batches; unindexed FKs `admin_subscription_actions.subscription_id`, `pallet_reconciliations.created_by`; 4 functions with mutable search_path.
- **Payments:** `invoice.payment_intent` deprecated dedup key; possible duplicate active-subscription insert race (webhook vs verify); accounting-as-primary signup may be locked out of `/accounting` (only `isAddon` flips `accounting_enabled`); `subscription.created` / `invoice.payment_action_required` unhandled; `handleSubscriptionDeleted` skips revoke when metadata.company_id absent.
- **i18n:** ~54 hardcoded Albanian UI strings (mostly `pages/accounting/`), ~11 hardcoded English, 8 placeholder-name mismatches in `notifications.events.*` (render literal `{type}`/`{typeLower}`).
- **Frontend:** ~250 `as any`-class casts; very large components (DeliveryReviewPanel 2669 lines, etc.); no route-level error boundaries.
- **Lint:** 517 warnings (356 `no-explicit-any`, 146 `react-hooks/exhaustive-deps`); CI has no `--max-warnings` gate.
- **Process:** no `REVOKE EXECUTE ON ALL FUNCTIONS ... FROM anon/PUBLIC` backstop — future SECURITY DEFINER functions default to PUBLIC EXECUTE unless individually revoked.
- **Docs:** `CLAUDE.md` is stale — claims no CI, but `.github/workflows/ci.yml` (lint→typecheck→test→build, Node 20) exists.

---

## ✅ Verified healthy

RLS enabled + company-scoped on all 81 tenant tables (no `USING(true)` on tenant data; `true`-policies only on global lookup tables) · helpers in `private` schema, search_path pinned, read `auth.uid()` · anon/PUBLIC EXECUTE clean (every grant later revoked) · storage product-images/avatars/fleet-documents path-scoped · webhook signatures verified (Stripe + svix constant-time) · idempotency + single-use `pending_payment_token` solid · money handling clean (numeric, /100, currency fallback) · data types clean (all timestamptz, no float money) · migration "duplicates" idempotent (no drift) · pending migrations applied · logout fully clears state/localStorage · realtime/geolocation/interval cleanup present · i18n parity 100% (4,790 keys × 4 locales, all legal docs in 4 langs) · CI green, typecheck clean, 260 tests pass.

---

## Recommended order of work

1. **C4 + C1 + C5** — this PR (cross-tenant leaks + live payment crash). _Done._
2. M-fe1 (SubscriptionContext reset) — cross-tenant UI flash.
3. M-pay1 / M-pay2 (active-without-paying gaps).
4. M-db1 (company-deletion FK / purge RPC) + M-sec2 (error-leak cleanup).
5. Tests for subscriptionPlans / complianceEngine / peppol; bump `react-router-dom`.
6. CORS sweep, i18n hardcoded strings + placeholder fixes, indexes, search_path pins.
