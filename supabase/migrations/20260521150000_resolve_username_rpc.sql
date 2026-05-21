/*
  # Public RPC: resolve_username_to_email

  Login flow for workers without an email. The frontend takes whatever
  the user typed in the "email" field; if it has no '@', it calls this
  RPC to translate the username into the synthetic email stored against
  that profile, then calls Supabase Auth's signInWithPassword with the
  resolved email.

  The function is SECURITY DEFINER and callable by anon (login is
  pre-auth). It returns NULL when:
    - input is too short
    - no profile matches the username
    - the matching profile has no synthetic email or is inactive

  No information about other users is leaked — only a yes/no by-result
  on the supplied username.

  Per-company uniqueness is enforced by the unique index added in
  20260521140000. If two companies still managed to register the same
  username on inactive rows, we accept the first match deterministically.
*/

CREATE OR REPLACE FUNCTION public.resolve_username_to_email(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_email text;
BEGIN
  IF p_username IS NULL OR length(p_username) < 3 THEN
    RETURN NULL;
  END IF;
  SELECT email INTO v_email FROM profiles
  WHERE lower(username) = lower(p_username)
    AND email IS NOT NULL
    AND is_active = true
  LIMIT 1;
  RETURN v_email;
END $$;

REVOKE EXECUTE ON FUNCTION public.resolve_username_to_email(text) FROM public;
GRANT  EXECUTE ON FUNCTION public.resolve_username_to_email(text) TO anon, authenticated;
