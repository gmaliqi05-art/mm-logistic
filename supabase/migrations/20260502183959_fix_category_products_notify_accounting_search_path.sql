/*
  # Fix search_path for category_products_notify_accounting trigger

  The existing trigger function runs with `search_path=public` but depends
  on helpers (`company_has_logistics`, `company_has_accounting`) that live
  in the `private` schema. This causes inserts into `category_products` to
  fail with "function company_has_logistics(uuid) does not exist" whenever
  the trigger fires in a fresh session. We re-qualify the calls with the
  `private` schema to make it robust regardless of search_path.

  No data changes; only function body is replaced.
*/

CREATE OR REPLACE FUNCTION public.category_products_notify_accounting()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  IF NOT (private.company_has_logistics(NEW.company_id)
          AND private.company_has_accounting(NEW.company_id)) THEN
    RETURN NEW;
  END IF;

  FOR rec IN
    SELECT id FROM profiles
    WHERE company_id = NEW.company_id
      AND role = 'accountant'
      AND is_active = true
  LOOP
    INSERT INTO notifications(user_id, title, message, type, reference_id, data)
    VALUES (
      rec.id,
      'Produkt i ri',
      COALESCE(NEW.name,'Produkt') || ' u shtua ne katalog',
      'system',
      NEW.id::text,
      jsonb_build_object('module','logistics','category_product_id', NEW.id)
    );
  END LOOP;

  RETURN NEW;
END
$$;
