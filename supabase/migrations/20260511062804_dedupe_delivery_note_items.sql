/*
  # Dedupe delivery_note_items and regenerate partner_flow_events

  1. Problem
     - Some delivery notes have duplicate rows in `delivery_note_items` with identical
       (category_id, category_product_id, quantity, condition, notes). This happened
       when both the driver's scan-upload path (`applyScanToDeliveryNote` with
       replaceExisting=true) and the company admin review panel's `persistItems`
       inserted the same rows because the admin panel built synthetic rows from
       `ai_extracted_json.line_items` when its local state did not yet know about
       the driver-inserted rows.
     - These duplicates also propagate to `partner_flow_events` because
       `emit_partner_flow_events` reads all `delivery_note_items` rows.

  2. Fix - Dedupe
     - Delete duplicate rows in `delivery_note_items`, keeping only the lowest id
       per (delivery_note_id, category_id, category_product_id, condition, quantity, notes).
     - Regenerate partner_flow_events for affected confirmed/delivered notes by
       nudging their status so the existing trigger replays with the deduped items.

  3. Security
     - No RLS changes. Trigger remains SECURITY DEFINER with search_path=public.
*/

DELETE FROM delivery_note_items a
USING delivery_note_items b
WHERE a.id > b.id
  AND a.delivery_note_id = b.delivery_note_id
  AND a.category_id IS NOT DISTINCT FROM b.category_id
  AND a.category_product_id IS NOT DISTINCT FROM b.category_product_id
  AND a.quantity = b.quantity
  AND a.condition IS NOT DISTINCT FROM b.condition
  AND a.notes IS NOT DISTINCT FROM b.notes;

DO $$
DECLARE n record;
BEGIN
  FOR n IN SELECT id, status FROM delivery_notes
           WHERE status IN ('delivered','confirmed')
             AND flow_role IS NOT NULL
  LOOP
    UPDATE delivery_notes SET status = 'pending_stock_confirmation' WHERE id = n.id;
    UPDATE delivery_notes SET status = n.status WHERE id = n.id;
  END LOOP;
END $$;
