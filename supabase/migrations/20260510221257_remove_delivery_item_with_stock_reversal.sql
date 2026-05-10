/*
  # Remove delivery_note_item with stock reversal

  1. Purpose
     Allows a company admin to remove a single delivery_note_item from a confirmed
     delivery note and automatically reverse the stock movement it caused.

  2. Behavior
     - Validates caller is company_admin of the note's company
     - Deletes related stock_movements row(s) for that specific item
     - Recomputes the signed stock adjustment: reverse the earlier decrement/increment
     - Deletes the delivery_note_item row
     - Re-emits partner_flow_events for the note

  3. Safety
     - Does not touch sorting batches / depot repairs
     - SECURITY DEFINER, revoked from public, granted to authenticated
*/

CREATE OR REPLACE FUNCTION public.remove_delivery_note_item(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item record;
  v_note record;
  v_user_company uuid;
  v_sign int;
BEGIN
  SELECT company_id INTO v_user_company FROM profiles WHERE id = auth.uid();
  SELECT * INTO v_item FROM delivery_note_items WHERE id = p_item_id;
  IF v_item IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  SELECT * INTO v_note FROM delivery_notes WHERE id = v_item.delivery_note_id;
  IF v_note IS NULL THEN RAISE EXCEPTION 'Delivery note not found'; END IF;
  IF v_note.company_id <> v_user_company THEN RAISE EXCEPTION 'Not authorized'; END IF;

  IF v_note.type = 'delivery' THEN v_sign := 1; ELSE v_sign := -1; END IF;

  IF v_note.status IN ('delivered','confirmed','pending_stock_confirmation') AND v_item.category_id IS NOT NULL AND coalesce(v_item.quantity,0) > 0 THEN
    UPDATE stock SET quantity = quantity + (v_sign * v_item.quantity), updated_at = now()
      WHERE company_id = v_note.company_id
        AND depot_id = v_note.assigned_depot_id
        AND category_id = v_item.category_id
        AND coalesce(category_product_id::text,'') = coalesce(v_item.category_product_id::text,'')
        AND condition = coalesce(v_item.condition, 'good');

    INSERT INTO stock_movements (company_id, depot_id, category_id, category_product_id, movement_type, quantity, condition_before, condition_after, notes, performed_by, delivery_note_id)
    VALUES (v_note.company_id, v_note.assigned_depot_id, v_item.category_id, v_item.category_product_id,
      CASE WHEN v_sign = 1 THEN 'adjustment_in' ELSE 'adjustment_out' END,
      v_item.quantity, v_item.condition, v_item.condition,
      'Reversal: removed item from ' || v_note.note_number, auth.uid(), v_note.id);
  END IF;

  DELETE FROM delivery_note_items WHERE id = p_item_id;

  DELETE FROM partner_flow_events WHERE delivery_note_id = v_note.id;
  UPDATE delivery_notes SET status = 'pending_stock_confirmation' WHERE id = v_note.id AND status IN ('delivered','confirmed');
  UPDATE delivery_notes SET status = v_note.status WHERE id = v_note.id AND v_note.status IN ('delivered','confirmed');
END $$;

REVOKE EXECUTE ON FUNCTION public.remove_delivery_note_item(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.remove_delivery_note_item(uuid) TO authenticated, service_role;
