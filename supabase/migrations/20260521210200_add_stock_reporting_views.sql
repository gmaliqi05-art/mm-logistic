-- Add v_available_stock and v_in_process_stock reporting views.
--
-- These were specified in the (now removed) PENDING_MIGRATION_stock_hierarchy.sql,
-- but every other piece of that document was absorbed by intervening migrations:
--   - apply_repair_completion RPC -> 20260511122750_repair_completion_rpc_and_company_link
--   - category_product_id on stock -> 20260426164825_add_category_product_to_stock
--   - stock condition vocab       -> 20260503135134_expand_stock_condition_vocab_*
--   - "Unclassified" default      -> 20260424005206 / 20260424005657 (catalog sync)
--   - sorting->repair routing     -> 20260521200817_route_damaged_sorting_to_stock_directly
--                                    (which intentionally REPLACES the older
--                                    "open depot_repairs from batch" trigger)
--
-- Only the reporting views were never created. The 'sorting_pending' and
-- 'repaired' values are intentionally included in the filter even though the
-- current stock table only contains {damaged, good, ready_a, ready_b, ready_c,
-- sorting} - they may appear once the repair lifecycle widens the vocabulary.

CREATE OR REPLACE VIEW public.v_available_stock
WITH (security_invoker = true) AS
SELECT s.*
FROM public.stock s
WHERE s.condition IN ('good','repaired','ready_a','ready_b','ready_c')
  AND s.quantity > 0;

CREATE OR REPLACE VIEW public.v_in_process_stock
WITH (security_invoker = true) AS
SELECT s.*
FROM public.stock s
WHERE s.condition IN ('damaged','sorting_pending','sorting')
  AND s.quantity > 0;

-- security_invoker=true makes the views run under the caller's RLS instead of
-- the view owner's. Without this, the Postgres 17 default is SECURITY DEFINER
-- behaviour, which would bypass the stock table's company_id RLS and leak
-- every company's stock to anyone with read access on the view.
