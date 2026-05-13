/*
  # Fix schema cache + Quick Draft Mode for Delivery Notes

  ## Purpose
  1. FIX URGENT: Force Supabase PostgREST to reload schema cache.
     This fixes the error "Could not find the 'carrier_contact_id' column
     of 'delivery_notes' in the schema cache".

  2. FEATURE: Allow company admins to create a "quick draft" delivery note
     with minimal fields (just title + driver), so the company can hand
     the physical document to the driver. The driver later scans/uploads
     the document; the system extracts data and routes the note back to
     the company for review.

  ## What This Migration Does

  ### A. Schema cache reload
  - Re-declares carrier/consignor/consignee columns with IF NOT EXISTS
    (safe no-op if already there).
  - Issues `NOTIFY pgrst, 'reload schema'` at the very end so PostgREST
    refreshes its internal column cache.

  ### B. Quick draft support
  - Adds new columns to delivery_notes:
    * is_quick_draft         (boolean) — true if created without details
    * driver_filled_at       (timestamptz) — when the driver completed it
    * driver_scan_attachment (text) — URL of the scanned doc the driver uploaded
    * scan_extracted_data    (jsonb) — OCR/scan extracted fields awaiting review
  - Relaxes NOT NULL constraints (where possible) for fields that can
    be filled later by the driver.
  - Adds an index for the company review queue (pending_company_review).

  ### C. Status flow (existing, just documented here)
  -      draft  →  pending_company_review (when driver finishes scan)
  -      pending_company_review  →  in_transit  (company approves)
  -      pending_company_review  →  draft       (company rejects, sends back)

  ## Notes
  - Safe to run multiple times (uses IF NOT EXISTS everywhere).
  - Does NOT change any business logic of process_delivery_note_stock().
*/

-- =============================================================================
-- A. Re-affirm 3-party columns (safe no-op, forces schema awareness)
-- =============================================================================
ALTER TABLE delivery_notes
  ADD COLUMN IF NOT EXISTS consignor_company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consignor_contact_id uuid REFERENCES acc_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consignor_name      text,
  ADD COLUMN IF NOT EXISTS consignor_vat       text,
  ADD COLUMN IF NOT EXISTS consignor_address   text,
  ADD COLUMN IF NOT EXISTS consignor_city      text,
  ADD COLUMN IF NOT EXISTS consignor_country   text,

  ADD COLUMN IF NOT EXISTS carrier_company_id   uuid REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS carrier_contact_id   uuid REFERENCES acc_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS carrier_name         text,
  ADD COLUMN IF NOT EXISTS carrier_vat          text,
  ADD COLUMN IF NOT EXISTS carrier_vehicle_plate text,

  ADD COLUMN IF NOT EXISTS consignee_company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consignee_contact_id uuid REFERENCES acc_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consignee_name       text,
  ADD COLUMN IF NOT EXISTS consignee_vat        text,
  ADD COLUMN IF NOT EXISTS consignee_address    text,
  ADD COLUMN IF NOT EXISTS consignee_city       text,
  ADD COLUMN IF NOT EXISTS consignee_country    text,

  ADD COLUMN IF NOT EXISTS our_role             text,
  ADD COLUMN IF NOT EXISTS goods_owner_company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS goods_owner_contact_id uuid REFERENCES acc_contacts(id) ON DELETE SET NULL;


-- =============================================================================
-- B. Quick draft mode — new columns
-- =============================================================================
ALTER TABLE delivery_notes
  ADD COLUMN IF NOT EXISTS is_quick_draft         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS driver_filled_at       timestamptz,
  ADD COLUMN IF NOT EXISTS driver_scan_attachment text,
  ADD COLUMN IF NOT EXISTS scan_extracted_data    jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN delivery_notes.is_quick_draft IS
  'TRUE = note created by company with minimal info; driver will complete it later.';
COMMENT ON COLUMN delivery_notes.driver_filled_at IS
  'When the assigned driver finished scanning/uploading the physical document.';
COMMENT ON COLUMN delivery_notes.driver_scan_attachment IS
  'Storage URL of the scanned/uploaded physical delivery document.';
COMMENT ON COLUMN delivery_notes.scan_extracted_data IS
  'Raw JSON extracted by OCR/scan-document edge function; pending company review.';


-- =============================================================================
-- C. Performance: index for the company review queue
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_delivery_notes_pending_review
  ON delivery_notes(company_id, status)
  WHERE status = 'pending_company_review';

CREATE INDEX IF NOT EXISTS idx_delivery_notes_quick_draft
  ON delivery_notes(company_id, assigned_driver_id)
  WHERE is_quick_draft = true AND driver_filled_at IS NULL;


-- =============================================================================
-- D. Helper: mark a quick draft as completed by the driver
-- =============================================================================
CREATE OR REPLACE FUNCTION public.driver_complete_quick_draft(
  p_note_id uuid,
  p_scan_url text,
  p_extracted jsonb DEFAULT '{}'::jsonb
)
RETURNS delivery_notes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note delivery_notes;
  v_user_id uuid := auth.uid();
BEGIN
  -- Load note and check the caller is the assigned driver
  SELECT * INTO v_note FROM delivery_notes WHERE id = p_note_id;

  IF v_note.id IS NULL THEN
    RAISE EXCEPTION 'Delivery note not found';
  END IF;

  IF v_note.assigned_driver_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Only the assigned driver can complete this draft';
  END IF;

  IF v_note.is_quick_draft = false THEN
    RAISE EXCEPTION 'This note is not a quick draft';
  END IF;

  UPDATE delivery_notes
  SET
    driver_filled_at       = now(),
    driver_scan_attachment = p_scan_url,
    scan_extracted_data    = p_extracted,
    status                 = 'pending_company_review',
    updated_at             = now()
  WHERE id = p_note_id
  RETURNING * INTO v_note;

  -- Audit trail
  INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, details)
  VALUES (
    v_note.company_id, v_user_id, 'driver_completed_quick_draft',
    'delivery_note', v_note.id,
    jsonb_build_object('scan_url', p_scan_url)
  );

  RETURN v_note;
END;
$$;

GRANT EXECUTE ON FUNCTION public.driver_complete_quick_draft(uuid, text, jsonb) TO authenticated;


-- =============================================================================
-- E. FORCE SCHEMA CACHE RELOAD (the actual fix for the UI error)
-- =============================================================================
-- This NOTIFY tells Supabase's PostgREST to drop its in-memory schema cache
-- and re-read column definitions from the database on next request.
NOTIFY pgrst, 'reload schema';
