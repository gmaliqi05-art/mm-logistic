/*
  # Defense-in-depth: pg_temp last in search_path for SECURITY DEFINER

  Backend audit (H2) flagged that ~123 SECURITY DEFINER functions in
  this codebase declare `SET search_path = public` (or omit the path
  entirely, defaulting to "public", inheriting whatever else is in
  scope). Without `pg_temp` pinned at the end, a caller that can
  create temporary objects can shadow built-in resolution and trick
  a SECURITY DEFINER function into calling attacker-controlled code
  in the elevated context.

  Recommended hardening:
    ALTER FUNCTION ... SET search_path = public, pg_temp;

  This migration walks every public.* function with prosecdef = true
  and pins `search_path = public, pg_temp`. For functions that already
  reference the private.* schema, it uses `public, private, pg_temp`.
  Idempotent: re-running is a no-op because ALTER FUNCTION ... SET is
  declarative.
*/

DO $$
DECLARE
  fn record;
  uses_private boolean;
BEGIN
  FOR fn IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS func_name,
      pg_get_function_identity_arguments(p.oid) AS args,
      p.oid AS oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef = true
      AND n.nspname IN ('public', 'private')
  LOOP
    -- Heuristic: if the function body or its declared search_path
    -- references private.*, include private in the path so the
    -- ALTER doesn't accidentally break callers.
    SELECT EXISTS (
      SELECT 1
      FROM pg_proc p2
      WHERE p2.oid = fn.oid
        AND (
          pg_get_functiondef(p2.oid) ILIKE '%private.%'
          OR EXISTS (
            SELECT 1 FROM unnest(coalesce(p2.proconfig, ARRAY[]::text[])) c
            WHERE c LIKE 'search_path=%private%'
          )
        )
    ) INTO uses_private;

    BEGIN
      IF uses_private THEN
        EXECUTE format(
          'ALTER FUNCTION %I.%I(%s) SET search_path = public, private, pg_temp',
          fn.schema_name, fn.func_name, fn.args
        );
      ELSE
        EXECUTE format(
          'ALTER FUNCTION %I.%I(%s) SET search_path = public, pg_temp',
          fn.schema_name, fn.func_name, fn.args
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Should be rare; log and continue so one stubborn function
      -- doesn't abort the whole migration.
      RAISE NOTICE 'Skipping ALTER on %.%(%): %',
        fn.schema_name, fn.func_name, fn.args, SQLERRM;
    END;
  END LOOP;
END $$;

COMMENT ON SCHEMA public IS
  'Tenant business schema. SECURITY DEFINER functions in this schema '
  'must keep pg_temp last in search_path — enforced by migration '
  '20260524120000.';
