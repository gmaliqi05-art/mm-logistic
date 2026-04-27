/*
  # Backfill repair stock to specific products

  Historic repair confirmations stored only freeform `product_name`. As a result
  existing `stock` rows for repaired pallets have `category_product_id IS NULL`,
  causing the Company Admin Stock page to show lump sums under categories
  (e.g. "Euro Paletten 1619") instead of the A/B/C Klasse breakdown.

  ## What this migration does
  1. Builds a per (company, depot, category, product_name) breakdown from every
     confirmed `depot_repair_reports.details.workers[].entries[]`.
  2. Resolves each freeform product_name to a real `category_products.id`:
     - Direct case-insensitive match within the same category, OR
     - Klasse A/B/C heuristic when the freeform text is "A Kualitet", "B Klasse",
       etc., mapping to the matching `Klasse A/B/C` product in that category.
  3. Computes proportions per (company, depot, category) and redistributes
     existing unassigned stock rows (`category_product_id IS NULL`,
     `condition='good'`) accordingly. Rounding remainders stay on the original
     unassigned row so no quantity is lost.

  Idempotent: only operates on rows that still have `category_product_id IS NULL`.
*/

DO $$
DECLARE
  v_stock RECORD;
  v_total_repaired numeric;
  v_remaining integer;
  v_alloc RECORD;
  v_allocated integer;
  v_existing_id uuid;
  v_now timestamptz := now();
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS tmp_repair_alloc (
    company_id uuid,
    depot_id uuid,
    category_id uuid,
    category_product_id uuid,
    quantity integer
  ) ON COMMIT DROP;

  INSERT INTO tmp_repair_alloc (company_id, depot_id, category_id, category_product_id, quantity)
  SELECT
    rr.company_id,
    rr.depot_id,
    (entry->>'category_id')::uuid,
    cp.id,
    SUM((entry->>'quantity')::int)
  FROM depot_repair_reports rr
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(rr.details->'workers', '[]'::jsonb)) worker
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(worker->'entries', '[]'::jsonb)) entry
  JOIN product_categories pc
    ON pc.id = (entry->>'category_id')::uuid
   AND pc.company_id = rr.company_id
  LEFT JOIN LATERAL (
    SELECT cp_inner.id
    FROM category_products cp_inner
    WHERE cp_inner.company_id = rr.company_id
      AND cp_inner.category_id = (entry->>'category_id')::uuid
      AND (
        lower(trim(cp_inner.name)) = lower(trim(entry->>'product_name'))
        OR (
          (entry->>'product_name') ~* '(klasse|klass|kualitet|class|kls)\s*a\b|^\s*a\s+(klasse|klass|kualitet|class|kls)\b|^\s*a\s*$'
          AND cp_inner.name ~* '(klasse|klass|kualitet|class|kls)\s*a\b|\ba\s+(klasse|klass|kualitet|class|kls)\b'
        )
        OR (
          (entry->>'product_name') ~* '(klasse|klass|kualitet|class|kls)\s*b\b|^\s*b\s+(klasse|klass|kualitet|class|kls)\b|^\s*b\s*$'
          AND cp_inner.name ~* '(klasse|klass|kualitet|class|kls)\s*b\b|\bb\s+(klasse|klass|kualitet|class|kls)\b'
        )
        OR (
          (entry->>'product_name') ~* '(klasse|klass|kualitet|class|kls)\s*c\b|^\s*c\s+(klasse|klass|kualitet|class|kls)\b|^\s*c\s*$'
          AND cp_inner.name ~* '(klasse|klass|kualitet|class|kls)\s*c\b|\bc\s+(klasse|klass|kualitet|class|kls)\b'
        )
      )
    ORDER BY
      CASE WHEN lower(trim(cp_inner.name)) = lower(trim(entry->>'product_name')) THEN 0 ELSE 1 END,
      cp_inner.name
    LIMIT 1
  ) cp ON true
  WHERE rr.sent_to_stock_at IS NOT NULL
    AND rr.scope = 'company'
    AND rr.depot_id IS NOT NULL
    AND cp.id IS NOT NULL
  GROUP BY rr.company_id, rr.depot_id, (entry->>'category_id')::uuid, cp.id;

  FOR v_stock IN
    SELECT s.id, s.company_id, s.depot_id, s.category_id, s.quantity, s.condition
    FROM stock s
    WHERE s.category_product_id IS NULL
      AND s.quantity > 0
      AND s.depot_id IS NOT NULL
      AND s.condition = 'good'
  LOOP
    SELECT COALESCE(SUM(quantity), 0) INTO v_total_repaired
    FROM tmp_repair_alloc
    WHERE company_id = v_stock.company_id
      AND depot_id = v_stock.depot_id
      AND category_id = v_stock.category_id;

    IF v_total_repaired <= 0 THEN
      CONTINUE;
    END IF;

    v_remaining := v_stock.quantity;

    FOR v_alloc IN
      SELECT category_product_id, quantity
      FROM tmp_repair_alloc
      WHERE company_id = v_stock.company_id
        AND depot_id = v_stock.depot_id
        AND category_id = v_stock.category_id
      ORDER BY quantity DESC
    LOOP
      v_allocated := FLOOR((v_alloc.quantity::numeric / v_total_repaired) * v_stock.quantity)::int;
      IF v_allocated <= 0 THEN
        CONTINUE;
      END IF;
      IF v_allocated > v_remaining THEN
        v_allocated := v_remaining;
      END IF;

      SELECT id INTO v_existing_id
      FROM stock
      WHERE company_id = v_stock.company_id
        AND depot_id = v_stock.depot_id
        AND category_id = v_stock.category_id
        AND category_product_id = v_alloc.category_product_id
        AND condition = 'good'
      LIMIT 1;

      IF v_existing_id IS NOT NULL THEN
        UPDATE stock
        SET quantity = quantity + v_allocated,
            updated_at = v_now
        WHERE id = v_existing_id;
      ELSE
        INSERT INTO stock (company_id, depot_id, category_id, category_product_id, condition, quantity, created_at, updated_at)
        VALUES (v_stock.company_id, v_stock.depot_id, v_stock.category_id, v_alloc.category_product_id, 'good', v_allocated, v_now, v_now);
      END IF;

      v_remaining := v_remaining - v_allocated;
      EXIT WHEN v_remaining <= 0;
    END LOOP;

    IF v_remaining < v_stock.quantity THEN
      IF v_remaining <= 0 THEN
        DELETE FROM stock WHERE id = v_stock.id;
      ELSE
        UPDATE stock SET quantity = v_remaining, updated_at = v_now WHERE id = v_stock.id;
      END IF;
    END IF;
  END LOOP;
END $$;
