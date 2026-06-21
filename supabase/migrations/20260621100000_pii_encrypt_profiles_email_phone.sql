/*
  # Encrypt PII columns: profiles.email and profiles.phone (audit follow-up - Faza 2a)

  Phase 2a of the per-table PII rollout described in
  supabase/migrations/20260620120000_pii_crypto_foundations.sql. Adds
  the encrypted-shadow columns and blind-index fingerprints to
  `public.profiles`, wires a BEFORE INSERT/UPDATE trigger that keeps
  them in sync with the existing plaintext columns, and backfills
  existing rows.

  ## What this migration deliberately does NOT do

  - It does NOT drop or rename `profiles.email` / `profiles.phone`.
  - It does NOT change how PostgREST clients query the table.
  - It does NOT introduce a decrypted view.

  Those are reserved for follow-up migrations:

    - Phase 2b: expose a SECURITY INVOKER view that returns the
      decrypted values, swap frontend + edge-function reads onto it.
    - Phase 2c: drop the plaintext columns.

  Splitting the rollout this way keeps the blast radius of this PR
  contained to a single migration file - the 67 frontend call sites
  and 43 edge-function call sites that touch `profiles` continue to
  see the same row shape while the shadow columns silently catch up.

  ## Sync mechanism

  A BEFORE INSERT/UPDATE trigger (`profiles_sync_pii_columns_trg`)
  recomputes the encrypted + fingerprint columns from the plaintext
  on every write. As long as the trigger is attached:

    INSERT INTO profiles (..., email, ...) VALUES (..., 'a@b.com', ...);
    -- trigger sets email_encrypted + email_fingerprint automatically.

    UPDATE profiles SET email = 'new@x.com' WHERE id = ...;
    -- trigger refreshes both shadow columns.

    UPDATE profiles SET role = 'driver' WHERE id = ...;
    -- trigger does NOT fire (OF email, phone restriction).

  ## Why no UNIQUE on email_fingerprint

  Profile-level email uniqueness is enforced upstream by
  `auth.users.email`. `profiles.email` is a denormalized copy and has
  no UNIQUE constraint today (verified against the live schema -
  only PK and FK constraints exist). Introducing UNIQUE here would
  surface as a new failure mode that current code does not handle, so
  both fingerprint indexes are non-unique. They still pay for
  themselves at lookup time once Phase 2b swaps reads onto the
  decrypted view.

  ## Trigger ordering

  Postgres fires same-event triggers in alphabetical order by name.
  The new trigger sorts as `profiles_sync_pii_columns_trg`, which is
  ordered relative to the existing triggers as:

    profiles_lock_critical_fields           (BEFORE UPDATE)
    profiles_sync_pii_columns_trg           (BEFORE INSERT/UPDATE - new)
    trg_audit_profiles                      (AFTER  INSERT/UPDATE/DELETE)
    trg_profiles_block_self_privilege_escalation (BEFORE UPDATE)

  - `profiles_lock_critical_fields` runs first on UPDATE and aborts
    the statement if a locked field changed, before we waste an
    encrypt call.
  - `trg_profiles_block_self_privilege_escalation` reads role /
    company_id, both of which we never touch.
  - `trg_audit_profiles` is AFTER, so it sees the final NEW row
    including the populated shadow columns - audit_log will record
    them too, which is harmless (the ciphertext is opaque without
    the Vault key).

  ## Permissions

  `pii.encrypt(text)` is granted only to `service_role`. The trigger
  function is declared SECURITY DEFINER and is owned by the migration
  runner (`postgres`), which has implicit EXECUTE on everything in
  the `pii` schema. Writes from any role (anon / authenticated /
  service_role) therefore successfully populate the encrypted columns
  without leaking EXECUTE on `pii.encrypt` to anon or authenticated.
*/

ALTER TABLE public.profiles
  ADD COLUMN email_encrypted bytea,
  ADD COLUMN email_fingerprint bytea,
  ADD COLUMN phone_encrypted bytea,
  ADD COLUMN phone_fingerprint bytea;

COMMENT ON COLUMN public.profiles.email_encrypted IS
  'pgp_sym_encrypt(email) under pii_encryption_key_v1. Kept in sync with profiles.email by profiles_sync_pii_columns_trg. Decrypt via pii.decrypt() (service_role only).';
COMMENT ON COLUMN public.profiles.email_fingerprint IS
  'HMAC-SHA256(pii.normalize_email(email)) under pii_fingerprint_key_v1. Non-unique because dedupe is enforced upstream by auth.users.email.';
COMMENT ON COLUMN public.profiles.phone_encrypted IS
  'pgp_sym_encrypt(phone) under pii_encryption_key_v1. NULL when phone is NULL or empty string. Synced by profiles_sync_pii_columns_trg.';
COMMENT ON COLUMN public.profiles.phone_fingerprint IS
  'HMAC-SHA256(pii.normalize_phone(phone)) under pii_fingerprint_key_v1. NULL when phone is empty.';

-- Sync trigger function: populate encrypted + fingerprint shadow
-- columns from the plaintext on every write. Lets every existing call
-- site keep writing the plaintext column unchanged during the
-- transition to encrypted-at-rest.
--
-- SECURITY DEFINER so it can call pii.encrypt (granted only to
-- service_role). search_path is locked to '' so every schema reference
-- is explicit and the function is immune to search_path-based
-- privilege-escalation attacks.
CREATE OR REPLACE FUNCTION public.profiles_sync_pii_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Email is NOT NULL on profiles. pii.encrypt is non-deterministic
  -- (random IV), so re-encrypting an unchanged email would burn CPU
  -- for no semantic gain - the IS DISTINCT FROM guard makes UPDATEs
  -- that touch email-in-SET-but-with-the-same-value cheap no-ops.
  IF TG_OP = 'INSERT' OR NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email_encrypted   := pii.encrypt(NEW.email);
    NEW.email_fingerprint := pii.fingerprint(pii.normalize_email(NEW.email));
  END IF;

  IF TG_OP = 'INSERT' OR NEW.phone IS DISTINCT FROM OLD.phone THEN
    -- Phone defaults to '' on this table and is frequently empty.
    -- Collapse both '' and NULL onto NULL ciphertext so encrypted
    -- storage stays sparse and skip the encrypt call for empties.
    NEW.phone_encrypted := CASE
      WHEN NEW.phone IS NULL OR NEW.phone = '' THEN NULL
      ELSE pii.encrypt(NEW.phone)
    END;
    NEW.phone_fingerprint := pii.fingerprint(pii.normalize_phone(NEW.phone));
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.profiles_sync_pii_columns() FROM PUBLIC;

CREATE TRIGGER profiles_sync_pii_columns_trg
BEFORE INSERT OR UPDATE OF email, phone ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_sync_pii_columns();

-- Backfill existing rows. The SET list deliberately omits `email`
-- and `phone` themselves so the trigger above (BEFORE UPDATE OF
-- email, phone) does NOT fire and we do not pay the encrypt cost
-- twice per row.
UPDATE public.profiles
SET
  email_encrypted   = pii.encrypt(email),
  email_fingerprint = pii.fingerprint(pii.normalize_email(email)),
  phone_encrypted   = CASE
                        WHEN phone IS NULL OR phone = '' THEN NULL
                        ELSE pii.encrypt(phone)
                      END,
  phone_fingerprint = pii.fingerprint(pii.normalize_phone(phone));

-- Non-unique partial indexes on the fingerprints. UNIQUE is
-- deliberately omitted (see header). The partial WHERE keeps the
-- index small while empty phones are common.
CREATE INDEX idx_profiles_email_fingerprint
  ON public.profiles (email_fingerprint)
  WHERE email_fingerprint IS NOT NULL;

CREATE INDEX idx_profiles_phone_fingerprint
  ON public.profiles (phone_fingerprint)
  WHERE phone_fingerprint IS NOT NULL;
