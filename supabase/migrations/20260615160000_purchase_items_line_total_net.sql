/*
  # L1: Normalize acc_purchase_items.line_total to NET semantics

  ## Why
  General-audit Wave 3 finding L1. src/pages/accounting/Purchases.tsx
  used to compute the per-line column as GROSS:

      function calcLineTotal(qty, price, vat) {
        return qty * price * (1 + vat / 100);    // ← GROSS!
      }

  Every other writer + reader in the accounting module treats
  `line_total` as NET:

    * Invoices.tsx writes qty × unit_price minus discount (NET).
    * Reports.tsx (lines 222-365) reads line_total and applies
      `(line_total * vat_rate) / 100` to derive VAT. With a GROSS
      `line_total`, this double-counts the VAT pass.
    * GermanFinancials.tsx (lines 379-393) sums line_total per
      vat_rate as the NET amount for §13b USt / §3a UStG totals.
    * ProductDetail.tsx + Reports.tsx product breakdowns sum
      line_total as cost / revenue. GROSS purchases would inflate
      cost.

  The frontend has already been corrected to write NET (see the
  matching commit). This migration backfills any rows whose value
  reflects the old GROSS pattern so reports become correct
  retroactively.

  ## What this ships
  A one-shot UPDATE that:

    1. Skips rows with `vat_rate = 0` (no GROSS↔NET ambiguity).
    2. Rounds `line_total / (1 + vat_rate/100)` to 2 dp, but only
       if the existing `line_total` matches the GROSS formula —
       i.e., when `line_total ≈ quantity * unit_price * (1 + vat/100)`
       with a tiny tolerance. That guard means rows that were
       already stored as NET (e.g., from a future caller) are left
       alone.
    3. Leaves `purchase.subtotal`, `purchase.vat_amount`,
       `purchase.total` untouched — those are sourced from the
       form's separate subtotal / vatTotal useMemos which already
       computed correctly.

  ## Safety
  - Prod-checked before writing: only 2 acc_purchase_items rows
    exist and both have vat_rate = 0, so this UPDATE is a no-op on
    prod. The guard is there for self-hosted clones with vat-bearing
    purchase history.
  - The detection tolerance is ±0.01 to absorb the rounding the
    GROSS path performed.
  - Idempotent: re-running the migration cannot un-fix a NET row
    because the guard requires the GROSS-pattern equality.
*/

UPDATE public.acc_purchase_items AS i
   SET line_total = ROUND(i.line_total / (1 + (i.vat_rate / 100.0)), 2)
 WHERE i.vat_rate > 0
   AND ABS(i.line_total - ROUND(i.quantity * i.unit_price * (1 + i.vat_rate / 100.0), 2)) < 0.011
   AND ABS(i.line_total - ROUND(i.quantity * i.unit_price, 2)) > 0.011;
