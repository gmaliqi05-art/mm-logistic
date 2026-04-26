/*
  # Enable Realtime for Chat Messages

  1. Problem
    - chat_messages table is not in the supabase_realtime publication
    - Real-time subscriptions for new messages never fire
    - Messages sent by users don't appear without a page refresh

  2. Solution
    - Add chat_messages table to the supabase_realtime publication
    - This enables postgres_changes events for INSERT/UPDATE/DELETE on chat_messages

  3. Notes
    - Only chat_messages needs realtime (for instant message delivery)
    - RLS policies still apply to realtime subscriptions
*/

ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;