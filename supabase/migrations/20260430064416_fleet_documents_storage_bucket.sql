/*
  # Fleet Documents Storage Bucket
  
  Creates a storage bucket for vehicle registration documents, inspection certificates,
  insurance policies, driver licenses, qualifications, and medical certificates.
  
  Security: Only company members can access their company's documents.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('fleet-documents', 'fleet-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Company members can upload fleet documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'fleet-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Company members can view fleet documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'fleet-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Company members can delete fleet documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'fleet-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM profiles WHERE id = auth.uid()
    )
  );
