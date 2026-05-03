/*
  # Merge duplicate "Euro Paleta" category into canonical "Euro Paletten"

  1. Changes
    - Re-point all FK references pointing to the typo category row
      ("Euro Paleta" / "Euro Palette") to the canonical row
      ("Euro Paletten") for the same company.
    - Tables updated: category_products, delivery_note_items, stock,
      acc_products, acc_transactions, stock_alerts, depot_repairs,
      stock_movements, pallet_sorting_batches.
    - Delete the now-empty typo category rows.

  2. Strategy
    - For each company that has both, transfer children then delete typo row.

  3. Safety
    - Uses DO block with explicit lookups per company.
    - No columns dropped, no destructive schema changes.
*/

DO $$
DECLARE
  typo_id uuid;
  canon_id uuid;
  c_id uuid;
BEGIN
  FOR c_id IN
    SELECT DISTINCT company_id FROM product_categories
    WHERE lower(trim(name)) IN ('euro paleta','euro palette','euro paletten')
  LOOP
    SELECT id INTO canon_id FROM product_categories
      WHERE company_id = c_id AND lower(trim(name)) = 'euro paletten'
      LIMIT 1;

    IF canon_id IS NULL THEN
      CONTINUE;
    END IF;

    FOR typo_id IN
      SELECT id FROM product_categories
      WHERE company_id = c_id
        AND lower(trim(name)) IN ('euro paleta','euro palette')
        AND id <> canon_id
    LOOP
      UPDATE category_products SET category_id = canon_id WHERE category_id = typo_id;
      UPDATE delivery_note_items SET category_id = canon_id WHERE category_id = typo_id;
      UPDATE stock SET category_id = canon_id WHERE category_id = typo_id;
      UPDATE acc_products SET category_id = canon_id WHERE category_id = typo_id;
      UPDATE acc_transactions SET category_id = canon_id WHERE category_id = typo_id;
      UPDATE stock_alerts SET category_id = canon_id WHERE category_id = typo_id;
      UPDATE depot_repairs SET category_id = canon_id WHERE category_id = typo_id;
      UPDATE stock_movements SET category_id = canon_id WHERE category_id = typo_id;
      UPDATE pallet_sorting_batches SET category_id = canon_id WHERE category_id = typo_id;

      DELETE FROM product_categories WHERE id = typo_id;
    END LOOP;
  END LOOP;
END $$;
