/*
  # Auto-link companies.country_id from the country text field

  Trigger that fills `country_id` when a company is inserted/updated with a
  `country` text value matching either an ISO-2 code or a country name in the
  catalog. Keeps existing registration flows working without code changes.
*/

CREATE OR REPLACE FUNCTION set_company_country_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.country IS NOT NULL AND (NEW.country_id IS NULL OR TG_OP = 'UPDATE') THEN
    SELECT id INTO NEW.country_id
    FROM countries
    WHERE upper(code) = upper(NEW.country)
       OR lower(name) = lower(NEW.country)
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_company_country_id ON companies;
CREATE TRIGGER trg_set_company_country_id
BEFORE INSERT OR UPDATE OF country ON companies
FOR EACH ROW
EXECUTE FUNCTION set_company_country_id();
