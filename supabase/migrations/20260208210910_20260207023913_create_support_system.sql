/*
  # Create Support System

  1. New Tables
    - `support_faqs`
      - `id` (uuid, primary key)
      - `category` (text) - category grouping for the FAQ
      - `question` (text) - the question text
      - `answer` (text) - the auto-response answer
      - `keywords` (text[]) - array of keywords for matching
      - `priority` (int) - display/match priority (higher = more important)
      - `is_active` (boolean) - whether this FAQ is active
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `support_tickets`
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK to profiles) - the user who opened the ticket
      - `subject` (text) - auto-generated subject from first message
      - `status` (text) - open, in_progress, resolved, closed
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `support_messages`
      - `id` (uuid, primary key)
      - `ticket_id` (uuid, FK to support_tickets)
      - `sender_type` (text) - user, auto, admin
      - `sender_id` (uuid, nullable) - user or admin who sent
      - `message` (text)
      - `faq_id` (uuid, nullable, FK to support_faqs) - linked FAQ if auto-response
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Users can read their own tickets and messages
    - Users can create tickets and send messages
    - Super admins can read/update all tickets and messages
    - All authenticated users can read active FAQs
*/

CREATE TABLE IF NOT EXISTS support_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT '',
  question text NOT NULL,
  answer text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  priority int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id),
  subject text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id),
  sender_type text NOT NULL DEFAULT 'user',
  sender_id uuid REFERENCES profiles(id),
  message text NOT NULL,
  faq_id uuid REFERENCES support_faqs(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_faqs_category ON support_faqs(category);
CREATE INDEX IF NOT EXISTS idx_support_faqs_active ON support_faqs(is_active);
CREATE INDEX IF NOT EXISTS idx_support_faqs_keywords ON support_faqs USING gin(keywords);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id);

ALTER TABLE support_faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read active FAQs"
  ON support_faqs FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Super admins can insert FAQs"
  ON support_faqs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can update FAQs"
  ON support_faqs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can delete FAQs"
  ON support_faqs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Users can read own tickets"
  ON support_tickets FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Users can create tickets"
  ON support_tickets FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Super admins can update tickets"
  ON support_tickets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Users can read own ticket messages"
  ON support_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM support_tickets
      WHERE support_tickets.id = support_messages.ticket_id
      AND (
        support_tickets.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'super_admin'
        )
      )
    )
  );

CREATE POLICY "Users can send messages to own tickets"
  ON support_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM support_tickets
      WHERE support_tickets.id = support_messages.ticket_id
      AND (
        support_tickets.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'super_admin'
        )
      )
    )
  );