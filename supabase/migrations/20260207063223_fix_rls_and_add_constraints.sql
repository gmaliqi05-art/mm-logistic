/*
  # Fix RLS Recursion and Add Missing Constraints

  This migration addresses critical issues found during the platform audit:

  1. RLS Recursion Fix
    - Replace direct subqueries in support/subscription table policies with SECURITY DEFINER functions
    - This prevents infinite recursion when profiles table RLS checks reference other tables
  
  2. New CHECK Constraints
    - documents.priority: ('normal', 'urgent')
    - document_recipients.status: ('sent', 'delivered', 'viewed', 'signed', 'completed')
    - support_tickets.status: ('open', 'in_progress', 'resolved', 'closed')
    - support_messages.sender_type: ('user', 'auto', 'admin')
    - company_subscriptions.status: ('trial', 'active', 'expired', 'cancelled')
    - payment_transactions.status: ('pending', 'completed', 'failed', 'refunded')
  
  3. New Indexes
    - chat_messages(created_at) for message ordering
    - chat_participants(room_id) for join performance
    - notifications(created_at) for ordering
    - documents(created_at) for time-based queries
    - stock_movements(company_id) for RLS filtering
  
  4. Cleanup
    - Remove orphaned duplicate policy on chat_messages
    - Drop unused get_user_chat_room_ids() function
*/

-- Helper function to check if user is super admin (uses SECURITY DEFINER)
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role = 'super_admin'
  )
$$;

-- =============================================
-- FIX RLS FOR support_faqs
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can read active FAQs" ON support_faqs;
DROP POLICY IF EXISTS "Super admins can insert FAQs" ON support_faqs;
DROP POLICY IF EXISTS "Super admins can update FAQs" ON support_faqs;
DROP POLICY IF EXISTS "Super admins can delete FAQs" ON support_faqs;

CREATE POLICY "Anyone can read active FAQs"
  ON support_faqs FOR SELECT
  USING (is_active = true);

CREATE POLICY "Super admins can insert FAQs"
  ON support_faqs FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "Super admins can update FAQs"
  ON support_faqs FOR UPDATE
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Super admins can delete FAQs"
  ON support_faqs FOR DELETE
  TO authenticated
  USING (is_super_admin());

-- =============================================
-- FIX RLS FOR support_tickets
-- =============================================
DROP POLICY IF EXISTS "Users can read own tickets" ON support_tickets;
DROP POLICY IF EXISTS "Users can create tickets" ON support_tickets;
DROP POLICY IF EXISTS "Super admins can update tickets" ON support_tickets;

CREATE POLICY "Users can view own tickets"
  ON support_tickets FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_super_admin());

CREATE POLICY "Users can create tickets"
  ON support_tickets FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users and admins can update tickets"
  ON support_tickets FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR is_super_admin())
  WITH CHECK (user_id = auth.uid() OR is_super_admin());

-- =============================================
-- FIX RLS FOR support_messages
-- =============================================
DROP POLICY IF EXISTS "Users can read own ticket messages" ON support_messages;
DROP POLICY IF EXISTS "Users can send messages to own tickets" ON support_messages;

CREATE POLICY "Users can view messages for own tickets"
  ON support_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM support_tickets 
      WHERE support_tickets.id = support_messages.ticket_id 
      AND (support_tickets.user_id = auth.uid() OR is_super_admin())
    )
  );

CREATE POLICY "Users can create messages for own tickets"
  ON support_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM support_tickets 
      WHERE support_tickets.id = ticket_id 
      AND (support_tickets.user_id = auth.uid() OR is_super_admin())
    )
  );

-- =============================================
-- FIX RLS FOR subscription_plans
-- =============================================
DROP POLICY IF EXISTS "Public can view active plans" ON subscription_plans;
DROP POLICY IF EXISTS "Super admins can insert plans" ON subscription_plans;
DROP POLICY IF EXISTS "Super admins can update plans" ON subscription_plans;

CREATE POLICY "Anyone can view active plans"
  ON subscription_plans FOR SELECT
  USING (is_active = true OR is_super_admin());

CREATE POLICY "Super admins can insert plans"
  ON subscription_plans FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "Super admins can update plans"
  ON subscription_plans FOR UPDATE
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- =============================================
-- ADD CHECK CONSTRAINTS
-- =============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'documents_priority_check'
  ) THEN
    ALTER TABLE documents ADD CONSTRAINT documents_priority_check 
      CHECK (priority IN ('normal', 'urgent'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'document_recipients_status_check'
  ) THEN
    ALTER TABLE document_recipients ADD CONSTRAINT document_recipients_status_check 
      CHECK (status IN ('sent', 'delivered', 'viewed', 'signed', 'completed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'support_tickets_status_check'
  ) THEN
    ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_status_check 
      CHECK (status IN ('open', 'in_progress', 'resolved', 'closed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'support_messages_sender_type_check'
  ) THEN
    ALTER TABLE support_messages ADD CONSTRAINT support_messages_sender_type_check 
      CHECK (sender_type IN ('user', 'auto', 'admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'company_subscriptions_status_check'
  ) THEN
    ALTER TABLE company_subscriptions ADD CONSTRAINT company_subscriptions_status_check 
      CHECK (status IN ('trial', 'active', 'expired', 'cancelled'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'payment_transactions_status_check'
  ) THEN
    ALTER TABLE payment_transactions ADD CONSTRAINT payment_transactions_status_check 
      CHECK (status IN ('pending', 'completed', 'failed', 'refunded'));
  END IF;
END $$;

-- =============================================
-- ADD UNIQUE CONSTRAINTS
-- =============================================

CREATE UNIQUE INDEX IF NOT EXISTS support_faqs_category_question_idx 
  ON support_faqs (category, question) WHERE is_active = true;

-- =============================================
-- ADD INDEXES FOR PERFORMANCE
-- =============================================

CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at 
  ON chat_messages (created_at);

CREATE INDEX IF NOT EXISTS idx_chat_participants_room_id 
  ON chat_participants (room_id);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at 
  ON notifications (created_at);

CREATE INDEX IF NOT EXISTS idx_documents_created_at 
  ON documents (created_at);

CREATE INDEX IF NOT EXISTS idx_stock_movements_company_id 
  ON stock_movements (company_id);

CREATE INDEX IF NOT EXISTS idx_delivery_notes_created_by 
  ON delivery_notes (created_by);

CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at 
  ON support_tickets (created_at);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id 
  ON support_messages (ticket_id);

-- =============================================
-- CLEANUP: Remove duplicate chat_messages policy
-- =============================================
DROP POLICY IF EXISTS "Users can soft-delete own messages" ON chat_messages;

-- =============================================
-- CLEANUP: Drop unused function
-- =============================================
DROP FUNCTION IF EXISTS get_user_chat_room_ids();
