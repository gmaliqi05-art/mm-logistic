/*
  # Optimize RLS Policies for Performance at Scale

  1. Problem
    - Current RLS policies re-evaluate auth.uid() and auth.jwt() for each row
    - This causes performance degradation at scale
    
  2. Solution
    - Replace auth.uid() with (select auth.uid())
    - Replace auth.jwt() with (select auth.jwt())
    - This evaluates the function once per query instead of once per row
    
  3. Tables Affected
    - chat_messages (chatmsg_update, chatmsg_delete, chatmsg_insert)
    - push_subscriptions (all user policies)
    - profiles (profiles_select_own, profiles_update_own)
    - support_tickets (user policies)
    - chat_rooms (all policies)
    - notifications (all policies)
    - chat_participants (chatpart_select, chatpart_delete)
    - document_recipients (user policies)
    - documents (user policies)
    - support_messages (user policies)
    
  4. Performance Impact
    - Dramatically improves query performance on large datasets
    - Reduces CPU usage for RLS policy evaluation
    - Better scalability for high-traffic tables
*/

-- ============================================================================
-- CHAT MESSAGES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS chatmsg_update ON public.chat_messages;
CREATE POLICY chatmsg_update ON public.chat_messages
  FOR UPDATE
  TO authenticated
  USING (sender_id = (select auth.uid()));

DROP POLICY IF EXISTS chatmsg_delete ON public.chat_messages;
CREATE POLICY chatmsg_delete ON public.chat_messages
  FOR DELETE
  TO authenticated
  USING (sender_id = (select auth.uid()));

DROP POLICY IF EXISTS chatmsg_insert ON public.chat_messages;
CREATE POLICY chatmsg_insert ON public.chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = (select auth.uid()));

-- ============================================================================
-- PUSH SUBSCRIPTIONS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can view own push subscriptions" ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can insert own push subscriptions" ON public.push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can update own push subscriptions" ON public.push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can delete own push subscriptions" ON public.push_subscriptions
  FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Super admins can view all push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Super admins can view all push subscriptions" ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'super_admin'
    )
  );

-- ============================================================================
-- PROFILES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = (select auth.uid()));

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = (select auth.uid()));

-- ============================================================================
-- SUPPORT TICKETS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own tickets" ON public.support_tickets;
CREATE POLICY "Users can view own tickets" ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can create tickets v2" ON public.support_tickets;
CREATE POLICY "Users can create tickets v2" ON public.support_tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users and admins can update tickets" ON public.support_tickets;
CREATE POLICY "Users and admins can update tickets" ON public.support_tickets
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (select auth.uid()) OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (select auth.uid()) AND role = 'super_admin'
    )
  );

-- ============================================================================
-- CHAT ROOMS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS chatrooms_select ON public.chat_rooms;
CREATE POLICY chatrooms_select ON public.chat_rooms
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chat_participants 
      WHERE room_id = chat_rooms.id 
      AND user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS chatrooms_insert ON public.chat_rooms;
CREATE POLICY chatrooms_insert ON public.chat_rooms
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = (select auth.uid()));

DROP POLICY IF EXISTS chatrooms_update ON public.chat_rooms;
CREATE POLICY chatrooms_update ON public.chat_rooms
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chat_participants 
      WHERE room_id = chat_rooms.id 
      AND user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS chatrooms_delete ON public.chat_rooms;
CREATE POLICY chatrooms_delete ON public.chat_rooms
  FOR DELETE
  TO authenticated
  USING (created_by = (select auth.uid()));

-- ============================================================================
-- NOTIFICATIONS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS notif_select ON public.notifications;
CREATE POLICY notif_select ON public.notifications
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS notif_insert ON public.notifications;
CREATE POLICY notif_insert ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS notif_update ON public.notifications;
CREATE POLICY notif_update ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS notif_delete ON public.notifications;
CREATE POLICY notif_delete ON public.notifications
  FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- CHAT PARTICIPANTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS chatpart_select ON public.chat_participants;
CREATE POLICY chatpart_select ON public.chat_participants
  FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid()) OR
    EXISTS (
      SELECT 1 FROM chat_participants cp2 
      WHERE cp2.room_id = chat_participants.room_id 
      AND cp2.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS chatpart_delete ON public.chat_participants;
CREATE POLICY chatpart_delete ON public.chat_participants
  FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- DOCUMENT RECIPIENTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Recipients can view their entries" ON public.document_recipients;
CREATE POLICY "Recipients can view their entries" ON public.document_recipients
  FOR SELECT
  TO authenticated
  USING (recipient_id = (select auth.uid()));

DROP POLICY IF EXISTS "Recipients can update own status" ON public.document_recipients;
CREATE POLICY "Recipients can update own status" ON public.document_recipients
  FOR UPDATE
  TO authenticated
  USING (recipient_id = (select auth.uid()))
  WITH CHECK (recipient_id = (select auth.uid()));

-- ============================================================================
-- DOCUMENTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view documents they sent" ON public.documents;
CREATE POLICY "Users can view documents they sent" ON public.documents
  FOR SELECT
  TO authenticated
  USING (sender_id = (select auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can insert documents" ON public.documents;
CREATE POLICY "Authenticated users can insert documents" ON public.documents
  FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = (select auth.uid()));

-- ============================================================================
-- SUPPORT MESSAGES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view messages for own tickets" ON public.support_messages;
CREATE POLICY "Users can view messages for own tickets" ON public.support_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM support_tickets 
      WHERE id = support_messages.ticket_id 
      AND user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create messages for own tickets" ON public.support_messages;
CREATE POLICY "Users can create messages for own tickets" ON public.support_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = (select auth.uid()) AND
    EXISTS (
      SELECT 1 FROM support_tickets 
      WHERE id = support_messages.ticket_id 
      AND user_id = (select auth.uid())
    )
  );
