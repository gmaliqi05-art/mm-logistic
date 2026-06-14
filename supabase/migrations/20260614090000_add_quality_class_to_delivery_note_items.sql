/*
  # Persist EPAL quality_class on delivery_note_items

  PR #178 added the EPAL classification helpers and view. The OCR scan
  flow extracts `quality_class` from descriptions like "Klasse A" but,
  per the audit, the value is currently discarded before INSERT. This
  migration adds the column so we can persist it.

  ## What's added

  - `delivery_note_items.quality_class` — nullable text (NEU | A | B | C |
    UNSORTED | REPAIR_NEEDED | SCRAP). Nullable because:
      * Existing rows have no value to backfill.
      * Not every receiving/delivery operation knows the EPAL grade
        (e.g. carton goods aren't graded; sortable mixes start as
        UNSORTED but operator may leave it null).

  ## Safety

  - No constraint changes on existing columns.
  - Default NULL — no INSERT statement breaks.
  - CHECK constraint accepts only the canonical EPAL classes; an
    invalid value rejects at write time rather than silently passing.
  - Idempotent via DO IF NOT EXISTS.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'delivery_note_items'
      AND column_name = 'quality_class'
  ) THEN
    ALTER TABLE public.delivery_note_items
      ADD COLUMN quality_class text NULL
      CHECK (
        quality_class IS NULL
        OR quality_class IN ('NEU', 'A', 'B', 'C', 'UNSORTED', 'REPAIR_NEEDED', 'SCRAP')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.delivery_note_items.quality_class IS
  'EPAL quality class for the line. NULL = unknown / not graded. Set automatically by OCR (Klasse A/B/C detection) or manually by the depot worker during sorting.';
