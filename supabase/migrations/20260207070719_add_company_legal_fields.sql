/*
  # Add Legal and Tax Fields to Companies Table

  This migration adds required legal and tax information fields for companies operating in Germany, Europe, and Kosovo.

  1. Changes to companies table:
    - Add vat_number (VAT/USt-ID for EU, or Tax ID for Kosovo)
    - Add tax_number (Steuernummer for Germany, Numri Fiskal for Kosovo)
    - Add commercial_register (Handelsregisternummer / Numri i Biznesit)
    - Add legal_form (GmbH, AG, UG, etc.)
    - Add registration_court (Amtsgericht - court where registered)
    - Add country (Operating country)
    - Add city (City)
    - Add postal_code (Postal/ZIP code)
    - Add website (Company website - optional)
    
  2. Notes:
    - VAT number is mandatory for companies in EU
    - Tax number is required in Germany and Kosovo
    - Commercial register number proves legal registration
    - All fields are optional to maintain backward compatibility
*/

-- Add legal and tax fields
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS vat_number text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS tax_number text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS commercial_register text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS legal_form text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS registration_court text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS country text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS city text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS postal_code text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS website text DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN companies.vat_number IS 'VAT/USt-ID (EU) or Tax ID number';
COMMENT ON COLUMN companies.tax_number IS 'Steuernummer (DE) or Numri Fiskal (XK)';
COMMENT ON COLUMN companies.commercial_register IS 'Handelsregisternummer (DE) or Numri i Biznesit (XK)';
COMMENT ON COLUMN companies.legal_form IS 'Legal form: GmbH, AG, UG, etc.';
COMMENT ON COLUMN companies.registration_court IS 'Amtsgericht (court of registration)';
COMMENT ON COLUMN companies.country IS 'Operating country (DE, XK, AT, CH, etc.)';
COMMENT ON COLUMN companies.city IS 'City of registration';
COMMENT ON COLUMN companies.postal_code IS 'Postal/ZIP code';
COMMENT ON COLUMN companies.website IS 'Company website URL';

-- Create indexes for searching by VAT and tax numbers
CREATE INDEX IF NOT EXISTS idx_companies_vat_number ON companies(vat_number) WHERE vat_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_tax_number ON companies(tax_number) WHERE tax_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_country ON companies(country) WHERE country IS NOT NULL;
