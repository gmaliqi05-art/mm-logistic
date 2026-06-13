/*
  # Tausch / Pfand foundation: clearing model + per-line VAT treatment

  Pure additive migration. No existing column changes, no constraint
  loosening, no trigger changes. Existing data continues to behave
  identically because every new column has a safe default that maps to
  current behavior.

  ## Context

  German EPAL pool operators must distinguish two pallet billing models:

  - **Open exchange (Tausch)** = Sachdarlehen §607 BGB. The pallet swap
    itself carries NO VAT (BMF v. 05.11.2013). Only handling fees /
    rental are taxable.

  - **Deposit / rental (Pfand)** = taxable at 19% VAT (DE standard).

  Per OLG Düsseldorf / German tax authority guidance, mis-categorising a
  Tausch as a sale exposes the operator to back-audit (USt Nachforderung
  + 6%/yr interest). The system needs a per-partner flag so invoice
  generation can pick the right treatment automatically.

  ## What this migration adds

  1. `acc_contacts.clearing_model` (text NOT NULL DEFAULT 'deposit')
     Per-partner default. 'deposit' keeps every existing contact in the
     standard VAT-taxable mode (zero behavior change). Operators flip it
     to 'exchange' for partners they run an EPAL Palettenkonto with.

  2. `acc_invoice_items.vat_treatment` (text NOT NULL DEFAULT 'standard')
     Per-line VAT rule. 'standard' = use vat_rate as-is. Other values:
     - 'reverse_charge': intra-EU B2B reverse charge (vat_rate ignored, 0%)
     - 'exempt': domestic VAT exemption (vat_rate ignored, 0%)
     - 'sachdarlehen': open-exchange pallet swap §607 BGB (no VAT)
     - 'schadenersatz': damages / non-return compensation (no VAT)

  3. `acc_invoice_items.line_type` (text NULL)
     Optional categorisation for downstream DATEV/SAF-T/journal posting:
     'goods', 'transport', 'handling', 'pallet_deposit',
     'pallet_exchange', 'repair', 'other'. Nullable because we don't
     want to force a backfill of every existing line item.

  ## Safety

  - All three columns have defaults; no existing INSERT statement breaks.
  - VAT calculation logic in code is NOT changed by this migration. The
    new columns are written but ignored by current consumers. A follow-up
    PR wires them into `buildVatBreakdown()`.
  - CHECK constraints are conservative; only the documented enum values
    are accepted. Future values require a new migration.
  - Re-runnable: every ADD COLUMN uses IF NOT EXISTS / DO block.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'acc_contacts'
      AND column_name = 'clearing_model'
  ) THEN
    ALTER TABLE public.acc_contacts
      ADD COLUMN clearing_model text NOT NULL DEFAULT 'deposit'
      CHECK (clearing_model IN ('deposit', 'exchange'));
  END IF;
END $$;

COMMENT ON COLUMN public.acc_contacts.clearing_model IS
  'Pallet clearing model for this partner. "deposit" = pallets billed with VAT (Pfand). "exchange" = open EPAL pool swap, no VAT (Sachdarlehen §607 BGB).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'acc_invoice_items'
      AND column_name = 'vat_treatment'
  ) THEN
    ALTER TABLE public.acc_invoice_items
      ADD COLUMN vat_treatment text NOT NULL DEFAULT 'standard'
      CHECK (vat_treatment IN (
        'standard',
        'reverse_charge',
        'exempt',
        'sachdarlehen',
        'schadenersatz'
      ));
  END IF;
END $$;

COMMENT ON COLUMN public.acc_invoice_items.vat_treatment IS
  'Per-line VAT rule. "standard" applies vat_rate as-is. Other values force effective rate to 0 with a legal annotation on the printed invoice.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'acc_invoice_items'
      AND column_name = 'line_type'
  ) THEN
    ALTER TABLE public.acc_invoice_items
      ADD COLUMN line_type text NULL
      CHECK (line_type IS NULL OR line_type IN (
        'goods',
        'transport',
        'handling',
        'pallet_deposit',
        'pallet_exchange',
        'repair',
        'other'
      ));
  END IF;
END $$;

COMMENT ON COLUMN public.acc_invoice_items.line_type IS
  'Optional line categorisation for DATEV/SAF-T export and journal posting. Nullable to avoid backfill of existing rows.';
