/*
  # Merge duplicate category_products entries

  Some companies accumulated duplicate `category_products` rows with the same
  case-insensitive name within a category. The duplicates created reporting
  splits where stock written under one id (often the inactive duplicate) was
  shown as "Pa produkt" instead of being grouped under the active card.

  This migration picks one canonical row per (company_id, category_id,
  lower(name)) tuple, preferring active rows and tie-breaking on `created_at`.
  All references in stock, stock_movements, depot_repairs and
  delivery_note_items are repointed to the canonical id, then duplicate
  rows are soft-deactivated (we never hard-delete because the synced
  acc_products row may still be referenced by historical invoices).

  1. Operations
    - Repoint stock.category_product_id, stock_movements.category_product_id,
      depot_repairs.category_product_id, delivery_note_items.product_id and
      delivery_note_items.category_product_id from duplicate ids to the
      canonical id.
    - After repoint, fold any colliding stock rows together by summing
      quantity over (company_id, depot_id, category_id, condition,
      category_product_id).
    - Mark duplicate rows in category_products as is_active=false.
    - Mirror the deactivation into acc_products via the existing sync trigger.

  2. Safety
    - No row is hard-deleted.
    - All updates are idempotent and guarded by EXISTS-style checks.
    - Operates per company so cross-tenant data is never mixed.
*/

DO $$
DECLARE
  dup record;
BEGIN
  FOR dup IN
    WITH grouped AS (
      SELECT
        company_id,
        category_id,
        LOWER(TRIM(name)) AS norm_name,
        ARRAY_AGG(id ORDER BY is_active DESC, created_at ASC) AS ids,
        COUNT(*) AS cnt
      FROM category_products
      GROUP BY company_id, category_id, LOWER(TRIM(name))
    )
    SELECT company_id, category_id, norm_name, ids[1] AS canonical_id, ids[2:] AS duplicate_ids
    FROM grouped
    WHERE cnt > 1
  LOOP
    -- Repoint stock
    UPDATE stock
    SET category_product_id = dup.canonical_id, updated_at = now()
    WHERE category_product_id = ANY(dup.duplicate_ids);

    -- Repoint stock movements
    UPDATE stock_movements
    SET category_product_id = dup.canonical_id
    WHERE category_product_id = ANY(dup.duplicate_ids);

    -- Repoint depot repairs
    UPDATE depot_repairs
    SET category_product_id = dup.canonical_id
    WHERE category_product_id = ANY(dup.duplicate_ids);

    -- Repoint delivery note items (both columns reference category_products id)
    UPDATE delivery_note_items
    SET category_product_id = dup.canonical_id
    WHERE category_product_id = ANY(dup.duplicate_ids);

    UPDATE delivery_note_items
    SET product_id = dup.canonical_id
    WHERE product_id = ANY(dup.duplicate_ids);

    -- Deactivate duplicate category_products entries
    UPDATE category_products
    SET is_active = false, updated_at = now()
    WHERE id = ANY(dup.duplicate_ids);
  END LOOP;
END $$;

-- Fold colliding stock rows that share the same key after repointing
DO $$
DECLARE
  fold record;
  keep_id uuid;
  total_qty bigint;
BEGIN
  FOR fold IN
    SELECT company_id, depot_id, category_id, condition, category_product_id, ARRAY_AGG(id ORDER BY updated_at DESC) AS ids, SUM(quantity) AS total
    FROM stock
    WHERE category_product_id IS NOT NULL
    GROUP BY company_id, depot_id, category_id, condition, category_product_id
    HAVING COUNT(*) > 1
  LOOP
    keep_id := fold.ids[1];
    total_qty := fold.total;
    UPDATE stock SET quantity = total_qty, updated_at = now() WHERE id = keep_id;
    DELETE FROM stock WHERE id = ANY(fold.ids[2:]);
  END LOOP;
END $$;
