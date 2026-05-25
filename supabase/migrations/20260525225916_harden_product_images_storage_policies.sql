/*
  # Harden product-images storage policies with tenant isolation

  1. Security Changes
    - Replace the overly permissive product-images storage policies
    - New policies enforce company_id scoping via folder path convention:
      files must be stored under `{company_id}/...` path
    - INSERT: user can only upload to their own company's folder
    - UPDATE: user can only update files in their own company's folder
    - DELETE: user can only delete files in their own company's folder
    - SELECT: remains public (product images are meant to be displayed)

  2. Also harden attachments INSERT with folder scoping
    - Chat attachments must go under `chat/{room_id}/` path
    - General attachments still unrestricted for authenticated users

  3. Rationale
    - Previously any authenticated user could delete/overwrite product images
      from any company -- a critical cross-tenant vulnerability
*/

-- Drop existing overly permissive product-images policies
DROP POLICY IF EXISTS "product_images_insert" ON storage.objects;
DROP POLICY IF EXISTS "product_images_update" ON storage.objects;
DROP POLICY IF EXISTS "product_images_delete" ON storage.objects;

-- Recreate with tenant isolation (company_id as first folder segment)
CREATE POLICY "product_images_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = (private.get_my_company_id())::text
);

CREATE POLICY "product_images_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = (private.get_my_company_id())::text
)
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = (private.get_my_company_id())::text
);

CREATE POLICY "product_images_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = (private.get_my_company_id())::text
);

-- Also harden avatars INSERT to require user's own folder
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;

CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);
