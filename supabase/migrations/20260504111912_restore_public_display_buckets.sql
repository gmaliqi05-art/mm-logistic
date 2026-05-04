/*
  # Restore public flag for display-image buckets

  1. Rationale
    - fleet-scans, acc-scans, acc-documents contain sensitive financial/legal documents
      and must stay private; signed URLs are generated via src/utils/storage.ts.
    - avatars, attachments, product-images are referenced directly from <img> tags across
      many UI surfaces. Switching them to private requires coordinated refactor across
      15+ components. Until that refactor lands, they remain public to keep the UI working.

  2. Changes
    - Sets public=true for avatars, attachments, product-images.
    - Leaves fleet-scans, acc-scans, acc-documents as private (set in previous migration).
*/

UPDATE storage.buckets
SET public = true
WHERE id IN ('avatars', 'attachments', 'product-images');
