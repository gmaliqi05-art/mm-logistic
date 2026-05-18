/*
  # Switch apply_repair_completion to SECURITY INVOKER

  1. Changes
    - `apply_repair_completion(uuid, integer, integer, uuid)`: Changed from SECURITY DEFINER to SECURITY INVOKER
    - Function already uses `auth.uid()` and underlying tables have RLS, so elevated privileges are not needed

  2. Security
    - Authenticated users can still call this function
    - RLS on depot_repairs, stock, and stock_movements tables enforces proper access control
*/

ALTER FUNCTION public.apply_repair_completion(uuid, integer, integer, uuid) SECURITY INVOKER;
