/*
  # Create Subscription System

  1. New Tables
    - `subscription_plans`
      - `id` (uuid, primary key)
      - `name` (text, unique) - internal name: free_trial, standard, premium
      - `display_name` (text) - shown to users
      - `description` (text)
      - `price_monthly` (numeric) - monthly price in EUR
      - `trial_days` (integer) - days for free trial
      - `max_drivers` (integer) - max drivers allowed, -1 = unlimited
      - `max_depots` (integer) - max depots allowed, -1 = unlimited
      - `features` (jsonb) - list of feature strings
      - `is_active` (boolean)
      - `sort_order` (integer)
      - `created_at`, `updated_at` (timestamptz)

    - `company_subscriptions`
      - `id` (uuid, primary key)
      - `company_id` (uuid, FK to companies)
      - `plan_id` (uuid, FK to subscription_plans)
      - `status` (text) - trial, active, expired, cancelled
      - `trial_start`, `trial_end` (timestamptz)
      - `current_period_start`, `current_period_end` (timestamptz)
      - `stripe_subscription_id`, `stripe_customer_id` (text)
      - `created_at`, `updated_at` (timestamptz)

    - `payment_transactions`
      - `id` (uuid, primary key)
      - `company_id` (uuid, FK to companies)
      - `subscription_id` (uuid, FK to company_subscriptions)
      - `amount` (numeric)
      - `currency` (text)
      - `status` (text) - pending, completed, failed, refunded
      - `payment_method` (text) - stripe, paypal
      - `stripe_payment_id` (text)
      - `description` (text)
      - `created_at` (timestamptz)

  2. Security
    - RLS enabled on all tables
    - Public can view active subscription plans
    - Company admins can view their own subscription and payments
    - Super admins can view and manage all data

  3. Seed Data
    - 3 subscription plans: Free Trial (30 days), Standard (49 EUR/mo), Premium (99 EUR/mo)
*/

-- Subscription plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text DEFAULT '',
  price_monthly numeric(10,2) NOT NULL DEFAULT 0,
  trial_days integer DEFAULT 0,
  max_drivers integer DEFAULT 0,
  max_depots integer DEFAULT 0,
  features jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active plans"
  ON subscription_plans FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "Super admins can insert plans"
  ON subscription_plans FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can update plans"
  ON subscription_plans FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

-- Company subscriptions table
CREATE TABLE IF NOT EXISTS company_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  plan_id uuid NOT NULL REFERENCES subscription_plans(id),
  status text NOT NULL DEFAULT 'trial',
  trial_start timestamptz,
  trial_end timestamptz,
  current_period_start timestamptz DEFAULT now(),
  current_period_end timestamptz,
  stripe_subscription_id text DEFAULT '',
  stripe_customer_id text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE company_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION get_user_company_id_safe()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_super_admin_safe()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;

CREATE POLICY "Company admins can view own subscription"
  ON company_subscriptions FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id_safe());

CREATE POLICY "Super admins can view all subscriptions"
  ON company_subscriptions FOR SELECT
  TO authenticated
  USING (is_super_admin_safe());

CREATE POLICY "Super admins can update subscriptions"
  ON company_subscriptions FOR UPDATE
  TO authenticated
  USING (is_super_admin_safe())
  WITH CHECK (is_super_admin_safe());

CREATE POLICY "Super admins can insert subscriptions"
  ON company_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin_safe());

-- Payment transactions table
CREATE TABLE IF NOT EXISTS payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  subscription_id uuid REFERENCES company_subscriptions(id),
  amount numeric(10,2) NOT NULL DEFAULT 0,
  currency text DEFAULT 'EUR',
  status text NOT NULL DEFAULT 'pending',
  payment_method text DEFAULT '',
  stripe_payment_id text DEFAULT '',
  description text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can view own payments"
  ON payment_transactions FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id_safe());

CREATE POLICY "Super admins can view all payments"
  ON payment_transactions FOR SELECT
  TO authenticated
  USING (is_super_admin_safe());

CREATE POLICY "Super admins can insert payments"
  ON payment_transactions FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin_safe());

-- Seed subscription plans
INSERT INTO subscription_plans (name, display_name, description, price_monthly, trial_days, max_drivers, max_depots, features, sort_order)
VALUES
  (
    'free_trial',
    'Falas 30 Dite',
    'Provoni platformen falas per 30 dite pa asnje detyrim',
    0,
    30,
    3,
    1,
    '["Deri ne 3 shofere", "1 depo", "Menaxhim bazik stoku", "Fletedergesa", "Chat ne kohe reale"]'::jsonb,
    1
  ),
  (
    'standard',
    'Standard',
    'Per biznese ne rritje qe kerkojne me shume mundesi',
    49.00,
    0,
    15,
    5,
    '["Deri ne 15 shofere", "Deri ne 5 depo", "Menaxhim i plote stoku", "Fletedergesa", "Sistem dokumentash", "Chat ne kohe reale", "Raporte bazike", "Suport me email"]'::jsonb,
    2
  ),
  (
    'premium',
    'Premium',
    'Zgjidhja e plote per biznese te medha',
    99.00,
    0,
    -1,
    -1,
    '["Shofere pa limit", "Depo pa limit", "Menaxhim i plote stoku", "Fletedergesa te avancuara", "Sistem dokumentash", "Chat ne kohe reale", "Raporte te avancuara", "Suport prioritar 24/7", "API Access"]'::jsonb,
    3
  )
ON CONFLICT (name) DO NOTHING;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_company_subscriptions_company_id ON company_subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_company_subscriptions_status ON company_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_company_id ON payment_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_at ON payment_transactions(created_at);