/*
  # K6 + L6: Atomic stock movement RPC

  ## Why
  General-audit Wave 2 K6 + Wave-list L6. Both src/pages/company/Stock.tsx
  (handleRegisterStock, ~line 371) and src/pages/depot/Stock.tsx
  (handleSubmitMovement, ~line 338) follow the same broken pattern:

      const { data: existing } = await supabase.from('stock')
        .select('id, quantity').eq(...).maybeSingle();
      if (existing.quantity < qty) { return; }            // check
      await supabase.from('stock').update({               // write
        quantity: Math.max(0, existing.quantity - qty)
      }).eq('id', existing.id);

  Two race conditions and one silent-failure bug:

    1. Read-then-write race. Two parallel admin clicks both read
       quantity=10, both pass the `<qty` guard, both UPDATE: the
       table ends up at 10-qty even though 2*qty was withdrawn.
    2. The "exit" branch uses `Math.max(0, existing.quantity - qty)`,
       which SILENTLY truncates over-withdrawals to zero. The
       requested 50 against a stock of 20 leaves a 0-quantity row
       and no audit trail of the requested overage.
    3. No lock on the row, so the parallel-write hazard is
       unbounded — pg_advisory_lock / FOR UPDATE / unique index all
       would have caught it but nothing does today.

  ## What this ships
  `public.apply_stock_movement(p_depot_id, p_category_id,
  p_product_id, p_condition, p_quantity, p_movement_type, p_notes)`:

    * `SELECT … FOR UPDATE` on the (company, depot, category, product
      nullable, condition) stock row inside a single transaction.
    * Validates company isolation against `auth.uid()` so RLS-bypass
      via SECURITY DEFINER can't be tricked by a forged depot_id.
    * Hard error (not silent truncate) if exit > current quantity,
      matching the German MiLoG-style audit expectation that "the
      record must reflect reality" — silent truncation breaks both
      the inventory and the audit trail.
    * Single INSERT into `stock_movements` once the row math
      succeeded, so a half-applied state cannot ship.
    * Returns the updated quantity and the movement id so the
      caller can refresh UI without re-fetching.

  ## Caller migration
  The two TSX pages keep their current shape; they switch the
  Supabase write to `supabase.rpc('apply_stock_movement', {...})`.
  That happens in the same PR as this migration; the migration is
  back-compat (the old client-side write path still works while
  RPC rollout is in flight).

  ## Safety
  - SECURITY INVOKER (so RLS still applies, just under a single
    transaction with the lock).
  - search_path pinned per the codebase convention.
  - Idempotent via CREATE OR REPLACE.
  - REVOKE from anon + PUBLIC; GRANT to authenticated + service_role
    to match the rest of the hardened RPCs.
*/

CREATE OR REPLACE FUNCTION public.apply_stock_movement(
  p_depot_id        uuid,
  p_category_id     uuid,
  p_product_id      uuid,   -- nullable; null is treated as "category-only row"
  p_condition       text,
  p_quantity        integer,
  p_movement_type   text,   -- 'entry' | 'exit' | 'adjust'
  p_notes           text DEFAULT NULL
)
RETURNS TABLE (stock_id uuid, new_quantity integer, movement_id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor      uuid := auth.uid();
  v_company_id uuid;
  v_stock_id   uuid;
  v_current    integer;
  v_new        integer;
  v_movement   uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Nuk je i kycur' USING ERRCODE = '42501';
  END IF;
  IF p_depot_id IS NULL OR p_category_id IS NULL THEN
    RAISE EXCEPTION 'Depo dhe kategoria jane te detyrueshme';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Sasia duhet te jete pozitive';
  END IF;
  IF p_movement_type NOT IN ('entry', 'exit', 'adjust') THEN
    RAISE EXCEPTION 'Tipi i levizjes % nuk lejohet', p_movement_type;
  END IF;
  IF p_condition NOT IN ('good', 'damaged') THEN
    RAISE EXCEPTION 'Gjendja % nuk lejohet', p_condition;
  END IF;

  SELECT company_id INTO v_company_id
    FROM profiles WHERE id = v_actor;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Caller pa kompani' USING ERRCODE = '42501';
  END IF;

  -- Validate the depot belongs to the caller's company. RLS would
  -- block reads from a foreign depot anyway, but defense-in-depth.
  PERFORM 1 FROM depots WHERE id = p_depot_id AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Depoja nuk i perket kompanise tende' USING ERRCODE = '42501';
  END IF;

  -- Lock the matching stock row for the entire transaction.
  -- The lock prevents two concurrent calls from both reading the
  -- same current quantity and both posting a write — the second
  -- caller blocks on the row until the first commits.
  IF p_product_id IS NULL THEN
    SELECT id, quantity INTO v_stock_id, v_current
      FROM stock
     WHERE company_id = v_company_id
       AND depot_id   = p_depot_id
       AND category_id = p_category_id
       AND category_product_id IS NULL
       AND condition  = p_condition
     FOR UPDATE;
  ELSE
    SELECT id, quantity INTO v_stock_id, v_current
      FROM stock
     WHERE company_id = v_company_id
       AND depot_id   = p_depot_id
       AND category_id = p_category_id
       AND category_product_id = p_product_id
       AND condition  = p_condition
     FOR UPDATE;
  END IF;

  IF p_movement_type = 'exit' THEN
    IF v_stock_id IS NULL OR v_current < p_quantity THEN
      RAISE EXCEPTION 'Sasia kerkohet (%) tejkalon stokun e disponueshem (%)',
        p_quantity, COALESCE(v_current, 0);
    END IF;
    v_new := v_current - p_quantity;
    UPDATE stock SET quantity = v_new, updated_at = now() WHERE id = v_stock_id;
  ELSIF p_movement_type = 'entry' THEN
    IF v_stock_id IS NULL THEN
      INSERT INTO stock (
        company_id, depot_id, category_id, category_product_id,
        condition, quantity
      ) VALUES (
        v_company_id, p_depot_id, p_category_id, p_product_id,
        p_condition, p_quantity
      )
      RETURNING id, quantity INTO v_stock_id, v_new;
    ELSE
      v_new := v_current + p_quantity;
      UPDATE stock SET quantity = v_new, updated_at = now() WHERE id = v_stock_id;
    END IF;
  ELSE  -- 'adjust' — set the absolute quantity (admin correction)
    IF v_stock_id IS NULL THEN
      INSERT INTO stock (
        company_id, depot_id, category_id, category_product_id,
        condition, quantity
      ) VALUES (
        v_company_id, p_depot_id, p_category_id, p_product_id,
        p_condition, p_quantity
      )
      RETURNING id, quantity INTO v_stock_id, v_new;
    ELSE
      v_new := p_quantity;
      UPDATE stock SET quantity = v_new, updated_at = now() WHERE id = v_stock_id;
    END IF;
  END IF;

  INSERT INTO stock_movements (
    company_id, depot_id, category_id, category_product_id,
    movement_type, quantity, condition_before, condition_after,
    notes, performed_by, created_at
  ) VALUES (
    v_company_id, p_depot_id, p_category_id, p_product_id,
    p_movement_type, p_quantity, p_condition, p_condition,
    COALESCE(NULLIF(trim(p_notes), ''), 'apply_stock_movement'),
    v_actor, now()
  )
  RETURNING id INTO v_movement;

  stock_id     := v_stock_id;
  new_quantity := v_new;
  movement_id  := v_movement;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_stock_movement(uuid, uuid, uuid, text, integer, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.apply_stock_movement(uuid, uuid, uuid, text, integer, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.apply_stock_movement(uuid, uuid, uuid, text, integer, text, text) IS
  'Atomic stock movement: locks the (company, depot, category, product, condition) row with FOR UPDATE, validates exit does not over-draw, writes the new quantity and a single stock_movements audit row in the same transaction. Replaces the client-side read-then-write pattern in Stock.tsx (company + depot pages).';
