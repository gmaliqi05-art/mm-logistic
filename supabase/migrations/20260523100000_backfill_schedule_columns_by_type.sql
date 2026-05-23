/*
  # Backfill scheduled_pickup_at / scheduled_delivery_at by note type

  The DeliveryNotes form kept both date fields in state and wrote
  whatever was set at submit time. If the user picked "Delivery"
  first, typed a date, then switched to "Pickup", the row landed in
  the DB with type='pickup' but the date stuck on
  scheduled_delivery_at and scheduled_pickup_at stayed NULL. The
  company dashboard's today/tomorrow lists relied on the canonical
  column and so the order silently disappeared from those buckets
  even though the top badge counters still showed it.

  This migration moves the date into the right column for any row
  where the canonical field is NULL but the "other" field has a
  value:

    type=pickup, scheduled_pickup_at IS NULL, scheduled_delivery_at NOT NULL
      → copy scheduled_delivery_at into scheduled_pickup_at,
        leave scheduled_delivery_at alone for backward compatibility.

    type=delivery, scheduled_delivery_at IS NULL, scheduled_pickup_at NOT NULL
      → copy scheduled_pickup_at into scheduled_delivery_at.

  A frontend fix (Dashboard.tsx falls back to the other column when
  the primary is NULL, and the form now writes both columns) handles
  rows we don't backfill, so this is belt-and-suspenders cleanup for
  pre-existing data.
*/

UPDATE public.delivery_notes
SET    scheduled_pickup_at = scheduled_delivery_at
WHERE  type = 'pickup'
  AND  scheduled_pickup_at IS NULL
  AND  scheduled_delivery_at IS NOT NULL;

UPDATE public.delivery_notes
SET    scheduled_delivery_at = scheduled_pickup_at
WHERE  type = 'delivery'
  AND  scheduled_delivery_at IS NULL
  AND  scheduled_pickup_at IS NOT NULL;
