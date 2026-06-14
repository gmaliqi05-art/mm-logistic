/*
  # ISPM-15 1/3-rule component tracking on depot_repairs

  Under the ISPM-15 / IPPC standard, when a wooden pallet is repaired:
  if MORE than one third of its components are replaced, the entire
  pallet must be re-heat-treated (HT) and re-stamped with the IPPC mark
  by a registered facility. The reused pallet otherwise becomes
  ineligible for cross-border export, where customs may reject it on
  arrival.

  An EPAL Euro-pallet has a canonical 11 deck boards + 9 blocks = 20
  replaceable components. The 1/3 threshold is therefore 7 components
  (33.3% of 20, rounded down for the actionable warning).

  This migration adds the minimum data the repair workflow needs to
  count component replacements; the UI gate + warning lives in the
  helper `src/utils/ispm15.ts` (added in the same PR) so the rule is
  consistent across the JS layer.

  ## What's added

  - `depot_repairs.boards_replaced` integer NULL — count of deck boards
    replaced for the batch.
  - `depot_repairs.blocks_replaced` integer NULL — count of blocks
    replaced for the batch.
  - `depot_repairs.requires_retreatment` boolean DEFAULT false — set
    by the application layer when (boards + blocks) per pallet exceeds
    the threshold. Surfaces in reports without recomputing the rule
    every read.

  ## Safety

  - All columns nullable / defaulted; no existing INSERT breaks.
  - CHECK constraints guard against negative counts.
  - Idempotent via DO IF NOT EXISTS.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'depot_repairs'
      AND column_name = 'boards_replaced'
  ) THEN
    ALTER TABLE public.depot_repairs
      ADD COLUMN boards_replaced integer NULL
      CHECK (boards_replaced IS NULL OR boards_replaced >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'depot_repairs'
      AND column_name = 'blocks_replaced'
  ) THEN
    ALTER TABLE public.depot_repairs
      ADD COLUMN blocks_replaced integer NULL
      CHECK (blocks_replaced IS NULL OR blocks_replaced >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'depot_repairs'
      AND column_name = 'requires_retreatment'
  ) THEN
    ALTER TABLE public.depot_repairs
      ADD COLUMN requires_retreatment boolean NOT NULL DEFAULT false;
  END IF;
END $$;

COMMENT ON COLUMN public.depot_repairs.boards_replaced IS
  'ISPM-15: count of deck boards replaced for the batch (per representative pallet). NULL = not tracked.';

COMMENT ON COLUMN public.depot_repairs.blocks_replaced IS
  'ISPM-15: count of blocks (Klötze) replaced for the batch (per representative pallet). NULL = not tracked.';

COMMENT ON COLUMN public.depot_repairs.requires_retreatment IS
  'ISPM-15 1/3 rule: true when (boards_replaced + blocks_replaced) / 20 > 1/3 — pallet must be HT re-treated and re-stamped before export use.';
