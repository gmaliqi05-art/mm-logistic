/*
  # Notification queue retry + DLQ + transactional claim

  Backend audit C3 + M1:
  - A transient 500 from dispatch-notification (FCM rate-limit,
    momentary DB blip) sets status='failed' permanently. The
    notification is then lost.
  - process-notification-queue selects status='queued' rows, hands
    them off serially, without claiming them in a transaction.
    Two cron ticks running close together can both pick up the
    same row.

  Changes:
  - Add attempt_count / max_attempts / next_retry_at / claimed_at
  - claim_notifications(p_limit) — atomic UPDATE ... FROM (SELECT
    ... FOR UPDATE SKIP LOCKED) RETURNING; cron now claims rows
    instead of plain selecting them
  - On a transient failure, increment attempt_count and schedule
    next_retry_at with exponential backoff. Only mark status='failed'
    after max_attempts.
  - mark_notification_failed(p_id, p_error, p_transient) RPC that
    encapsulates the retry policy.

  Idempotent re-run safe: ADD COLUMN IF NOT EXISTS and CREATE OR
  REPLACE FUNCTION throughout.
*/

ALTER TABLE notification_queue
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- Reclaim stuck rows: if a row has been in 'processing' for >10min,
-- it's almost certainly a crashed dispatcher. Index supports the
-- claim query below.
CREATE INDEX IF NOT EXISTS idx_queue_claim_ready
  ON notification_queue (status, scheduled_at, next_retry_at)
  WHERE status IN ('queued', 'processing');

-- ============================================================
-- claim_notifications: atomic claim with FOR UPDATE SKIP LOCKED
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_notifications(p_limit integer DEFAULT 25)
RETURNS SETOF notification_queue
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE notification_queue
  SET
    status = 'processing',
    claimed_at = now(),
    attempt_count = attempt_count + 1
  WHERE id IN (
    SELECT id
    FROM notification_queue
    WHERE
      (
        -- Fresh queued items whose scheduled time has passed.
        (status = 'queued' AND scheduled_at <= now() AND (next_retry_at IS NULL OR next_retry_at <= now()))
        OR
        -- Items stuck in 'processing' for over 10 minutes are
        -- assumed crashed; reclaim them.
        (status = 'processing' AND claimed_at < now() - interval '10 minutes')
      )
      AND attempt_count < max_attempts
    ORDER BY scheduled_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_notifications(integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_notifications(integer) TO service_role;

COMMENT ON FUNCTION public.claim_notifications IS
  'Atomically claim up to N due notification_queue rows. Uses '
  'FOR UPDATE SKIP LOCKED so concurrent cron ticks never pick up '
  'the same row. Also reclaims rows stuck in processing >10min.';

-- ============================================================
-- mark_notification_failed: encapsulates the retry policy
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_notification_failed(
  p_id uuid,
  p_error text,
  p_transient boolean DEFAULT true
)
RETURNS notification_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row notification_queue;
  v_backoff_seconds integer;
BEGIN
  SELECT * INTO v_row FROM notification_queue WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'notification_queue row % not found', p_id;
  END IF;

  IF p_transient AND v_row.attempt_count < v_row.max_attempts THEN
    -- Exponential backoff: 30s, 2m, 8m, 32m, 2h ...
    v_backoff_seconds := 30 * power(4, GREATEST(v_row.attempt_count - 1, 0))::integer;
    UPDATE notification_queue
    SET
      status = 'queued',
      next_retry_at = now() + make_interval(secs => v_backoff_seconds),
      claimed_at = NULL,
      error_message = p_error
    WHERE id = p_id
    RETURNING * INTO v_row;
  ELSE
    -- Permanent failure or out of retries: DLQ.
    UPDATE notification_queue
    SET
      status = 'failed',
      claimed_at = NULL,
      error_message = p_error
    WHERE id = p_id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_notification_failed(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.mark_notification_failed(uuid, text, boolean) TO service_role;

COMMENT ON FUNCTION public.mark_notification_failed IS
  'Called by the queue processor when a single dispatch fails. '
  'Transient errors are requeued with exponential backoff until '
  'max_attempts; permanent errors go straight to status=failed (DLQ).';

-- ============================================================
-- Backfill: surface stuck rows from the old single-attempt logic
-- ============================================================
-- Pre-existing rows with status='failed' that never had a retry
-- attempt — let them retry once more under the new system.
UPDATE notification_queue
SET
  status = 'queued',
  next_retry_at = now(),
  attempt_count = 0,
  error_message = error_message || ' (re-queued by 20260524130000)'
WHERE
  status = 'failed'
  AND attempt_count = 0
  AND created_at > now() - interval '7 days';
