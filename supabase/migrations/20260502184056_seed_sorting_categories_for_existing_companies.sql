/*
  # Seed standard sorting categories for existing companies (idempotent).
*/

DO $$
DECLARE
  c record;
  cat_id uuid;
BEGIN
  FOR c IN SELECT id FROM public.companies LOOP

    SELECT id INTO cat_id
    FROM public.product_categories
    WHERE company_id = c.id
      AND lower(name) IN ('euro paleta','euro palette','epal','uic','euro pallet','eur')
    ORDER BY created_at LIMIT 1;

    IF cat_id IS NULL THEN
      INSERT INTO public.product_categories (company_id, name, description, sorting_mode, aliases)
      VALUES (c.id, 'Euro Paleta', 'EPAL / UIC / Euro Palette',
              'class',
              ARRAY['EPAL','UIC','Euro Palette','EUR','Euro Pallet']::text[])
      RETURNING id INTO cat_id;
    ELSE
      UPDATE public.product_categories
        SET sorting_mode = 'class',
            aliases = ARRAY(SELECT DISTINCT unnest(
              COALESCE(aliases, ARRAY[]::text[]) ||
              ARRAY['EPAL','UIC','Euro Palette','EUR','Euro Pallet']::text[]))
        WHERE id = cat_id;
    END IF;

    INSERT INTO public.category_products (company_id, category_id, name, description)
    SELECT c.id, cat_id, n, ''
    FROM unnest(ARRAY['Euro Paleta e Re','A Klasse','B Klasse','C Klasse','Defekt']) AS n
    WHERE NOT EXISTS (
      SELECT 1 FROM public.category_products
      WHERE company_id = c.id AND category_id = cat_id AND lower(name) = lower(n)
    );

    SELECT id INTO cat_id
    FROM public.product_categories
    WHERE company_id = c.id AND lower(name) = 'cp'
    ORDER BY created_at LIMIT 1;

    IF cat_id IS NULL THEN
      INSERT INTO public.product_categories (company_id, name, description, sorting_mode, aliases)
      VALUES (c.id, 'CP', 'Chemical / Industrial pallets',
              'type',
              ARRAY['CP Pallet','Chemical Pallet']::text[])
      RETURNING id INTO cat_id;
    ELSE
      UPDATE public.product_categories
        SET sorting_mode = 'type',
            aliases = ARRAY(SELECT DISTINCT unnest(
              COALESCE(aliases, ARRAY[]::text[]) ||
              ARRAY['CP Pallet','Chemical Pallet']::text[]))
        WHERE id = cat_id;
    END IF;

    INSERT INTO public.category_products (company_id, category_id, name, description)
    SELECT c.id, cat_id, n, ''
    FROM unnest(ARRAY['CP1','CP2','CP3','CP4','CP5','CP6','CP7','CP8','CP9']) AS n
    WHERE NOT EXISTS (
      SELECT 1 FROM public.category_products
      WHERE company_id = c.id AND category_id = cat_id AND lower(name) = lower(n)
    );

  END LOOP;
END $$;
