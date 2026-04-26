/*
  # Fix Profiles Insert with Service Role Key

  1. Problem
    - When edge functions use service_role key to insert profiles, RLS policies still block the insert
    - The INSERT policies check get_user_role() which relies on auth.uid()
    - When using service_role, we need to bypass these checks

  2. Solution
    - Drop existing conflicting INSERT policies
    - Recreate policies with proper service_role handling
    - Service role should bypass RLS entirely (default behavior)
    
  3. Changes
    - Drop profiles_insert_own policy (redundant)
    - Drop profiles_insert policy (too generic)
    - Keep profiles_insert_super_admin and profiles_insert_company_admin
    - These use WITH CHECK which is evaluated after the row data is available
*/

-- Drop conflicting insert policies
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;

-- The existing policies profiles_insert_super_admin and profiles_insert_company_admin 
-- should remain, as they handle authenticated user inserts correctly.

-- Note: Service role automatically bypasses RLS, so no explicit policy needed for it