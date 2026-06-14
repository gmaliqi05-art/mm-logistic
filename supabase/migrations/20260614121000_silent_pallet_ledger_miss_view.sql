/*
  # Silent pallet-ledger miss audit view

  ## Why
  The canonical `auto_pallet_ledger_on_delivery` trigger
  (rewritten in migration 20260508095640) RETURNs NEW without inserting
  any `pallet_account_transactions` row when `delivery_notes.partner_id`
  is NULL. That is intentional for carrier-only legs, but it also masks
  a real operator error: confirming a delivery with EPAL pallet items
  while forgetting to link the partner contact. The partner ledger
  silently never moves, the balance with that partner drifts off-book,
  and the gap is invisible until a Saldenbestätigung exposes it.

  ## What this adds
  - `v_delivery_notes_missing_pallet_partner` — read-only diagnostic
    view. Lists every delivered/confirmed/completed delivery note that:
      - has items (sum of `delivery_note_items.quantity` > 0), AND
      - has `partner_id` NULL, AND
      - has no rows in `pallet_account_transactions`, AND
      - is not a carrier or internal_transfer leg (those legitimately
        don't post to the partner ledger).
    Operators (super_admin, company_admin, accountant, logistics) can
    query this view to find historic deliveries whose pallet balances
    were never posted.

  ## Safety
  - View only. No data changes.
  - `security_invoker = true` so RLS on the underlying tables is honoured.
*/

CREATE OR REPLACE VIEW public.v_delivery_notes_missing_pallet_partner
WITH (security_invoker = true) AS
SELECT
  dn.id                                AS delivery_note_id,
  dn.company_id,
  dn.note_number,
  dn.type,
  dn.status,
  dn.our_role,
  dn.partner_id,
  COALESCE(dn.pallets_delivered, 0)
    + COALESCE(dn.pallets_returned, 0) AS pallets_total,
  COALESCE(items.total_quantity, 0)    AS items_total_quantity,
  dn.delivered_at,
  dn.confirmed_at,
  dn.created_at
FROM public.delivery_notes dn
LEFT JOIN LATERAL (
  SELECT SUM(quantity)::int AS total_quantity
    FROM public.delivery_note_items dni
   WHERE dni.delivery_note_id = dn.id
     AND dni.category_id IS NOT NULL
) items ON TRUE
WHERE dn.status IN ('delivered', 'confirmed', 'completed')
  AND dn.partner_id IS NULL
  AND COALESCE(items.total_quantity, 0) > 0
  -- Carrier-only and internal transfers are intentionally not posted to
  -- the partner ledger; exclude them so the view only shows real misses.
  AND COALESCE(dn.our_role, '') NOT IN ('carrier', 'internal_transfer')
  AND NOT EXISTS (
    SELECT 1 FROM public.pallet_account_transactions pat
     WHERE pat.delivery_note_id = dn.id
  );

COMMENT ON VIEW public.v_delivery_notes_missing_pallet_partner IS
  'Diagnostic: delivery notes confirmed without a linked partner contact and without any pallet_account_transactions rows. The auto_pallet_ledger_on_delivery trigger silently skipped these — partner balance never updated.';
