/*
  # Shto kolonen `kind` te acc_delivery_notes

  ## Permbledhje
  Shton kolonen `kind` qe klasifikon fletedergesen e kontabilitetit ne 5 lloje:
  - sale: Shitje / dalje te klienti
  - purchase_receipt: Pranim nga furnizuesi
  - transfer: Transfer midis depo-ve
  - return_in: Kthim nga klienti
  - return_out: Kthim te furnizuesi

  ## Ndryshime
  1. Kolone e re `kind text NOT NULL DEFAULT 'sale'`
  2. CHECK constraint per 5 vlerat
  3. Backfill i regjistrimeve ekzistuese:
     - direction='outgoing' => kind='sale'
     - direction='incoming' => kind='purchase_receipt'

  ## Siguria
  - Asnje ndryshim ne RLS; trashegon politikat ekzistuese te acc_delivery_notes
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acc_delivery_notes' AND column_name = 'kind'
  ) THEN
    ALTER TABLE acc_delivery_notes
      ADD COLUMN kind text NOT NULL DEFAULT 'sale';
  END IF;
END $$;

UPDATE acc_delivery_notes
SET kind = CASE
  WHEN direction = 'incoming' THEN 'purchase_receipt'
  ELSE 'sale'
END
WHERE kind = 'sale';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'acc_delivery_notes' AND constraint_name = 'acc_delivery_notes_kind_check'
  ) THEN
    ALTER TABLE acc_delivery_notes
      ADD CONSTRAINT acc_delivery_notes_kind_check
      CHECK (kind IN ('sale', 'purchase_receipt', 'transfer', 'return_in', 'return_out'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_acc_delivery_notes_kind
  ON acc_delivery_notes(company_id, kind);
