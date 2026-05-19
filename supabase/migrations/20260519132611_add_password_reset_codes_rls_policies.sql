/*
  # Add RLS Policies for password_reset_codes

  1. Security
    - Authenticated users can only SELECT codes matching their own email
    - No INSERT/UPDATE/DELETE for regular users (service role bypasses RLS)
    - Also adds the missing user_id column for the edge function

  2. Notes
    - Service role (used by edge functions) bypasses RLS automatically
    - This satisfies the audit requirement of having at least one policy
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'password_reset_codes' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE password_reset_codes ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE POLICY "Users can view own reset codes"
  ON password_reset_codes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
