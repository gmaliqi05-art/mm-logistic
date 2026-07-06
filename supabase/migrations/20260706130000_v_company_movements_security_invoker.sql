/*
  # Restore security_invoker on v_company_movements (tenant-isolation fix)

  When 20260705210000 recreated `v_company_movements` via CREATE OR REPLACE VIEW
  (to add the driver columns), it dropped the `security_invoker = true` option
  the view had carried — so the view reverted to running with the OWNER's rights,
  bypassing the caller's row-level security. A security-definer view over
  company data means a signed-in user could read other companies' movement
  metadata by querying the view directly.

  Every sibling view (v_available_stock, v_company_stock_breakdown, …) uses
  security_invoker; this restores it here too. Verified safe: every table the
  view reads (stock_movements, delivery_notes, depot_repairs,
  pallet_sorting_batches/items, profiles_private, acc_contacts) has a
  company-scoped SELECT RLS policy that company members satisfy — including
  profiles_private (same-company read), so performer/driver names are preserved.
  With security_invoker the view now enforces the caller's RLS, restoring strict
  per-company isolation.

  Applied to prod via MCP.
*/

ALTER VIEW public.v_company_movements SET (security_invoker = true);
