/*
  # EPAL QR serial tracking on delivery_note_items

  Since January 2024, EPAL has been rolling out QR codes on newly
  produced Euro-pallets. The codes carry a unique manufacturer + serial
  combination, enabling per-pallet traceability across the European
  pool — and competing with our SaaS via the free EPAL Pallet App.

  This migration adds the column where the parsed serial is stored so
  the depot worker's scanner flow can populate it on receipt, and so
  partner reconciliations can be done at serial-level rather than at
  count-level for high-value pool relationships.

  ## What's added

  - `delivery_note_items.epal_qr_serial` text NULL
    The parsed serial (canonical string form, e.g. "EPAL-1234-2024-000A12B345").
    NULL for legacy items and any line that wasn't scanned via QR.
    Not unique on the table — a pallet may be received and dispatched
    multiple times, with each transaction recorded as a separate line.

  - Partial index on (company_id, epal_qr_serial) for fast lookup when
    cross-referencing a pallet's history. We use a partial index because
    most rows will have NULL serial; indexing only non-null values
    keeps the index small.

  ## Safety

  - Nullable; no existing INSERT breaks.
  - Idempotent via DO IF NOT EXISTS.
  - No constraint changes on existing columns.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'delivery_note_items'
      AND column_name = 'epal_qr_serial'
  ) THEN
    ALTER TABLE public.delivery_note_items
      ADD COLUMN epal_qr_serial text NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_delivery_note_items_epal_qr_serial
  ON public.delivery_note_items (epal_qr_serial)
  WHERE epal_qr_serial IS NOT NULL;

COMMENT ON COLUMN public.delivery_note_items.epal_qr_serial IS
  'Canonical EPAL QR serial scanned from the pallet (e.g. EPAL-1234-2024-000A12B345). NULL for non-QR lines and legacy rows.';
