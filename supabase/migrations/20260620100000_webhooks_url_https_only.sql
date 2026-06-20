/*
  # K16 — webhooks.url must be https://

  Defense-in-depth alongside the runtime SSRF guard in
  `supabase/functions/_shared/safeFetch.ts`. Without a DB constraint,
  a future RPC, edge function, or service-role-bypass admin tool could
  re-introduce a plain `http://10.0.0.5/` row that the dispatcher would
  refuse — but at insert time we want the failure to happen earlier and
  louder, before any cron tick.

  Two checks:
    1. URL must start with `https://`.
    2. URL must not contain whitespace or newline characters (defeats
       trivial CRLF / header smuggling attempts via `webhooks.url`).

  No data migration required — prod has been audited (0 rows violate).
  Constraints are added NOT VALID then VALIDATEd so the operation is
  cheap on the live table; if a future row would violate, the upsert
  fails with a clear constraint name.
*/

DO $$
BEGIN
  -- 1. https-only scheme
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'webhooks_url_https_only'
      AND conrelid = 'public.webhooks'::regclass
  ) THEN
    ALTER TABLE public.webhooks
      ADD CONSTRAINT webhooks_url_https_only
      CHECK (url ~ '^https://[^\s]+$')
      NOT VALID;

    ALTER TABLE public.webhooks
      VALIDATE CONSTRAINT webhooks_url_https_only;
  END IF;
END $$;

COMMENT ON CONSTRAINT webhooks_url_https_only ON public.webhooks IS
  'K16: must be https:// URL with no whitespace. SSRF / header-smuggling defense-in-depth alongside safeFetch.ts.';
