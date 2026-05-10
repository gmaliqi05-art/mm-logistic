/*
  # Zgjerim i `category_products` me fushat per identifikim automatik

  1. Ndryshime ne tabele
    - `aliases` (text[], default '{}') — lista e emrave alternative qe shfaqen ne fatura/fletedergesa dhe duhen njohur si ky produkt (p.sh. "Europalette B Qualität")
    - `keywords` (text[], default '{}') — fjale kyce shtese qe ndihmojne matching-un (p.sh. "gebraucht", "B Qualität")
    - `dimensions` (text, nullable) — permasat standarde te produktit te normalizuara (p.sh. "1200x800"); perdoren nga matcher-i per krahasim me permasat e nxjerra nga teksti
    - `default_condition` (text, nullable) — kushti default kur ky produkt identifikohet (good/damaged/ready_a/ready_b/ready_c/sorting)

  2. Index
    - GIN index mbi `aliases` dhe `keywords` per kerkim te shpejte

  3. Siguri
    - Tabela ka RLS ekzistuese te paprekur; kolonat e reja ndjekin te njejtat policies

  4. Shenime
    - Te gjitha fushat jane opsionale; matching-u ekzistues vazhdon te funksionoje nese fushat jane bosh.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'category_products' AND column_name = 'aliases'
  ) THEN
    ALTER TABLE category_products ADD COLUMN aliases text[] DEFAULT '{}'::text[] NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'category_products' AND column_name = 'keywords'
  ) THEN
    ALTER TABLE category_products ADD COLUMN keywords text[] DEFAULT '{}'::text[] NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'category_products' AND column_name = 'dimensions'
  ) THEN
    ALTER TABLE category_products ADD COLUMN dimensions text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'category_products' AND column_name = 'default_condition'
  ) THEN
    ALTER TABLE category_products ADD COLUMN default_condition text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_category_products_aliases_gin ON category_products USING gin (aliases);
CREATE INDEX IF NOT EXISTS idx_category_products_keywords_gin ON category_products USING gin (keywords);
