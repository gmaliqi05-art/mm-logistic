/*
  # Manual VAT override on sales invoices

  Auto-detection of the VAT regime (domestic / intra-community supply /
  reverse charge / export) is already implemented in
  `src/utils/euCompliance.ts` and consumed by `InvoiceBuilder.tsx`.
  Operators sometimes need to override that — for example when the
  buyer's VAT number can't be verified online but the operator has
  paper evidence, or when a special exemption applies.

  This migration adds a small nullable text column to record the
  operator's override choice on the invoice itself, so future viewers
  (admin, accountant, journal poster, exports) can tell whether the
  VAT decision came from automatic detection or a manual flag.

      NULL     = auto-detect from seller/buyer country + VAT number
      'apply'  = force domestic VAT regardless of regime
      'exempt' = force zero-rate regardless of regime

  No data migration is needed — existing rows stay at NULL ("auto").
  The journal posting function (`acc_post_invoice_to_journal`) reads
  the existing `reverse_charge` / `intra_community_supply` flags and
  the items' `vat_rate`, all of which the UI already sets to match
  the override.
*/

ALTER TABLE public.acc_invoices
  ADD COLUMN IF NOT EXISTS vat_override text
    CHECK (vat_override IS NULL OR vat_override IN ('apply','exempt'));

COMMENT ON COLUMN public.acc_invoices.vat_override IS
  'Manual VAT override. NULL = auto-detect. ''apply'' = force domestic VAT. ''exempt'' = force zero-rate.';
