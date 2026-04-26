/*
  # Location catalog: countries, cities, postal codes

  1. New Tables
    - `countries` (id, name, code ISO-2, flag_emoji, region)
    - `cities` (id, country_id, name, admin_area)
    - `postal_codes` (id, city_id, code, area_name)

  2. Indexes
    - Unique (countries.code), (cities.country_id + lower(name)), (postal_codes.city_id + code)
    - GIN trigram indexes on names / codes for fast autocomplete

  3. Security
    - RLS enabled on all three tables
    - Read: allowed to `authenticated` and `anon` (public reference data)
    - Write: blocked for regular users; only `service_role` can mutate (no policy = denied)
*/

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL,
  flag_emoji text NOT NULL DEFAULT '',
  region text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS countries_code_uk ON countries (upper(code));
CREATE INDEX IF NOT EXISTS countries_name_trgm ON countries USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  name text NOT NULL,
  admin_area text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cities_country_name_uk ON cities (country_id, lower(name));
CREATE INDEX IF NOT EXISTS cities_country_idx ON cities (country_id);
CREATE INDEX IF NOT EXISTS cities_name_trgm ON cities USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS postal_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  code text NOT NULL,
  area_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS postal_codes_city_code_uk ON postal_codes (city_id, code);
CREATE INDEX IF NOT EXISTS postal_codes_city_idx ON postal_codes (city_id);
CREATE INDEX IF NOT EXISTS postal_codes_code_trgm ON postal_codes USING gin (code gin_trgm_ops);

ALTER TABLE countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE postal_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Countries are readable" ON countries;
CREATE POLICY "Countries are readable"
  ON countries FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Cities are readable" ON cities;
CREATE POLICY "Cities are readable"
  ON cities FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Postal codes are readable" ON postal_codes;
CREATE POLICY "Postal codes are readable"
  ON postal_codes FOR SELECT
  TO anon, authenticated
  USING (true);
