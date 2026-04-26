/*
  # Remove Conflicting Profiles INSERT Policies

  1. Problem Analysis
    - Existing INSERT policies check get_user_role() and get_user_company_id()
    - These functions return NULL when called with service_role key
    - This causes WITH CHECK to fail even with service_role key
    - Supabase service_role should bypass RLS but policies are still evaluated

  2. Solution
    - Remove ALL INSERT policies on profiles table
    - Service role key will handle all profile insertions via edge functions
    - This is secure because:
      - Service role key is only available server-side (in edge functions)
      - Regular authenticated users cannot insert profiles directly
      - All user creation goes through edge functions with proper validation

  3. Security
    - RLS remains enabled on profiles table
    - SELECT, UPDATE, DELETE policies remain in place
    - Only INSERT is opened for service_role operations
    - Edge functions handle all authorization logic before inserting
*/

-- Drop all INSERT policies on profiles
DROP POLICY IF EXISTS "profiles_insert_super_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_company_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_service_role" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;

-- Note: With RLS enabled and no INSERT policies, only service_role can insert
-- This is the intended behavior as all profile creation should go through edge functions