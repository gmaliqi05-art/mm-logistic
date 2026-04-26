/*
  # Fix Chat RLS Infinite Recursion

  1. Problem
    - `chat_participants` SELECT policy references itself, causing infinite recursion
    - `chat_rooms` SELECT policy references `chat_participants`, which triggers the recursive policy
    - `chat_messages` SELECT policy also references `chat_participants`, same issue

  2. Solution
    - Create a SECURITY DEFINER function `get_user_chat_room_ids()` that bypasses RLS
    - Replace all self-referencing subqueries with calls to this function

  3. Security Changes
    - Drop and recreate SELECT policies for `chat_participants`, `chat_rooms`, `chat_messages`
    - Drop and recreate DELETE policy for `chat_participants` (also referenced `chat_rooms`)
    - All policies still enforce proper access control via the SECURITY DEFINER function
*/

CREATE OR REPLACE FUNCTION get_user_chat_room_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT room_id FROM chat_participants WHERE user_id = auth.uid();
$$;

DROP POLICY IF EXISTS "chatpart_select" ON chat_participants;
CREATE POLICY "chatpart_select"
  ON chat_participants
  FOR SELECT
  TO authenticated
  USING (
    room_id IN (SELECT get_user_chat_room_ids())
    OR get_user_role() = 'super_admin'
  );

DROP POLICY IF EXISTS "chatpart_delete" ON chat_participants;
CREATE POLICY "chatpart_delete"
  ON chat_participants
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR get_user_role() = 'super_admin'
    OR room_id IN (
      SELECT id FROM chat_rooms WHERE created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "chatrooms_select" ON chat_rooms;
CREATE POLICY "chatrooms_select"
  ON chat_rooms
  FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT get_user_chat_room_ids())
    OR get_user_role() = 'super_admin'
  );

DROP POLICY IF EXISTS "chatmsg_select" ON chat_messages;
CREATE POLICY "chatmsg_select"
  ON chat_messages
  FOR SELECT
  TO authenticated
  USING (
    room_id IN (SELECT get_user_chat_room_ids())
    OR get_user_role() = 'super_admin'
  );

DROP POLICY IF EXISTS "chatmsg_insert" ON chat_messages;
CREATE POLICY "chatmsg_insert"
  ON chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND room_id IN (SELECT get_user_chat_room_ids())
  );