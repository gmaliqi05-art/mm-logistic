/*
  # Harden sorting-related functions

  1. Pins search_path on public.touch_psb_updated_at to prevent
     mutable-search-path attacks.
  2. Revokes EXECUTE from public, anon, and authenticated on
     public.commit_sorting_batch_to_stock so it can only run as a
     trigger (invoked as table owner). The function still needs
     SECURITY DEFINER so the trigger can write to stock / stock_movements
     regardless of the invoking user's RLS.
*/

CREATE OR REPLACE FUNCTION public.touch_psb_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_sorting_batch_to_stock() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_sorting_batch_to_stock() FROM anon;
REVOKE ALL ON FUNCTION public.commit_sorting_batch_to_stock() FROM authenticated;

REVOKE ALL ON FUNCTION public.touch_psb_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.touch_psb_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.touch_psb_updated_at() FROM authenticated;
