/*
  # Add Attachment Support to Delivery Notes

  This migration adds the ability to attach scanned documents or photos to delivery notes.

  1. Changes
    - Add attachment_url column to delivery_notes table
    - This stores the URL of uploaded/scanned document in Supabase Storage
*/

ALTER TABLE delivery_notes 
ADD COLUMN IF NOT EXISTS attachment_url text DEFAULT NULL;

COMMENT ON COLUMN delivery_notes.attachment_url IS 'URL to scanned document or photo attachment in Supabase Storage';
