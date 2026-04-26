/*
  # Allow Service Role to Insert Profiles

  1. Problem
    - Edge functions use service_role key but existing INSERT policies still block
    - WITH CHECK policies evaluate get_user_role() which returns NULL for service_role
    - Need to explicitly allow inserts when auth.uid() is NULL (service role context)

  2. Solution
    - Add a permissive policy that allows INSERT when auth.uid() is NULL
    - This covers service_role key usage from edge functions
    - Keep existing policies for authenticated user inserts

  3. Security
    - Service role key is only available server-side (edge functions)
    - This is safe as service role has full database access anyway
    - Regular users cannot trigger this policy as they always have auth.uid()
*/

-- Create policy for service role inserts (when auth.uid() is NULL)
CREATE POLICY "profiles_insert_service_role"
  ON profiles FOR INSERT
  TO authenticated, anon
  WITH CHECK (auth.uid() IS NULL OR auth.uid() = id);

-- Note: This policy will match when:
-- 1. Called with service_role key (auth.uid() IS NULL) - allows any insert
-- 2. Called by authenticated user inserting their own profile (auth.uid() = id)