/*
  # Comprehensive Chat RLS Fix

  1. Root Cause
    - chatrooms_select policy only allows viewing rooms where user is already a participant
    - When creating a new room, user is NOT yet a participant
    - chatpart_insert policy checks EXISTS on chat_rooms, which is filtered by chatrooms_select
    - This creates a DEADLOCK: can't add participants because you're not a participant yet

  2. Changes
    - Fix chatrooms_select to also allow room CREATOR to see their own room
    - Recreate chatpart_insert with simpler, working logic
    - Make chat_rooms.company_id NULLABLE for super admin rooms
    - Add helper function is_chat_room_creator() as SECURITY DEFINER

  3. Security
    - Room creator can always see their own room
    - Room creator can add participants
    - Company members can see rooms they participate in
    - Super admins have full access
    - All policies remain restrictive and check authentication
*/

-- Helper function to check if user created a room (bypasses RLS)
CREATE OR REPLACE FUNCTION is_chat_room_creator(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_rooms
    WHERE id = p_room_id
    AND created_by = auth.uid()
  );
$$;

-- Make company_id nullable so super admin can create cross-company rooms
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_rooms' AND column_name = 'company_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE chat_rooms ALTER COLUMN company_id DROP NOT NULL;
  END IF;
END $$;

-- Fix chatrooms_select: allow room creator to see their own room
DROP POLICY IF EXISTS "chatrooms_select" ON chat_rooms;
CREATE POLICY "chatrooms_select"
  ON chat_rooms
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR id IN (SELECT get_user_company_chat_room_ids())
    OR get_user_role() = 'super_admin'
  );

-- Fix chatrooms_insert: allow super admin with null company_id
DROP POLICY IF EXISTS "chatrooms_insert" ON chat_rooms;
CREATE POLICY "chatrooms_insert"
  ON chat_rooms
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      company_id = get_user_company_id()
      OR get_user_role() = 'super_admin'
    )
  );

-- Fix chatrooms_update
DROP POLICY IF EXISTS "chatrooms_update" ON chat_rooms;
CREATE POLICY "chatrooms_update"
  ON chat_rooms
  FOR UPDATE
  TO authenticated
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

-- Fix chatrooms_delete
DROP POLICY IF EXISTS "chatrooms_delete" ON chat_rooms;
CREATE POLICY "chatrooms_delete"
  ON chat_rooms
  FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    AND (
      company_id = get_user_company_id()
      OR get_user_role() = 'super_admin'
    )
  );

-- Fix chatpart_insert: use SECURITY DEFINER helper to bypass chatrooms_select RLS
DROP POLICY IF EXISTS "chatpart_insert" ON chat_participants;
CREATE POLICY "chatpart_insert"
  ON chat_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_chat_room_creator(room_id)
    OR get_user_role() = 'super_admin'
  );

-- Fix chatpart_select: also allow if user is in room (direct check without recursion)
DROP POLICY IF EXISTS "chatpart_select" ON chat_participants;
CREATE POLICY "chatpart_select"
  ON chat_participants
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR room_id IN (SELECT get_user_company_chat_room_ids())
    OR get_user_role() = 'super_admin'
  );

-- Fix chatpart_delete
DROP POLICY IF EXISTS "chatpart_delete" ON chat_participants;
CREATE POLICY "chatpart_delete"
  ON chat_participants
  FOR DELETE
  TO authenticated
  USING (
    (
      user_id = auth.uid()
      OR is_chat_room_creator(room_id)
    )
    AND (
      room_id IN (SELECT get_user_company_chat_room_ids())
      OR get_user_role() = 'super_admin'
    )
  );

-- Fix chatmsg_insert: also check room creator or use helper
DROP POLICY IF EXISTS "chatmsg_insert" ON chat_messages;
CREATE POLICY "chatmsg_insert"
  ON chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      room_id IN (SELECT get_user_company_chat_room_ids())
      OR get_user_role() = 'super_admin'
    )
  );

-- Fix chatmsg_select
DROP POLICY IF EXISTS "chatmsg_select" ON chat_messages;
CREATE POLICY "chatmsg_select"
  ON chat_messages
  FOR SELECT
  TO authenticated
  USING (
    room_id IN (SELECT get_user_company_chat_room_ids())
    OR get_user_role() = 'super_admin'
  );

-- chatmsg_update and chatmsg_delete remain unchanged (already correct)
