/*
  # Link partial sorting batches to their parent load

  When a load is sorted in several sessions (a receipt of e.g. 561 pallets
  sorted 60 now, 200 later, ...), each session is its own
  `pallet_sorting_batches` row. Without a parent link they show as separate
  cards, cluttering the list. This adds a self-reference so continuation
  batches can be grouped under the original (root) batch of the same load.

  1. New column
     - `parent_batch_id uuid` -> pallet_sorting_batches(id), ON DELETE SET NULL.
       NULL on the root batch; set to the root's id on every continuation.

  2. Backfill
     - Existing continuations (notes starting with 'Vazhdim i sortimit') are
       linked to the earliest non-continuation batch that shares the same
       company/depot/category and source delivery note + reference.

  No destructive changes. Additive column + index.
*/

ALTER TABLE public.pallet_sorting_batches
  ADD COLUMN IF NOT EXISTS parent_batch_id uuid
  REFERENCES public.pallet_sorting_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_psb_parent
  ON public.pallet_sorting_batches(parent_batch_id);

-- Backfill: attach existing continuation batches to their root batch.
UPDATE public.pallet_sorting_batches c
SET parent_batch_id = (
  SELECT r.id
  FROM public.pallet_sorting_batches r
  WHERE r.company_id = c.company_id
    AND r.category_id = c.category_id
    AND r.depot_id IS NOT DISTINCT FROM c.depot_id
    AND r.source_delivery_note_id IS NOT DISTINCT FROM c.source_delivery_note_id
    AND r.reference_number_snapshot IS NOT DISTINCT FROM c.reference_number_snapshot
    AND (r.notes IS NULL OR r.notes NOT LIKE 'Vazhdim i sortimit%')
    AND r.created_at < c.created_at
    AND r.id <> c.id
  ORDER BY r.created_at ASC
  LIMIT 1
)
WHERE c.parent_batch_id IS NULL
  AND c.notes LIKE 'Vazhdim i sortimit%';
