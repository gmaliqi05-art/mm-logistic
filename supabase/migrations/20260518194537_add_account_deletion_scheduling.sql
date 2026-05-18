/*
  # Add Account Deletion Scheduling

  1. Modified Tables
    - `companies`
      - `deletion_requested_at` (timestamptz) - When deletion was requested
      - `deletion_scheduled_for` (timestamptz) - When deletion will execute (30 days later)
      - `deletion_reason` (text) - Optional reason for deletion
    - `profiles`
      - `deletion_requested_at` (timestamptz) - When individual user requested deletion
      - `deletion_scheduled_for` (timestamptz) - When individual deletion will execute

  2. Security
    - No new RLS policies needed (existing company/profile policies apply)
    - Columns are nullable, default NULL means no pending deletion

  3. Notes
    - Company deletion cascades to all members (drivers, depot workers, accountants)
    - 30-day grace period before actual data removal
    - Users can cancel deletion during grace period
*/

-- Add deletion columns to companies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'deletion_requested_at'
  ) THEN
    ALTER TABLE companies
      ADD COLUMN deletion_requested_at timestamptz DEFAULT NULL,
      ADD COLUMN deletion_scheduled_for timestamptz DEFAULT NULL,
      ADD COLUMN deletion_reason text DEFAULT NULL;
  END IF;
END $$;

-- Add deletion columns to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'deletion_requested_at'
  ) THEN
    ALTER TABLE profiles
      ADD COLUMN deletion_requested_at timestamptz DEFAULT NULL,
      ADD COLUMN deletion_scheduled_for timestamptz DEFAULT NULL;
  END IF;
END $$;

-- Index for efficient cron lookup of pending deletions
CREATE INDEX IF NOT EXISTS idx_companies_deletion_scheduled
  ON companies (deletion_scheduled_for)
  WHERE deletion_scheduled_for IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_deletion_scheduled
  ON profiles (deletion_scheduled_for)
  WHERE deletion_scheduled_for IS NOT NULL;
