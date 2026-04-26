/*
  # Fix chat_participants INSERT policy

  1. Changes
    - Drop existing restrictive INSERT policy
    - Create new policy that allows room creator to add participants
    - Verify participants are from same company as the room
  
  2. Security
    - Only room creator can add participants
    - All participants must be from the same company as the room
    - Super admins can add anyone
*/

DROP POLICY IF EXISTS "chatpart_insert" ON chat_participants;

CREATE POLICY "chatpart_insert"
  ON chat_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM chat_rooms cr
      JOIN profiles p ON p.id = chat_participants.user_id
      WHERE cr.id = chat_participants.room_id
      AND (
        -- Creator can add participants
        (cr.created_by = auth.uid() AND (
          cr.company_id = p.company_id OR 
          (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
        ))
        OR
        -- Super admin can add anyone
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
      )
    )
  );
