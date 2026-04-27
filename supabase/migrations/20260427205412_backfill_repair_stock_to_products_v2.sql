/*
  # Backfill repair stock to specific products (v2)

  Re-runs the redistribution using POSIX-compatible matching after the v1
  attempt failed silently because PostgreSQL's `~*` operator does not support
  `\s` / `\b` Perl-style escapes. v2 uses substring/ILIKE matching with a
  helper expression that extracts the trailing klass letter from both the
  freeform product_name and the catalog product name.

  Idempotent: only redistributes stock rows still flagged as
  `category_product_id IS NULL` and `condition='good'`.
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
  CREATE TEMP TABLE IF NOT EXISTS tmp_repair_alloc_v2 (
    company_id uuid,
    depot_id uuid,
    category_id uuid,
    category_product_id uuid,
    quantity integer
  ) ON COMMIT DROP;

  WITH entries AS (
    SELECT
      rr.company_id,
      rr.depot_id,
      (entry->>'category_id')::uuid AS category_id,
      lower(trim(entry->>'product_name')) AS pname,
      (entry->>'quantity')::int AS qty
    FROM depot_repair_reports rr
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(rr.details->'workers', '[]'::jsonb)) worker
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(worker->'entries', '[]'::jsonb)) entry
    WHERE rr.sent_to_stock_at IS NOT NULL
      AND rr.scope = 'company'
      AND rr.depot_id IS NOT NULL
      AND (entry->>'category_id') IS NOT NULL
      AND (entry->>'product_name') IS NOT NULL
  ),
  classified AS (
    SELECT
      e.*,
      CASE
        WHEN e.pname ~* '(^|[^a-z])a([^a-z]|$)' AND (e.pname LIKE '%klasse%' OR e.pname LIKE '%klass%' OR e.pname LIKE '%kualitet%' OR e.pname LIKE '%class%' OR e.pname LIKE '%kls%' OR e.pname IN ('a', 'a klasse', 'klasse a', 'a kualitet', 'kualitet a')) THEN 'A'
        WHEN e.pname ~* '(^|[^a-z])b([^a-z]|$)' AND (e.pname LIKE '%klasse%' OR e.pname LIKE '%klass%' OR e.pname LIKE '%kualitet%' OR e.pname LIKE '%class%' OR e.pname LIKE '%kls%' OR e.pname IN ('b', 'b klasse', 'klasse b', 'b kualitet', 'kualitet b')) THEN 'B'
        WHEN e.pname ~* '(^|[^a-z])c([^a-z]|$)' AND (e.pname LIKE '%klasse%' OR e.pname LIKE '%klass%' OR e.pname LIKE '%kualitet%' OR e.pname LIKE '%class%' OR e.pname LIKE '%kls%' OR e.pname IN ('c', 'c klasse', 'klasse c', 'c kualitet', 'kualitet c')) THEN 'C'
        ELSE NULL
      END AS klass
    FROM entries e
  )
  INSERT INTO tmp_repair_alloc_v2 (company_id, depot_id, category_id, category_product_id, quantity)
  SELECT
    c.company_id,
    c.depot_id,
    c.category_id,
    cp.id,
    SUM(c.qty)
  FROM classified c
  LEFT JOIN LATERAL (
    SELECT cp_inner.id
    FROM category_products cp_inner
    WHERE cp_inner.company_id = c.company_id
      AND cp_inner.category_id = c.category_id
      AND (
        lower(trim(cp_inner.name)) = c.pname
        OR (
          c.klass IS NOT NULL
          AND (
            lower(cp_inner.name) LIKE '%klasse ' || lower(c.klass) || '%'
            OR lower(cp_inner.name) LIKE '%klass ' || lower(c.klass) || '%'
            OR lower(cp_inner.name) LIKE '%kualitet ' || lower(c.klass) || '%'
            OR lower(cp_inner.name) LIKE '%class ' || lower(c.klass) || '%'
          )
        )
      )
    ORDER BY
      CASE WHEN lower(trim(cp_inner.name)) = c.pname THEN 0 ELSE 1 END,
      cp_inner.name
    LIMIT 1
  ) cp ON true
  WHERE cp.id IS NOT NULL
  GROUP BY c.company_id, c.depot_id, c.category_id, cp.id;

  FOR v_stock IN
    SELECT s.id, s.company_id, s.depot_id, s.category_id, s.quantity, s.condition
    FROM stock s
    WHERE s.category_product_id IS NULL
      AND s.quantity > 0
      AND s.depot_id IS NOT NULL
      AND s.condition = 'good'
  LOOP
    SELECT COALESCE(SUM(quantity), 0) INTO v_total_repaired
    FROM tmp_repair_alloc_v2
    WHERE company_id = v_stock.company_id
      AND depot_id = v_stock.depot_id
      AND category_id = v_stock.category_id;

    IF v_total_repaired <= 0 THEN
      CONTINUE;
    END IF;

    v_remaining := v_stock.quantity;

    FOR v_alloc IN
      SELECT category_product_id, quantity
      FROM tmp_repair_alloc_v2
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
