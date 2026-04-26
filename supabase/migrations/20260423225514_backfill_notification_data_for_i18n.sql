/*
  # Backfill notifications.data for existing delivery note notifications

  Existing delivery_note notifications were created before the trigger was updated
  to emit a `data` payload, so their `data` column is `{}` and the client falls
  back to the raw Albanian `title`/`message`. This migration parses each legacy
  notification's Albanian title and message to repopulate `event`, `note_type`,
  and `note_number` so the client can translate them into the active UI locale.

  1. Changes
    - Update `notifications` where type='delivery_note' and `data` has no 'event'.
    - Derive:
      - note_type from title keyword ("Fletedergese" => 'delivery', "Fletemarrje" => 'pickup')
      - event from title suffix (e caktuar/e re => assigned, u nis => in_transit, e perfunduar => delivered)
      - note_number as the trailing word in the message (e.g. FD-DEMO-OV-D1)

  2. Security
    - No RLS change; SECURITY DEFINER not required (raw UPDATE).
*/

UPDATE notifications n
SET data = jsonb_build_object(
  'event', CASE
    WHEN n.title ILIKE '%u nis%' THEN 'in_transit'
    WHEN n.title ILIKE '%e perfunduar%' OR n.title ILIKE '%u dorezua%' THEN 'delivered'
    WHEN n.title ILIKE '%e re%' THEN 'sent_to_driver'
    WHEN n.title ILIKE '%e caktuar%' THEN 'assigned'
    ELSE NULL
  END,
  'note_type', CASE
    WHEN n.title ILIKE '%fletemarrje%' OR n.message ILIKE '%fletemarrje%' THEN 'pickup'
    ELSE 'delivery'
  END,
  'note_number', COALESCE(
    regexp_replace(n.message, '^.*\s([^\s]+)\s*$', '\1'),
    ''
  )
)
WHERE n.type = 'delivery_note'
  AND (n.data IS NULL OR NOT (n.data ? 'event'))
  AND (
    n.title ILIKE '%u nis%'
    OR n.title ILIKE '%e perfunduar%'
    OR n.title ILIKE '%u dorezua%'
    OR n.title ILIKE '%e re%'
    OR n.title ILIKE '%e caktuar%'
  );
