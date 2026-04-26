/*
  # Add Profile Insert Policies for Admins

  1. Changes
    - Add INSERT policy for super_admin to create any profile
    - Add INSERT policy for company_admin to create profiles in their company
    - Add UPDATE policy for company_admin to update profiles in their company

  2. Notes
    - Required for user management from admin panels
*/

CREATE POLICY "profiles_insert_super_admin"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (get_user_role() = 'super_admin');

CREATE POLICY "profiles_insert_company_admin"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    get_user_role() = 'company_admin' 
    AND company_id = get_user_company_id()
  );

CREATE POLICY "profiles_update_company_admin"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    get_user_role() = 'company_admin' 
    AND company_id = get_user_company_id()
  )
  WITH CHECK (
    get_user_role() = 'company_admin' 
    AND company_id = get_user_company_id()
  );
