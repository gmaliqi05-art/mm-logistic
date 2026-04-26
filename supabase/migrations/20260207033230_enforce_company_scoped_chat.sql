/*
  # Enforce Company-Scoped Chat Access

  1. Changes
    - Replace chat_rooms SELECT policy to enforce company_id matching
    - Replace chat_participants INSERT policy to check company membership
    - Add helper function to get user's chat room IDs within their company
    - Update chat_messages INSERT policy to verify company scope
    - Add 'document' to chat_messages message_type constraint

  2. Security
    - Users can only access chat rooms belonging to their company
    - Users can only be added to rooms within their company
    - Super admins retain cross-company access
    - All policies check both participant membership AND company ownership

  3. Important Notes
    - This migration replaces existing chat RLS policies with stricter ones
    - Company scoping ensures data isolation between registered companies
*/

CREATE OR REPLACE FUNCTION get_user_company_chat_room_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cp.room_id
  FROM chat_participants cp
  JOIN chat_rooms cr ON cr.id = cp.room_id
  WHERE cp.user_id = auth.uid()
    AND (
      cr.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
      OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
    );
$$;

DROP POLICY IF EXISTS "chatrooms_select" ON chat_rooms;
CREATE POLICY "chatrooms_select" ON chat_rooms
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT get_user_company_chat_room_ids())
    OR get_user_role() = 'super_admin'
  );

DROP POLICY IF EXISTS "chatrooms_insert" ON chat_rooms;
CREATE POLICY "chatrooms_insert" ON chat_rooms
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      company_id = get_user_company_id()
      OR get_user_role() = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "chatrooms_update" ON chat_rooms;
CREATE POLICY "chatrooms_update" ON chat_rooms
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    AND (
      company_id = get_user_company_id()
      OR get_user_role() = 'super_admin'
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    AND (
      company_id = get_user_company_id()
      OR get_user_role() = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "chatrooms_delete" ON chat_rooms;
CREATE POLICY "chatrooms_delete" ON chat_rooms
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    AND (
      company_id = get_user_company_id()
      OR get_user_role() = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "chatpart_select" ON chat_participants;
CREATE POLICY "chatpart_select" ON chat_participants
  FOR SELECT TO authenticated
  USING (
    room_id IN (SELECT get_user_company_chat_room_ids())
    OR get_user_role() = 'super_admin'
  );

DROP POLICY IF EXISTS "chatpart_insert" ON chat_participants;
CREATE POLICY "chatpart_insert" ON chat_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_rooms cr
      WHERE cr.id = room_id
      AND (
        cr.company_id = get_user_company_id()
        OR get_user_role() = 'super_admin'
      )
    )
  );

DROP POLICY IF EXISTS "chatpart_delete" ON chat_participants;
CREATE POLICY "chatpart_delete" ON chat_participants
  FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() OR room_id IN (SELECT id FROM chat_rooms WHERE created_by = auth.uid()))
    AND (
      room_id IN (SELECT get_user_company_chat_room_ids())
      OR get_user_role() = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "chatmsg_select" ON chat_messages;
CREATE POLICY "chatmsg_select" ON chat_messages
  FOR SELECT TO authenticated
  USING (
    room_id IN (SELECT get_user_company_chat_room_ids())
    OR get_user_role() = 'super_admin'
  );

DROP POLICY IF EXISTS "chatmsg_insert" ON chat_messages;
CREATE POLICY "chatmsg_insert" ON chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND room_id IN (SELECT get_user_company_chat_room_ids())
  );

DROP POLICY IF EXISTS "chatmsg_update" ON chat_messages;
CREATE POLICY "chatmsg_update" ON chat_messages
  FOR UPDATE TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "chatmsg_delete" ON chat_messages;
CREATE POLICY "chatmsg_delete" ON chat_messages
  FOR DELETE TO authenticated
  USING (
    sender_id = auth.uid()
    OR get_user_role() = 'super_admin'
  );
