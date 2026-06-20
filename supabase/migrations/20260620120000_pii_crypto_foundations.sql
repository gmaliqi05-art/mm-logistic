/*
  # PII encryption foundations (audit follow-up — "Enkriptim i te dhenave sensitive")

  Phase 1 of N: set up the cryptographic primitives that per-table
  encryption migrations will lean on. NO tables are touched here — this
  migration only adds the `pii` schema, helper functions, and Vault keys.

  Per-table migrations (profiles, companies, partners, clients — separate
  PRs) will follow this pattern:

    1. Add `<col>_encrypted bytea` + `<col>_fingerprint bytea` columns.
    2. Backfill from existing plaintext via `pii.encrypt` / `pii.fingerprint`.
    3. Expose a security_invoker view that returns the decrypted text so
       PostgREST callers see the same shape as before.
    4. UNIQUE on `<col>_fingerprint` for fields that need dedupe (email).
    5. In a later migration, drop the plaintext column.

  ## Keys

  Two independent secrets live in Supabase Vault and are generated on
  first apply (idempotent — re-running the migration after deploy does
  not rotate them):

    - `pii_encryption_key_v1`   — 32 random bytes, used by `pii.encrypt`
                                  / `pii.decrypt` via pgp_sym_encrypt.
    - `pii_fingerprint_key_v1`  — 32 random bytes, used by
                                  `pii.fingerprint` (HMAC-SHA256). Kept
                                  separate so a fingerprint-key
                                  compromise does NOT yield plaintext.

  The `_v1` suffix is deliberate: future key rotation adds `_v2` etc.
  and per-table migrations get a version column.

  ## Permissions

  - `pii.encrypt` / `pii.decrypt`: EXECUTE granted only to `service_role`
    (edge functions running with the service-role key). Frontend code
    never calls these directly — it goes through views or RPCs that wrap
    them and apply their own RLS-style authorization.
  - `pii.fingerprint`: EXECUTE granted to `authenticated` because it is
    one-way and is needed at insert time to compute the dedupe index
    value.
  - `pii.normalize_email` / `pii.normalize_phone`: also `authenticated` —
    same justification (pure functions, no secret access).
  - `pii.read_key` (internal): NOT exposed to anyone outside the schema;
    only the encrypt/decrypt/fingerprint helpers call it.

  ## Algorithm choice

  pgp_sym_encrypt (PGP-CFB + MDC) was chosen over raw AES-GCM because
  pgcrypto exposes it natively, it includes a random IV per call, and
  the ciphertext is authenticated (modification detection). Performance
  is acceptable for low-cardinality PII fields (a few writes per request,
  reads via views amortize over the result set).
*/

-- Pre-req extensions. Both already enabled in this project; the IF NOT
-- EXISTS guard makes the migration safe to apply to a fresh DB too.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

CREATE SCHEMA IF NOT EXISTS pii;

-- Generate the two keys on first apply. gen_random_bytes is in pgcrypto.
-- Encoded as hex so the Vault string field stays printable / inspectable
-- via psql; the helper functions hex-decode on the way out.
DO $$
DECLARE
  v_encryption_secret text;
  v_fingerprint_secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'pii_encryption_key_v1') THEN
    v_encryption_secret := encode(extensions.gen_random_bytes(32), 'hex');
    PERFORM vault.create_secret(
      v_encryption_secret,
      'pii_encryption_key_v1',
      'PII column encryption master key (AES-256 / pgp_sym). Rotate by creating _v2 and re-encrypting.'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'pii_fingerprint_key_v1') THEN
    v_fingerprint_secret := encode(extensions.gen_random_bytes(32), 'hex');
    PERFORM vault.create_secret(
      v_fingerprint_secret,
      'pii_fingerprint_key_v1',
      'PII blind-index HMAC key. Distinct from the encryption key so leaking it does not yield plaintext.'
    );
  END IF;
END $$;

-- Internal: fetch a Vault secret by name and return the raw bytes.
-- Marked STABLE so it can be inlined when used inside SQL expressions,
-- but DO NOT mark IMMUTABLE — the underlying vault.decrypted_secrets is
-- a view over decrypted material and we want the planner to re-evaluate
-- per statement.
CREATE OR REPLACE FUNCTION pii.read_key(p_name text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hex text;
BEGIN
  SELECT decrypted_secret INTO v_hex
  FROM vault.decrypted_secrets
  WHERE name = p_name;

  IF v_hex IS NULL OR length(v_hex) = 0 THEN
    RAISE EXCEPTION 'PII key % missing or empty in Vault', p_name
      USING ERRCODE = 'config_file_error';
  END IF;

  RETURN decode(v_hex, 'hex');
END;
$$;
REVOKE EXECUTE ON FUNCTION pii.read_key(text) FROM PUBLIC;

-- Encrypt a plaintext string. Returns NULL for NULL input so callers can
-- migrate columns lazily without sentinel handling.
CREATE OR REPLACE FUNCTION pii.encrypt(p_plaintext text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key bytea;
BEGIN
  IF p_plaintext IS NULL THEN
    RETURN NULL;
  END IF;
  v_key := pii.read_key('pii_encryption_key_v1');
  -- pgp_sym_encrypt requires a text password, not bytea — encode the
  -- 32-byte key as hex so it round-trips losslessly into the underlying
  -- string KDF. Same encoding on decrypt below.
  RETURN extensions.pgp_sym_encrypt(p_plaintext, encode(v_key, 'hex'));
END;
$$;
REVOKE EXECUTE ON FUNCTION pii.encrypt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pii.encrypt(text) TO service_role;

CREATE OR REPLACE FUNCTION pii.decrypt(p_ciphertext bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key bytea;
BEGIN
  IF p_ciphertext IS NULL THEN
    RETURN NULL;
  END IF;
  v_key := pii.read_key('pii_encryption_key_v1');
  RETURN extensions.pgp_sym_decrypt(p_ciphertext, encode(v_key, 'hex'));
END;
$$;
REVOKE EXECUTE ON FUNCTION pii.decrypt(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pii.decrypt(bytea) TO service_role;

-- Deterministic blind-index fingerprint. HMAC-SHA256 with a separate key,
-- so an attacker who steals the fingerprint cannot brute-force back to
-- plaintext without also stealing the fingerprint key, and a leak of the
-- encryption key still leaves fingerprints opaque.
--
-- NB: equal plaintexts → equal fingerprints (that is the whole point — it
-- is what UNIQUE indexes for dedupe rely on). Callers MUST normalize
-- before fingerprinting (see normalize_email / normalize_phone) so
-- "A@B.com" and "a@b.com" land on the same dedupe row.
CREATE OR REPLACE FUNCTION pii.fingerprint(p_plaintext text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key bytea;
BEGIN
  IF p_plaintext IS NULL OR p_plaintext = '' THEN
    RETURN NULL;
  END IF;
  v_key := pii.read_key('pii_fingerprint_key_v1');
  -- hmac has two overloads, (text,text,text) and (bytea,bytea,text). The
  -- fingerprint key lives as raw bytes, so convert the plaintext to bytea
  -- (UTF-8) to land on the bytea overload — passing it as text would force
  -- a lossy cast of the key.
  RETURN extensions.hmac(convert_to(p_plaintext, 'UTF8'), v_key, 'sha256'::text);
END;
$$;
REVOKE EXECUTE ON FUNCTION pii.fingerprint(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pii.fingerprint(text) TO authenticated, service_role;

-- Email normalization: trim, lowercase. Mirrors what register-company
-- and the existing `normalize_trial_email` RPC already do for dedupe.
-- IMMUTABLE — pure function over the input.
CREATE OR REPLACE FUNCTION pii.normalize_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(btrim(p_email));
$$;
REVOKE EXECUTE ON FUNCTION pii.normalize_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pii.normalize_email(text) TO authenticated, service_role;

-- Phone normalization: keep only digits and the leading '+'. Collapses
-- "+49 (30) 123-4567" and "+49301234567" to the same fingerprint without
-- ever shipping E.164 parsing into the DB. Drops everything that is not
-- a digit or a leading plus.
CREATE OR REPLACE FUNCTION pii.normalize_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_phone IS NULL OR btrim(p_phone) = '' THEN NULL
    ELSE
      CASE WHEN left(btrim(p_phone), 1) = '+' THEN '+' ELSE '' END
      || regexp_replace(p_phone, '\D', '', 'g')
  END;
$$;
REVOKE EXECUTE ON FUNCTION pii.normalize_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pii.normalize_phone(text) TO authenticated, service_role;

COMMENT ON SCHEMA pii IS
  'PII encryption foundations. Per-table encrypted columns live in their own schemas; the helpers here provide encrypt/decrypt/fingerprint primitives backed by a Vault-stored key.';
COMMENT ON FUNCTION pii.encrypt(text) IS
  'pgp_sym_encrypt of plaintext with the PII key from Vault. service_role only.';
COMMENT ON FUNCTION pii.decrypt(bytea) IS
  'pgp_sym_decrypt counterpart of pii.encrypt. service_role only — frontend reads go via SECURITY INVOKER views or RPCs that wrap this.';
COMMENT ON FUNCTION pii.fingerprint(text) IS
  'HMAC-SHA256 blind index. Deterministic over input — callers normalize first (see normalize_email / normalize_phone).';
