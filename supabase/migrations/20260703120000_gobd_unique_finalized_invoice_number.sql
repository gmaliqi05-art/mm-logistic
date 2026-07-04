/*
  # GoBD B-C2: unique invoice number for finalized invoices

  GoBD requires "lückenlose fortlaufende Nummerierung" — each finalized
  invoice number must be unique (and gap-free) per company. Today
  `idx_acc_inv_number` is a plain NON-unique index (20260420084941), so two
  finalized invoices can legally share a number.

  In practice numbers are reserved on a draft (`finalizeAndSend` in
  InvoiceBuilder assigns the official number via get_next_acc_number but keeps
  status='draft'), so two drafts can transiently share a reserved number — the
  live data shows exactly one such pair (RE-2026-0017, two drafts). Enforcing
  a strict UNIQUE across all rows would therefore reject legitimate current
  data and normal draft workflows.

  This adds a PARTIAL unique index scoped to finalized invoices only
  (status <> 'draft' and a non-empty number). Effect:
  - Two drafts may still share a reserved number (unchanged workflow).
  - Two *finalized* invoices can never share a number — the DB rejects it,
    surfacing the collision loudly instead of silently emitting a
    non-compliant duplicate legal number.

  Verified against live data before writing: the only duplicate number is a
  pair of DRAFTS, so this index builds without conflict.

  NOTE: this closes the "unique" half of B-C2. The "gap-free / reserve only at
  true finalization" half, plus invoice immutability (B-C1) and sign-correct
  credit-note posting (B-C3), require coordinated app + journal changes and are
  tracked separately in docs/DEEP_AUDIT_AND_STRATEGY.md.
*/

CREATE UNIQUE INDEX IF NOT EXISTS uq_acc_invoices_company_number_finalized
  ON public.acc_invoices (company_id, invoice_number)
  WHERE status <> 'draft' AND invoice_number <> '';
