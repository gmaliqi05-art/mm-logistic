/*
  # Fix Foreign Keys to Point to Profiles

  1. Changes
    - Drop FKs that point to auth.users for user-related columns
    - Recreate them to point to profiles table instead
    - This allows PostgREST to resolve joins between tables and profiles

  2. Affected Tables
    - companies.created_by
    - depots.manager_id
    - delivery_notes.created_by
    - delivery_notes.assigned_driver_id
    - chat_messages.sender_id
    - chat_participants.user_id
    - chat_rooms.created_by
    - notifications.user_id
    - stock_movements.performed_by
*/

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_created_by_fkey;
ALTER TABLE companies ADD CONSTRAINT companies_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE depots DROP CONSTRAINT IF EXISTS depots_manager_id_fkey;
ALTER TABLE depots ADD CONSTRAINT depots_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES profiles(id);

ALTER TABLE delivery_notes DROP CONSTRAINT IF EXISTS delivery_notes_created_by_fkey;
ALTER TABLE delivery_notes ADD CONSTRAINT delivery_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE delivery_notes DROP CONSTRAINT IF EXISTS delivery_notes_assigned_driver_id_fkey;
ALTER TABLE delivery_notes ADD CONSTRAINT delivery_notes_assigned_driver_id_fkey FOREIGN KEY (assigned_driver_id) REFERENCES profiles(id);

ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_sender_id_fkey;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id);

ALTER TABLE chat_participants DROP CONSTRAINT IF EXISTS chat_participants_user_id_fkey;
ALTER TABLE chat_participants ADD CONSTRAINT chat_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id);

ALTER TABLE chat_rooms DROP CONSTRAINT IF EXISTS chat_rooms_created_by_fkey;
ALTER TABLE chat_rooms ADD CONSTRAINT chat_rooms_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_performed_by_fkey;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES profiles(id);
