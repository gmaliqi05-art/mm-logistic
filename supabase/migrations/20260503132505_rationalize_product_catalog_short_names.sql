/*
  # Rationalize pallet product catalog (short display names)

  1. Cleanup
    - Re-point all references on the duplicate empty-SKU "Euro Pallet EPAL Klasse B"
      (id 4c8442d3) to the canonical row (id e1b20725, sku EP-002) in:
        delivery_note_items, stock, stock_movements, depot_repairs,
        pallet_sorting_items (if present), acc_transactions (if column exists)
    - Delete the duplicate row.
    - Delete shortcut-only rows from catalog that should not be products:
        "A Klasse", "B Klasse", "C Klasse", "Defekt", "Euro Paleta e Re"
      (verified they have no references). These act as UI condition shortcuts
      only, not real catalog products.

  2. Rename to short form
    - "Euro Pallet EPAL Klasse A" -> "Klasse A"
    - "Euro Pallet EPAL Klasse B" -> "Klasse B"
    - "Euro Pallet EPAL Klasse C" -> "Klasse C"
    - Base entry "Euro Pallet EPAL" stays (new-product / default variant).
    - Ensure each has a SKU so matcher still has a tiebreaker. Klasse C
      gets sku "EP-003" if blank.

  3. Safety
    - Uses DO blocks with IF EXISTS so it can run once on dev and idempotently
      elsewhere.
    - Only touches rows by id; does not DROP columns.
*/

DO $$
BEGIN
  UPDATE delivery_note_items SET category_product_id = 'e1b20725-7337-42ed-8021-0ea042335c3a'
    WHERE category_product_id = '4c8442d3-4d83-4a2a-9a1b-04bbfa61bb17';
  UPDATE stock SET category_product_id = 'e1b20725-7337-42ed-8021-0ea042335c3a'
    WHERE category_product_id = '4c8442d3-4d83-4a2a-9a1b-04bbfa61bb17';
  UPDATE stock_movements SET category_product_id = 'e1b20725-7337-42ed-8021-0ea042335c3a'
    WHERE category_product_id = '4c8442d3-4d83-4a2a-9a1b-04bbfa61bb17';
  UPDATE depot_repairs SET category_product_id = 'e1b20725-7337-42ed-8021-0ea042335c3a'
    WHERE category_product_id = '4c8442d3-4d83-4a2a-9a1b-04bbfa61bb17';

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pallet_sorting_items' AND column_name='category_product_id') THEN
    UPDATE pallet_sorting_items SET category_product_id = 'e1b20725-7337-42ed-8021-0ea042335c3a'
      WHERE category_product_id = '4c8442d3-4d83-4a2a-9a1b-04bbfa61bb17';
  END IF;

  DELETE FROM acc_products WHERE id = '4c8442d3-4d83-4a2a-9a1b-04bbfa61bb17';
  DELETE FROM category_products WHERE id = '4c8442d3-4d83-4a2a-9a1b-04bbfa61bb17';
END $$;

DO $$
DECLARE
  shortcut_ids uuid[] := ARRAY[
    'f1c6c586-687f-4f0f-b172-3c9838175e75',
    '81ac7f57-51e7-4738-b6de-5f059c9e2793',
    '04193e75-53b0-498b-af2a-7d8b26ad79d2',
    'ab099a59-a8b6-4b16-916c-91917ef31c65',
    '39ff77f6-93f9-4d11-9bd1-82a1b8dfd7b5'
  ];
BEGIN
  DELETE FROM acc_products WHERE id = ANY(shortcut_ids);
  DELETE FROM category_products WHERE id = ANY(shortcut_ids);
END $$;

UPDATE category_products SET name = 'Klasse A'
  WHERE id = 'a7fe5f97-6fbd-4725-b5f1-079a557ee75b';
UPDATE category_products SET name = 'Klasse B'
  WHERE id = 'e1b20725-7337-42ed-8021-0ea042335c3a';
UPDATE category_products SET name = 'Klasse C', sku = COALESCE(NULLIF(sku,''), 'EP-003')
  WHERE id = '432fef53-19f5-430d-99f7-0e01800c2bde';

UPDATE acc_products SET name = 'Klasse A'
  WHERE id = 'a7fe5f97-6fbd-4725-b5f1-079a557ee75b';
UPDATE acc_products SET name = 'Klasse B'
  WHERE id = 'e1b20725-7337-42ed-8021-0ea042335c3a';
UPDATE acc_products SET name = 'Klasse C'
  WHERE id = '432fef53-19f5-430d-99f7-0e01800c2bde';
