/*
  # Add indexes for logistics queries on delivery_notes

  1. New indexes
    - Composite index (company_id, status) for dashboard counts
    - Composite (assigned_driver_id, status) for driver task lists
    - Composite (assigned_depot_id, status) for depot queues
    - Partial index on (company_id, last_location_at DESC) for live map

  2. Security
    No RLS changes. Indexes are internal to Postgres.

  3. Notes
    All indexes created with IF NOT EXISTS to keep migration idempotent.
*/

CREATE INDEX IF NOT EXISTS idx_delivery_notes_company_status
  ON public.delivery_notes (company_id, status);

CREATE INDEX IF NOT EXISTS idx_delivery_notes_driver_status
  ON public.delivery_notes (assigned_driver_id, status)
  WHERE assigned_driver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_notes_depot_status
  ON public.delivery_notes (assigned_depot_id, status)
  WHERE assigned_depot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_notes_company_location
  ON public.delivery_notes (company_id, last_location_at DESC)
  WHERE current_lat IS NOT NULL AND current_lng IS NOT NULL;
