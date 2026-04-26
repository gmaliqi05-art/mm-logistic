/*
  # Add Missing Foreign Keys

  1. Changes
    - Add FK from `profiles.id` to `auth.users.id`
    - Add FK from `companies.created_by` to `profiles.id`
    - Add FK from `depots.manager_id` to `profiles.id`
    - Add FK from `delivery_notes.created_by` to `profiles.id`
    - Add FK from `delivery_notes.assigned_driver_id` to `profiles.id`
    - Add FK from `chat_messages.sender_id` to `profiles.id`
    - Add FK from `chat_participants.user_id` to `profiles.id`
    - Add FK from `chat_rooms.created_by` to `profiles.id`
    - Add FK from `notifications.user_id` to `profiles.id`
    - Add FK from `stock_movements.performed_by` to `profiles.id`

  2. Notes
    - These FKs are needed for PostgREST to resolve relationships in queries
    - Using IF NOT EXISTS pattern via DO blocks to avoid errors on re-run
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'profiles_id_fkey' AND table_name = 'profiles') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'companies_created_by_fkey' AND table_name = 'companies') THEN
    ALTER TABLE companies ADD CONSTRAINT companies_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'depots_manager_id_fkey' AND table_name = 'depots') THEN
    ALTER TABLE depots ADD CONSTRAINT depots_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES profiles(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'delivery_notes_created_by_fkey' AND table_name = 'delivery_notes') THEN
    ALTER TABLE delivery_notes ADD CONSTRAINT delivery_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'delivery_notes_assigned_driver_id_fkey' AND table_name = 'delivery_notes') THEN
    ALTER TABLE delivery_notes ADD CONSTRAINT delivery_notes_assigned_driver_id_fkey FOREIGN KEY (assigned_driver_id) REFERENCES profiles(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chat_messages_sender_id_fkey' AND table_name = 'chat_messages') THEN
    ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chat_participants_user_id_fkey' AND table_name = 'chat_participants') THEN
    ALTER TABLE chat_participants ADD CONSTRAINT chat_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chat_rooms_created_by_fkey' AND table_name = 'chat_rooms') THEN
    ALTER TABLE chat_rooms ADD CONSTRAINT chat_rooms_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'notifications_user_id_fkey' AND table_name = 'notifications') THEN
    ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'stock_movements_performed_by_fkey' AND table_name = 'stock_movements') THEN
    ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES profiles(id);
  END IF;
END $$;