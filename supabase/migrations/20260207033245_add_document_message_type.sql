/*
  # Add document message type to chat_messages

  1. Changes
    - Update the message_type CHECK constraint to include 'document' type
    - This allows file attachments (PDFs, docs, etc.) to be sent in chat

  2. Important Notes
    - The frontend already sends 'document' type for non-image file uploads
    - This migration aligns the database constraint with the application behavior
*/

ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_message_type_check;

ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_message_type_check
  CHECK (message_type IN ('text', 'photo', 'delivery_note', 'address', 'document'));
