/*
  # Fix subscription_plans SELECT policy for anonymous users

  1. Problem
    - The consolidated "View subscription plans" policy uses `private.is_super_admin()` in an OR condition
    - The `anon` role does not have EXECUTE permission on `private.is_super_admin()`
    - PostgreSQL evaluates both sides of OR (no short-circuit), causing "permission denied" for anonymous users
    - This breaks plan loading on the public registration page

  2. Solution
    - Drop the combined policy
    - Create two separate policies:
      - One for anon + authenticated: can see active plans only (no function call)
      - One for authenticated only: super admins can also see inactive plans

  3. Security
    - Anonymous users can only see active plans (same as before intended behavior)
    - Super admins can see all plans including inactive ones
*/

DROP POLICY IF EXISTS "View subscription plans" ON public.subscription_plans;

CREATE POLICY "Public can view active plans"
  ON public.subscription_plans
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "Super admins can view all plans"
  ON public.subscription_plans
  FOR SELECT
  TO authenticated
  USING (private.is_super_admin());
