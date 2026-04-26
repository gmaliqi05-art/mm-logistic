/*
  # Tighten chat attachment storage policy

  1. Purpose
    - The previous SELECT policy on the `attachments` storage bucket allowed
      any authenticated user to read every file regardless of company. This
      replaces it with a path-aware policy:
      * `platform/...` files remain publicly readable (already covered by a
        separate policy that stays in place).
      * `chat/<room_id>/...` files are readable only by chat room participants.
      * Other folders (delivery review uploads, scanner pages, company logos,
        profile photos) remain readable by any authenticated user, since their
        visibility model has not yet been redesigned and tightening them here
        risks breaking working flows. Those will be revisited later.

  2. Tables touched
    - `storage.objects` (policy replacement only)

  3. Security changes
    - Drops `Authenticated users can read attachments`.
    - Recreates it with a `CASE` on the first path segment so that `chat/...`
      objects require the caller to be a row in `chat_participants` for the
      matching room id.

  4. Notes
    - Idempotent: uses DROP IF EXISTS before recreating.
    - Existing UPDATE/DELETE chat policies were already scoped to the `chat`
      folder; this aligns SELECT with the same trust boundary.
*/

DROP POLICY IF EXISTS "Authenticated users can read attachments" ON storage.objects;

CREATE POLICY "Authenticated users can read attachments"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (
      (storage.foldername(name))[1] <> 'chat'
      OR EXISTS (
        SELECT 1
        FROM chat_participants cp
        WHERE cp.user_id = auth.uid()
          AND cp.room_id::text = (storage.foldername(name))[2]
      )
    )
  );
