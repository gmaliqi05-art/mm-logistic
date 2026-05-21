/*
  # Username-based login for workers without email

  Reparature depot_workers (and any other worker the company doesn't want
  to expose to email-based auth) need a way to log in with just a
  username + password. Supabase Auth requires an email under the hood,
  so we use a synthetic email scheme:

      <company_id>-<username>@workers.local

  built and resolved by the frontend / edge function. The username is
  what the worker actually types on the login page; the synthetic email
  is never shown to humans.

  This migration:
    1. Adds `profiles.username` (text, nullable). Unique per company —
       two companies can both have a "agimi" username because their
       synthetic emails differ via `company_id`.
    2. Adds an index for fast username lookups on login.
*/

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_profiles_company_username
  ON public.profiles(company_id, lower(username))
  WHERE username IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_username_lookup
  ON public.profiles(lower(username))
  WHERE username IS NOT NULL;
