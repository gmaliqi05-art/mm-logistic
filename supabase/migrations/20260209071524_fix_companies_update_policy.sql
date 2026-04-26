/*
  # Fix companies UPDATE policy for company_admin

  1. Changes
    - Add UPDATE policy for company_admin on companies table
    - This allows company admins to update their own company settings
  
  2. Security
    - Policy restricted to authenticated company_admin users
    - Can only update their own company (company_id match)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'company_admin_update_own_company' AND tablename = 'companies'
  ) THEN
    CREATE POLICY "company_admin_update_own_company"
      ON companies
      FOR UPDATE
      TO authenticated
      USING (
        get_user_role() = 'company_admin' AND id = get_user_company_id()
      )
      WITH CHECK (
        get_user_role() = 'company_admin' AND id = get_user_company_id()
      );
  END IF;
END $$;
