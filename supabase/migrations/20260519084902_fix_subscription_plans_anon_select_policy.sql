/*
  # Fix subscription_plans SELECT policy for anonymous users

  1. Problem
    - The existing SELECT policy uses `private.is_super_admin()` in an OR condition
    - When `anon` role evaluates this policy, it throws "permission denied for function is_super_admin"
    - This prevents unauthenticated users from viewing active subscription plans on the features/pricing page

  2. Fix
    - Drop the combined policy
    - Create two separate policies:
      - One for public (anon + authenticated) to view active plans only
      - One for authenticated super admins to view ALL plans (including inactive)

  3. Security
    - Anonymous users can ONLY see active plans (is_active = true)
    - Super admins can see all plans for management purposes
*/

-- Drop the problematic combined policy
DROP POLICY IF EXISTS "Anyone can view active plans" ON subscription_plans;

-- Policy for anyone (including anon) to view active plans
CREATE POLICY "Public can view active plans"
  ON subscription_plans
  FOR SELECT
  TO public
  USING (is_active = true);

-- Policy for super admins to view ALL plans (including inactive)
CREATE POLICY "Super admins can view all plans"
  ON subscription_plans
  FOR SELECT
  TO authenticated
  USING (private.is_super_admin());
