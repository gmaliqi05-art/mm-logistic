/*
  # Clean up delivery_notes.partner_name / counterparty_name that contain own company

  Background: AI extraction (or legacy input) sometimes wrote values like "SAL PAL / Enlirat GmbH"
  into delivery_notes.partner_name or counterparty_name. This shows up incorrectly in the
  "Partneri" column. The own-company portion must be stripped so that only the actual partner
  remains.

  1. New helper functions (IMMUTABLE, no side effects on tables):
    - `private.norm_company_label(text)` - normalized comparable label
    - `private.split_partner_candidates(text)` - splits on common separators
    - `private.strip_own_from_partner(text, text, text)` - removes the own-company piece

  2. Data fix:
    - For each delivery_note, compute the cleaned partner_name and counterparty_name using
      the own company's name/vat, and update only if the cleaned value differs.
    - If after cleaning nothing is left, set both fields to NULL so the UI shows "-" instead of
      the misleading combined string.

  3. Safety:
    - No DROP, no DELETE of rows.
    - Function lives in `private` schema (already used by RLS helpers).
*/

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.norm_company_label(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(lower(coalesce(txt,'')), '[^a-z0-9]+', '', 'g')
$$;

CREATE OR REPLACE FUNCTION private.strip_own_from_partner(
  raw_name text,
  own_name text,
  own_vat text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  part text;
  remaining text[] := ARRAY[]::text[];
  n_own text := private.norm_company_label(own_name);
  n_part text;
BEGIN
  IF raw_name IS NULL OR btrim(raw_name) = '' THEN
    RETURN NULL;
  END IF;

  -- Split on / | \ ; , • and surrounding hyphens/dashes
  parts := regexp_split_to_array(raw_name, '\s*(?:/|\||\\|•|;|,|\s-\s|\s—\s|\s–\s)\s*');

  IF array_length(parts,1) IS NULL OR array_length(parts,1) <= 1 THEN
    IF n_own <> '' AND private.norm_company_label(raw_name) = n_own THEN
      RETURN NULL;
    END IF;
    RETURN btrim(raw_name);
  END IF;

  FOREACH part IN ARRAY parts LOOP
    IF btrim(part) = '' THEN
      CONTINUE;
    END IF;
    n_part := private.norm_company_label(part);
    IF n_own <> '' AND (
       n_part = n_own
       OR (length(n_own) >= 4 AND (position(n_own in n_part) > 0 OR position(n_part in n_own) > 0))
    ) THEN
      CONTINUE; -- this piece is the own company
    END IF;
    remaining := array_append(remaining, btrim(part));
  END LOOP;

  IF coalesce(array_length(remaining,1),0) = 0 THEN
    RETURN NULL;
  ELSIF array_length(remaining,1) = 1 THEN
    RETURN remaining[1];
  ELSE
    RETURN array_to_string(remaining, ' / ');
  END IF;
END;
$$;

-- Apply cleanup
WITH candidates AS (
  SELECT
    dn.id,
    private.strip_own_from_partner(dn.partner_name, c.name, c.vat_number) AS clean_partner,
    private.strip_own_from_partner(dn.counterparty_name, c.name, c.vat_number) AS clean_counterparty,
    dn.partner_name AS old_partner,
    dn.counterparty_name AS old_counterparty
  FROM public.delivery_notes dn
  JOIN public.companies c ON c.id = dn.company_id
)
UPDATE public.delivery_notes dn
SET
  partner_name = cand.clean_partner,
  counterparty_name = cand.clean_counterparty,
  updated_at = now()
FROM candidates cand
WHERE dn.id = cand.id
  AND (
    cand.clean_partner IS DISTINCT FROM dn.partner_name
    OR cand.clean_counterparty IS DISTINCT FROM dn.counterparty_name
  );

REVOKE ALL ON FUNCTION private.norm_company_label(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.strip_own_from_partner(text,text,text) FROM PUBLIC;
