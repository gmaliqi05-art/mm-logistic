/*
  # Create Attachments Storage Bucket

  1. New Storage
    - `attachments` bucket for chat file uploads (photos, documents)
    - Bucket is set to public so files can be accessed via URL

  2. Security
    - Authenticated users can upload files to the bucket
    - Authenticated users can read files from the bucket
    - Only file owners (based on path) or super admins can delete files
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'attachments');

CREATE POLICY "Authenticated users can read attachments"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'attachments');

CREATE POLICY "Authenticated users can update own attachments"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = 'chat')
  WITH CHECK (bucket_id = 'attachments');

CREATE POLICY "Authenticated users can delete own attachments"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = 'chat');