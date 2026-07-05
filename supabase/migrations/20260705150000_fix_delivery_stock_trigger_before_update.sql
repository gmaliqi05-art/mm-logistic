/*
  # Critical fix: delivery-note stock trigger must be BEFORE UPDATE, not AFTER

  `process_delivery_note_stock()` is written in the BEFORE-trigger idiom: it
  mutates the row in place (`NEW.stock_posted := true`, `NEW.stock_post_error
  := '...'`) and `RETURN NEW`. Those NEW mutations only persist when the
  trigger fires **BEFORE** the row is written. In an AFTER trigger the row has
  already been written, so every assignment to NEW is silently discarded.

  The trigger had been (re)created as `AFTER UPDATE OF status` by migrations
  20260512100200 and 20260513103756, and the older working BEFORE trigger
  (`trg_delivery_note_stock`) was removed by the dedup migration
  20260513125700. Net effect: from ~2026-05-26 onward `stock_posted` and
  `stock_post_error` were never persisted. The stock movements / sorting
  batches / repair rows inside the function still ran (those are real writes,
  not NEW mutations), but the note itself was never flagged as posted — so:

  - The frontend (`DeliveryReviewPanel`) re-reads `stock_posted` after setting
    status='confirmed', sees `false`, and throws
    "Stoku nuk u regjistrua ..." even when stock was actually moved — and on a
    genuine insufficient-stock case the real Albanian reason string was lost.
  - Notes could be reprocessed because the `IF NEW.stock_posted = true THEN
    RETURN NEW` short-circuit never became true, risking double movements on
    repeated status updates.

  Diagnosis counts at time of fix: 0 notes with stock_posted=true after
  2026-06-14, 5 stuck at false, last true = 2026-05-26.

  Fix: recreate the trigger as BEFORE UPDATE OF status so the function's NEW
  mutations persist. Applied to prod via MCP; recorded here to keep git in
  sync. Verified after: pg_trigger.tgtype = 19 (BEFORE + ROW + UPDATE).

  Note: the function body itself is unchanged (last defined in
  20260704120000_carrier_skip_stock_posting.sql). This migration only fixes
  the trigger timing.
*/

DROP TRIGGER IF EXISTS trg_process_delivery_note_stock ON public.delivery_notes;
CREATE TRIGGER trg_process_delivery_note_stock
  BEFORE UPDATE OF status ON public.delivery_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.process_delivery_note_stock();
