/*
  # K6: enforce condition ↔ quality_class consistency on delivery_note_items

  ## Why
  Migration 20260614090000 added `delivery_note_items.quality_class` with
  a CHECK that the value is NULL or one of
  ('NEU','A','B','C','UNSORTED','REPAIR_NEEDED','SCRAP'). Nothing
  enforced the *relationship* between `condition` and `quality_class`,
  so an operator could persist nonsense pairs like:

    condition='damaged', quality_class='A'
    condition='good',    quality_class='REPAIR_NEEDED'
    condition='ready_a', quality_class='B'

  Those pairs silently break downstream valuation, EPAL-pool exchange
  decisions, and dunning reports (which all key off `quality_class`).

  ## What this adds
  - CHECK constraint `delivery_note_items_condition_quality_consistent`
    that only allows the documented pairs:

      good            → NEU | A | B | C | UNSORTED
      damaged         → REPAIR_NEEDED | SCRAP
      sorting         → UNSORTED
      ready_a         → A
      ready_b         → B
      ready_c         → C

    NULL `quality_class` is always permitted (unclassified items).

    The frontend mirrors this rule in `src/utils/qualityClassConsistency.ts`
    so saves can be pre-validated before they reach Postgres.

  ## Safety
  - Current data on prod: 4 rows, all with `quality_class IS NULL` —
    every existing row satisfies the new CHECK.
  - Added with NOT VALID + VALIDATE in two steps so a row count grows
    a graceful failure path: NOT VALID accepts the constraint
    immediately for all future writes, VALIDATE only re-scans existing
    rows. Both steps run in this migration; the split exists so a
    failure leaves a clean state.
  - Idempotent via DO IF NOT EXISTS.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.delivery_note_items'::regclass
      AND conname  = 'delivery_note_items_condition_quality_consistent'
  ) THEN
    ALTER TABLE public.delivery_note_items
      ADD CONSTRAINT delivery_note_items_condition_quality_consistent
      CHECK (
        quality_class IS NULL
        OR (condition = 'good'    AND quality_class IN ('NEU', 'A', 'B', 'C', 'UNSORTED'))
        OR (condition = 'damaged' AND quality_class IN ('REPAIR_NEEDED', 'SCRAP'))
        OR (condition = 'sorting' AND quality_class = 'UNSORTED')
        OR (condition = 'ready_a' AND quality_class = 'A')
        OR (condition = 'ready_b' AND quality_class = 'B')
        OR (condition = 'ready_c' AND quality_class = 'C')
      )
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.delivery_note_items
  VALIDATE CONSTRAINT delivery_note_items_condition_quality_consistent;

COMMENT ON CONSTRAINT delivery_note_items_condition_quality_consistent
  ON public.delivery_note_items IS
  'Enforces that the EPAL quality_class is consistent with the operational condition (e.g. damaged items cannot carry class A). Mirrored by src/utils/qualityClassConsistency.ts.';
