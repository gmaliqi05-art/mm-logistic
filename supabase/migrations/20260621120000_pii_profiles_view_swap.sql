/*
  # Profiles transparent decryption view (Faza 2b)

  Phase 2b of the per-table PII rollout. Swaps the read path of
  public.profiles onto a SECURITY INVOKER view that materializes email
  and phone from the encrypted-at-rest shadow columns added in Phase
  2a, while transparently translating writes back to the underlying
  table through INSTEAD OF triggers.

  After this migration:

    SELECT email, phone FROM public.profiles WHERE id = ...;
      -> hits the view
      -> view runs as caller (security_invoker)
      -> RLS on profiles_private filters rows
      -> pii.decrypt(email_encrypted) / pii.decrypt(phone_encrypted)
         materialize the columns
      -> caller gets the same row shape it saw before Phase 2

    INSERT INTO public.profiles (email, phone, ...) VALUES (...);
      -> INSTEAD OF INSERT trigger forwards to profiles_private
      -> profiles_sync_pii_columns_trg (Phase 2a) encrypts the
         plaintext into the shadow columns
      -> both plaintext AND ciphertext now stored

  ## What this PR deliberately keeps

  - Plaintext profiles_private.email / .phone columns. They remain
    the source of truth for the BEFORE INSERT/UPDATE sync trigger
    from Phase 2a. A future Phase 2c migration will drop them and
    rewire the sync trigger to read from the INSTEAD OF inputs
    directly.
  - All existing RLS policies on profiles_private (the rename
    preserves them).
  - All existing triggers on profiles_private (Phase 2a sync trigger,
    audit, lock, privilege-escalation guard).
  - All 80+ FK constraints that point at profiles(id) - Postgres
    re-points them at profiles_private(id) automatically because they
    reference the relation OID, not the name.
  - All 67 frontend + 43 edge-function call sites that issue
    .from('profiles') queries. They keep working unchanged.

  ## Risk surface evaluated before writing this migration

  - `ON CONFLICT` / `upsert` on profiles: NONE in src/ or
    supabase/functions/ (greppped). INSTEAD OF triggers do not
    support ON CONFLICT, so this would have been a blocker.
  - SECURITY DEFINER helpers (`private.get_user_role`,
    `private.get_user_company_id`) reference `profiles` by name and
    will now hit the view. They only project `role` / `company_id`
    (neither encrypted), so pii.decrypt is never invoked in their
    code path and they continue to work as superuser-owned definer
    functions.
  - Edge functions that write to profiles all run as service_role
    (manage-users, register-company, seed-demo-users,
    create-demo-accountant). service_role has BYPASSRLS and the
    INSTEAD OF triggers are SECURITY INVOKER so RLS continues to be
    bypassed correctly for them.

  ## Audit-log entity_type rename

  `trg_audit_profiles` writes `TG_TABLE_NAME` (now `profiles_private`)
  into audit_logs.entity_type. Pre-existing rows still say `profiles`;
  new rows say `profiles_private`. The only consumer in the codebase
  is `src/pages/company/Dashboard.tsx` which projects the column but
  does NOT filter on it, so there is no current breakage. Future
  reports that want to query "all profile changes" should use
  `entity_type IN ('profiles', 'profiles_private')`. A dedicated audit
  override could replace TG_TABLE_NAME with a fixed literal, but that
  would need to touch the shared `audit_row_changes()` trigger
  function used by every audited table - out of scope here.

  ## Grant on pii.decrypt

  Phase 1 granted pii.decrypt EXECUTE only to service_role. A
  SECURITY INVOKER view that calls pii.decrypt needs the CALLER to
  have EXECUTE, otherwise authenticated users get permission denied
  when selecting from the view. Granting EXECUTE to authenticated
  does not weaken the security model in any meaningful way:
  pii.decrypt requires ciphertext input, and ciphertext is only
  reachable through tables/views that already gate access via RLS.
  An attacker with arbitrary SQL execution can already bypass the
  function grant by reading the Vault secret directly with their
  privileged context. RLS, not function grants, is the access
  boundary that matters.
*/

ALTER TABLE public.profiles RENAME TO profiles_private;

GRANT EXECUTE ON FUNCTION pii.decrypt(bytea) TO authenticated;
COMMENT ON FUNCTION pii.decrypt(bytea) IS
  'pgp_sym_decrypt counterpart of pii.encrypt. Granted to authenticated AND service_role: SECURITY INVOKER views that surface decrypted PII (public.profiles, future companies/partners/clients) need the CALLER to have EXECUTE. The real access boundary is RLS on the underlying tables; this grant alone does not yield plaintext.';

CREATE VIEW public.profiles
WITH (security_invoker = true)
AS SELECT
  id,
  pii.decrypt(email_encrypted) AS email,
  full_name,
  role,
  company_id,
  depot_id,
  pii.decrypt(phone_encrypted) AS phone,
  avatar_url,
  is_active,
  created_at,
  worker_category,
  locale,
  shift_end_hour,
  shift_start_hour,
  shift_timezone,
  tracking_last_confirmed_at,
  auto_tracking_enabled,
  base_address,
  base_lat,
  base_lng,
  residency_status,
  deletion_requested_at,
  deletion_scheduled_for,
  username
FROM public.profiles_private;

COMMENT ON VIEW public.profiles IS
  'Public face of profiles_private. Returns email/phone decrypted via pii.decrypt() over the Phase 2a shadow columns. SECURITY INVOKER + INSTEAD OF triggers translate writes back to profiles_private; existing RLS policies on profiles_private continue to gate access.';

-- Defaults mirror the underlying table so INSERTs that omit columns
-- continue to land sensible values. Postgres applies these BEFORE the
-- INSTEAD OF INSERT trigger sees NEW.
ALTER VIEW public.profiles ALTER COLUMN full_name             SET DEFAULT ''::text;
ALTER VIEW public.profiles ALTER COLUMN role                  SET DEFAULT 'driver'::text;
ALTER VIEW public.profiles ALTER COLUMN phone                 SET DEFAULT ''::text;
ALTER VIEW public.profiles ALTER COLUMN avatar_url            SET DEFAULT ''::text;
ALTER VIEW public.profiles ALTER COLUMN is_active             SET DEFAULT true;
ALTER VIEW public.profiles ALTER COLUMN created_at            SET DEFAULT now();
ALTER VIEW public.profiles ALTER COLUMN locale                SET DEFAULT 'sq'::text;
ALTER VIEW public.profiles ALTER COLUMN shift_end_hour        SET DEFAULT 17;
ALTER VIEW public.profiles ALTER COLUMN shift_start_hour      SET DEFAULT 7;
ALTER VIEW public.profiles ALTER COLUMN shift_timezone        SET DEFAULT 'Europe/Berlin'::text;
ALTER VIEW public.profiles ALTER COLUMN auto_tracking_enabled SET DEFAULT false;
ALTER VIEW public.profiles ALTER COLUMN residency_status      SET DEFAULT 'citizen'::text;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO anon, authenticated, service_role;

-- INSTEAD OF triggers. All three run SECURITY INVOKER so the writes
-- against profiles_private are evaluated against the original
-- caller's role - RLS policies on profiles_private continue to gate
-- them exactly as they did when callers hit the table directly.

CREATE OR REPLACE FUNCTION public.profiles_view_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles_private (
    id, email, full_name, role, company_id, depot_id, phone, avatar_url,
    is_active, created_at, worker_category, locale, shift_end_hour,
    shift_start_hour, shift_timezone, tracking_last_confirmed_at,
    auto_tracking_enabled, base_address, base_lat, base_lng,
    residency_status, deletion_requested_at, deletion_scheduled_for, username
  ) VALUES (
    NEW.id, NEW.email, NEW.full_name, NEW.role, NEW.company_id, NEW.depot_id,
    NEW.phone, NEW.avatar_url, NEW.is_active, NEW.created_at,
    NEW.worker_category, NEW.locale, NEW.shift_end_hour, NEW.shift_start_hour,
    NEW.shift_timezone, NEW.tracking_last_confirmed_at, NEW.auto_tracking_enabled,
    NEW.base_address, NEW.base_lat, NEW.base_lng, NEW.residency_status,
    NEW.deletion_requested_at, NEW.deletion_scheduled_for, NEW.username
  );
  -- Returning NEW makes PostgREST's RETURNING work correctly: the
  -- inserted row (with view-computed columns) is round-tripped to
  -- the client.
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.profiles_view_insert() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.profiles_view_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- NEW carries every column - those the caller did not touch arrive
  -- with their OLD value, so this full-row UPDATE is effectively a
  -- partial update from the lock/audit trigger's IS DISTINCT FROM
  -- perspective.
  UPDATE public.profiles_private SET
    -- id deliberately omitted: PK; would violate every FK targeting
    -- profiles(id).
    email                      = NEW.email,
    full_name                  = NEW.full_name,
    role                       = NEW.role,
    company_id                 = NEW.company_id,
    depot_id                   = NEW.depot_id,
    phone                      = NEW.phone,
    avatar_url                 = NEW.avatar_url,
    is_active                  = NEW.is_active,
    -- created_at deliberately omitted: conceptually immutable. A
    -- super_admin or backfill job that needs to rewrite it can hit
    -- profiles_private directly via service_role.
    worker_category            = NEW.worker_category,
    locale                     = NEW.locale,
    shift_end_hour             = NEW.shift_end_hour,
    shift_start_hour           = NEW.shift_start_hour,
    shift_timezone             = NEW.shift_timezone,
    tracking_last_confirmed_at = NEW.tracking_last_confirmed_at,
    auto_tracking_enabled      = NEW.auto_tracking_enabled,
    base_address               = NEW.base_address,
    base_lat                   = NEW.base_lat,
    base_lng                   = NEW.base_lng,
    residency_status           = NEW.residency_status,
    deletion_requested_at      = NEW.deletion_requested_at,
    deletion_scheduled_for     = NEW.deletion_scheduled_for,
    username                   = NEW.username
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.profiles_view_update() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.profiles_view_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.profiles_private WHERE id = OLD.id;
  RETURN OLD;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.profiles_view_delete() FROM PUBLIC;

CREATE TRIGGER profiles_view_insert_trg
INSTEAD OF INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_view_insert();

CREATE TRIGGER profiles_view_update_trg
INSTEAD OF UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_view_update();

CREATE TRIGGER profiles_view_delete_trg
INSTEAD OF DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_view_delete();
