/*
  # Fix infinite recursion on chat_participants RLS

  1. Problem
    - The current `chatpart_select` policy on `chat_participants` contains a
      subquery that reads from `chat_participants` itself. Postgres re-applies
      the policy to that subquery, causing infinite recursion (error 42P17).
    - This breaks every chat request because the app queries chat_participants
      to resolve room membership.

  2. Fix
    - Add a SECURITY DEFINER helper `is_chat_room_member(room_id, user_id)`
      that reads chat_participants without triggering RLS.
    - Replace the recursive SELECT policy with one that uses the helper.

  3. Security
    - The helper is SECURITY DEFINER and locked to the public schema
      search_path. It only returns a boolean and does not leak rows.
    - The new policy still restricts reads to participants of the same room
      or super admins. Users can always read their own participant row.
*/

CREATE OR REPLACE FUNCTION public.is_chat_room_member(p_room_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participants
    WHERE room_id = p_room_id AND user_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_chat_room_member(uuid, uuid) TO authenticated, anon, service_role;

DROP POLICY IF EXISTS "chatpart_select" ON public.chat_participants;

CREATE POLICY "chatpart_select"
  ON public.chat_participants
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_chat_room_member(room_id, (SELECT auth.uid()))
    OR public.get_user_role() = 'super_admin'
  );
