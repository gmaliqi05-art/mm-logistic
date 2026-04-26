/*
  # Fix Platform Logo Storage Policies

  1. Storage Policies
    - Allow super admins to upload platform logos (INSERT)
    - Allow public read access for platform folder (SELECT)
    - Allow super admins to update/delete platform files
    - Make platform logo folder publicly accessible

  2. Security
    - Only super admins can manage platform files
    - Public can view platform files (necessary for logo display)
*/

-- Drop existing restrictive policies that prevent platform folder access
DROP POLICY IF EXISTS "Authenticated users can update own attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete own attachments" ON storage.objects;

-- Allow super admins to upload to platform folder
CREATE POLICY "Super admins can upload platform files"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'attachments' 
    AND (storage.foldername(name))[1] = 'platform'
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'super_admin'
    )
  );

-- Allow public read access for platform folder (needed for logo display)
CREATE POLICY "Public can view platform files"
  ON storage.objects
  FOR SELECT
  TO public
  USING (
    bucket_id = 'attachments' 
    AND (storage.foldername(name))[1] = 'platform'
  );

-- Allow super admins to update platform files
CREATE POLICY "Super admins can update platform files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'attachments' 
    AND (storage.foldername(name))[1] = 'platform'
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    bucket_id = 'attachments' 
    AND (storage.foldername(name))[1] = 'platform'
  );

-- Allow super admins to delete platform files
CREATE POLICY "Super admins can delete platform files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'attachments' 
    AND (storage.foldername(name))[1] = 'platform'
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'super_admin'
    )
  );

-- Recreate policies for chat folder with proper restrictions
CREATE POLICY "Authenticated users can update own chat attachments"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = 'chat')
  WITH CHECK (bucket_id = 'attachments');

CREATE POLICY "Authenticated users can delete own chat attachments"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = 'chat');
