/*
  # LUCID (VerpackG) registration tracking on companies

  Since 1 July 2022, German law requires every distributor of packaging
  — including B2B transport packaging like wooden pallets — to register
  with the **Stiftung Zentrale Stelle Verpackungsregister (ZSVR)** via
  the LUCID portal before placing such packaging on the German market.

  Failure to register is sanctioned by fines of up to €200,000 per
  violation under §34 VerpackG, plus a sales prohibition. Pool
  participants are exempted from system participation under §12
  VerpackG, but they are NOT exempted from registration itself — a
  point widely missed by operators.

  This migration adds the two fields needed to track the registration
  per tenant company. The UI surfaces a warning on the company
  settings page when:
    - `country = 'DE'`, AND
    - `lucid_registration_number IS NULL OR lucid_registered_at IS NULL`.

  ## What's added

  - `companies.lucid_registration_number` text NULL
    Format: `DE` + 13 digits, e.g. `DE1234567890123`.
  - `companies.lucid_registered_at` date NULL — the date ZSVR confirmed
    registration. Used to compute the annual data-submission reminder
    (mass quantity declaration due each February).

  ## Safety

  - Both columns nullable, no INSERT statement breaks.
  - Idempotent via DO IF NOT EXISTS.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND column_name = 'lucid_registration_number'
  ) THEN
    ALTER TABLE public.companies
      ADD COLUMN lucid_registration_number text NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND column_name = 'lucid_registered_at'
  ) THEN
    ALTER TABLE public.companies
      ADD COLUMN lucid_registered_at date NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.companies.lucid_registration_number IS
  'LUCID / VerpackG registration number issued by ZSVR (format: DE + 13 digits). Required for DE companies that place packaging on the German market.';

COMMENT ON COLUMN public.companies.lucid_registered_at IS
  'Date of LUCID registration confirmation by ZSVR. Drives the annual mass-quantity declaration reminder (due each February).';
