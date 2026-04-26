/*
  # Clean Up Duplicate Indexes

  1. Duplicate Indexes
    - support_messages has two identical indexes: idx_support_messages_ticket and idx_support_messages_ticket_id
    - Both index the same column (ticket_id), creating unnecessary overhead
    
  2. Changes
    - Drop idx_support_messages_ticket (older naming convention)
    - Keep idx_support_messages_ticket_id (more descriptive)
    
  3. Benefits
    - Reduces storage space
    - Improves write performance (fewer indexes to update)
    - Simplifies index maintenance
*/

-- Drop the duplicate index (keeping the more descriptively named one)
DROP INDEX IF EXISTS public.idx_support_messages_ticket;
