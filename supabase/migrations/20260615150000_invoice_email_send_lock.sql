/*
  # K7: Lock column to prevent invoice-email double-send race

  ## Why
  supabase/functions/send-invoice-email/index.ts reads the invoice,
  calls Resend, then UPDATEs `acc_invoices` with sent_at +
  email_recipients + status='sent'. If two clients (manual click +
  cron retry, two tabs, a flaky network retry) call the function
  in parallel:

    * Both fetch the invoice in 'draft' status.
    * Both invoke Resend → the customer receives TWO emails.
    * Both run the post-send UPDATE → sent_at gets overwritten with
      the second call's timestamp, recipients with the second call's
      list. The audit trail no longer reflects what was sent first.

  Resend itself has no idempotency key in our integration today, so
  the double-send hits the customer's inbox. This is real money
  (Resend usage) and real annoyance (duplicate invoices in inboxes).

  ## What this ships
  A single nullable timestamp column `email_send_started_at` on
  `acc_invoices` that the function uses as an atomic soft-lock:

      UPDATE acc_invoices
         SET email_send_started_at = NOW()
       WHERE id = :invoice_id
         AND (email_send_started_at IS NULL
              OR email_send_started_at < NOW() - INTERVAL '60 seconds')
      RETURNING id;

  Two semantics fall out of the conditional UPDATE:

    1. If no other call is in flight, the row updates and the
       caller proceeds with Resend.
    2. If another call already set `email_send_started_at` within
       the last 60s, the WHERE clause matches zero rows, the
       function returns 409 "send already in progress".
    3. The 60-second stale-lock window stops a crashed earlier
       attempt from blocking sends forever. 60s is longer than any
       reasonable Resend round-trip, shorter than the cron retry
       cadence.

  On completion (success OR failure), the function clears the
  column back to NULL so the next legitimate send can run.

  ## Safety
  - Pure column add (NULLABLE, no default), no index, no rewrite.
  - No behavioural change until the edge function is updated
    (which happens in the same PR).
  - Index on the column would be wasteful — it's read only by id.
*/

ALTER TABLE public.acc_invoices
  ADD COLUMN IF NOT EXISTS email_send_started_at timestamptz NULL;

COMMENT ON COLUMN public.acc_invoices.email_send_started_at IS
  'Soft lock used by send-invoice-email to prevent double-send race. NULL means no send is in flight; a value within the last 60 seconds means another caller is currently calling Resend. Stale locks expire after 60 seconds to recover from crashed attempts.';
