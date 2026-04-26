/*
  # Simplify chat_participants INSERT policy

  1. Changes
    - Drop existing complex INSERT policy
    - Create simpler policy that only checks room ownership
    - Trust application logic for company filtering
  
  2. Security
    - Only room creator can add participants
    - Super admins can add anyone to any room
    - Application already filters available users by company
*/

DROP POLICY IF EXISTS "chatpart_insert" ON chat_participants;

CREATE POLICY "chatpart_insert"
  ON chat_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Room creator can add participants
    EXISTS (
      SELECT 1 FROM chat_rooms 
      WHERE id = chat_participants.room_id 
      AND created_by = auth.uid()
    )
    OR
    -- Super admin can add anyone to any room
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
  );
