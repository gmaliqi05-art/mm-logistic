/*
  # Rate limit buckets: explicit deny policies

  1. Security
    - Replace single SELECT "deny" policy with explicit deny policies for
      SELECT, INSERT, UPDATE, DELETE targeting both `anon` and `authenticated`.
    - `service_role` bypasses RLS so edge functions (`checkRateLimit`) keep
      full read/write access.
  2. Notes
    - Functional behavior unchanged — `anon`/`authenticated` had no access
      previously due to missing policies, this just makes intent explicit
      and addresses the "RLS enabled, no policy" audit warning cleanly.
*/

DROP POLICY IF EXISTS "rate_limit_buckets deny all" ON public.rate_limit_buckets;

CREATE POLICY "rate_limit_buckets deny select"
  ON public.rate_limit_buckets FOR SELECT
  TO anon, authenticated
  USING (false);

CREATE POLICY "rate_limit_buckets deny insert"
  ON public.rate_limit_buckets FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY "rate_limit_buckets deny update"
  ON public.rate_limit_buckets FOR UPDATE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "rate_limit_buckets deny delete"
  ON public.rate_limit_buckets FOR DELETE
  TO anon, authenticated
  USING (false);
