/*
  # Convert public storage buckets to private

  1. Changes
    - Sets public=false for the 6 app buckets: fleet-scans, acc-scans, acc-documents,
      avatars, attachments, product-images.

  2. Security impact
    - After this migration, direct getPublicUrl() calls will produce URLs that return 400.
    - All client code has been updated to use createSignedUrl() through the shared helper
      src/utils/storage.ts (getSignedUrl) with a 1-hour expiry and in-memory cache.

  3. Notes
    - Existing RLS policies on storage.objects continue to govern who may read/write each
      path. Signed URLs are generated server-side based on the caller's session.
    - This change does NOT delete any files; only the public-read flag is flipped.
*/

UPDATE storage.buckets
SET public = false
WHERE id IN ('fleet-scans', 'acc-scans', 'acc-documents', 'avatars', 'attachments', 'product-images');
