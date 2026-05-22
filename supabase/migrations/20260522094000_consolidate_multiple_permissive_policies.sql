-- 20260522094000 — consolidate multiple permissive RLS policies into one
-- per (table, role, action).
--
-- Supabase performance advisor (multiple_permissive_policies) flagged 44
-- (table, cmd, role) triples that have 2-3 permissive policies. Postgres
-- evaluates each one per row; collapsing them into a single policy whose
-- USING / WITH CHECK is the OR of the originals is identical in behaviour
-- but cheaper to plan.
--
-- Method: a DO block reads pg_policies for every (tablename, cmd, roles)
-- group with count >= 2, builds the OR-combined expression, DROPs each
-- source policy, and CREATEs one combined policy named
-- "<table>_<cmd>_combined".
--
-- Safety:
--   - permissive flag preserved (always PERMISSIVE in this batch).
--   - roles preserved (all groups today are {authenticated}; the block
--     hardcodes that and skips any group whose role list differs).
--   - If any qual is NULL the combined USING becomes `true` (which is what
--     pg_policies already means when a policy omits USING); same for
--     with_check on INSERT/UPDATE/ALL.
--   - Whole migration runs in one transaction — any failure rolls back.

DO $$
DECLARE
  r record;
  v_combined_using text;
  v_combined_check text;
  v_new_name text;
  v_create_sql text;
  v_pol text;
BEGIN
  FOR r IN
    SELECT
      tablename,
      cmd::text AS cmd_text,
      roles::text AS roles_text,
      array_agg(policyname ORDER BY policyname) AS policies,
      array_agg(qual ORDER BY policyname) AS quals,
      array_agg(with_check ORDER BY policyname) AS checks
    FROM pg_policies
    WHERE schemaname='public' AND permissive='PERMISSIVE'
    GROUP BY tablename, cmd, roles
    HAVING count(*) >= 2
  LOOP
    -- Only consolidate groups whose role list is exactly {authenticated}.
    -- Any other role layout is left untouched (safer than guessing).
    IF r.roles_text <> '{authenticated}' THEN
      RAISE NOTICE 'SKIP %.% — non-default roles %', r.tablename, r.cmd_text, r.roles_text;
      CONTINUE;
    END IF;

    v_new_name := r.tablename || '_' || lower(r.cmd_text) || '_combined';

    -- Combined USING (SELECT / UPDATE / DELETE / ALL)
    v_combined_using := NULL;
    IF r.cmd_text IN ('SELECT', 'UPDATE', 'DELETE', 'ALL') THEN
      IF EXISTS (SELECT 1 FROM unnest(r.quals) q WHERE q IS NULL) THEN
        v_combined_using := 'true';
      ELSE
        SELECT '(' || string_agg(q, ') OR (') || ')'
        INTO v_combined_using
        FROM unnest(r.quals) q;
      END IF;
    END IF;

    -- Combined WITH CHECK (INSERT / UPDATE / ALL)
    v_combined_check := NULL;
    IF r.cmd_text IN ('INSERT', 'UPDATE', 'ALL') THEN
      IF EXISTS (SELECT 1 FROM unnest(r.checks) c WHERE c IS NULL) THEN
        v_combined_check := 'true';
      ELSE
        SELECT '(' || string_agg(c, ') OR (') || ')'
        INTO v_combined_check
        FROM unnest(r.checks) c;
      END IF;
    END IF;

    -- Drop every source policy
    FOREACH v_pol IN ARRAY r.policies LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_pol, r.tablename);
    END LOOP;

    -- Recreate as a single combined policy
    IF v_combined_using IS NOT NULL AND v_combined_check IS NOT NULL THEN
      v_create_sql := format(
        'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR %s TO authenticated USING (%s) WITH CHECK (%s)',
        v_new_name, r.tablename, r.cmd_text, v_combined_using, v_combined_check
      );
    ELSIF v_combined_using IS NOT NULL THEN
      v_create_sql := format(
        'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR %s TO authenticated USING (%s)',
        v_new_name, r.tablename, r.cmd_text, v_combined_using
      );
    ELSIF v_combined_check IS NOT NULL THEN
      v_create_sql := format(
        'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR %s TO authenticated WITH CHECK (%s)',
        v_new_name, r.tablename, r.cmd_text, v_combined_check
      );
    ELSE
      RAISE NOTICE 'SKIP %.% — no expression to consolidate', r.tablename, r.cmd_text;
      CONTINUE;
    END IF;

    EXECUTE v_create_sql;

    RAISE NOTICE 'OK  %.% (%s) → %s consolidated from %s policies',
      r.tablename, r.cmd_text, r.cmd_text, v_new_name, array_length(r.policies, 1);
  END LOOP;
END $$;

-- Post-migration sanity: number of groups still having multiple permissive
-- policies should be 0 (or only the few skipped for non-default roles).
DO $$
DECLARE
  v_remaining int;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM (
    SELECT tablename, cmd, roles
    FROM pg_policies
    WHERE schemaname='public' AND permissive='PERMISSIVE'
    GROUP BY tablename, cmd, roles
    HAVING count(*) >= 2
  ) g;
  RAISE NOTICE 'multiple_permissive groups remaining: %', v_remaining;
END $$;
