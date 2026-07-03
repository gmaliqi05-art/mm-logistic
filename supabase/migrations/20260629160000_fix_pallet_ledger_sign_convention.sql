/*
  # Fix inverted pallet-ledger sign convention (A-C1 from DEEP_AUDIT)

  `pallet_accounts` documents the convention "positive current_balance =
  partner owes us" (`20260504114724`), and both the statement PDF
  (`generate-pallet-statement:212` → `running > 0 → partnerOwesUs`) and the
  UI read balances that way. `apply_pallet_transaction` maps `in → +qty`,
  `out → -qty` — i.e. `in` = the partner's debt to us goes UP, `out` = it
  goes DOWN. That mapping is correct for a receivable-style ledger.

  The bug was in the WRITER, `auto_pallet_ledger_on_delivery`: it recorded
  `pallets_delivered` (we hand our pallets to the partner → the partner now
  owes us MORE) as `direction='out'` (which DECREASES the balance), and
  `pallets_returned` (partner gives our pallets back → they owe us LESS) as
  `direction='in'`. Every delivery therefore pushed the balance the wrong
  way, so every Saldenbestätigung showed debtor/creditor reversed, and it
  contradicted the manually-entered `opening_balance` (which uses the
  documented "positive = owes us" convention).

  Fix, in two parts:
  1. Swap the two direction literals in the writer so `pallets_delivered →
     'in'` (+) and `pallets_returned → 'out'` (-). Everything else
     (apply_pallet_transaction, the statement, the aging view, the UI) is
     already consistent with the documented convention and is left
     untouched.
  2. Correct existing auto-generated ledger rows. The statement recomputes
     its running total from the *transaction directions* (not the stored
     current_balance), so the direction on historical auto rows must be
     flipped too — not just the cached balance. We flip direction only on
     rows created by the delivery trigger (`delivery_note_id IS NOT NULL`),
     leaving any manual `in`/`out` entries and all `adjustment` rows alone,
     then recompute every account's current_balance from
     opening_balance + Σ(signed deltas).

  NOTE: any `pallet_reconciliations` signed BEFORE this migration recorded a
  `confirmed_balance` under the old (inverted) sign; those historical signed
  documents are intentionally not rewritten.
*/

-- 1. Writer fix: deliver → 'in' (+, partner owes us more), return → 'out' (-).
CREATE OR REPLACE FUNCTION public.auto_pallet_ledger_on_delivery()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_account_id uuid;
  v_partner    uuid;
  v_type       text;
  v_condition  text;
BEGIN
  IF (NEW.status NOT IN ('delivered','confirmed')) OR NEW.pallet_ledger_applied THEN
    RETURN NEW;
  END IF;

  v_partner := NEW.partner_id;
  v_type    := COALESCE(NEW.pallet_type, 'EPAL');

  IF v_partner IS NULL OR (COALESCE(NEW.pallets_delivered,0) = 0 AND COALESCE(NEW.pallets_returned,0) = 0) THEN
    RETURN NEW;
  END IF;

  SELECT CASE
           WHEN COUNT(*) FILTER (WHERE mapped_class IS NOT NULL) > 0
            AND COUNT(DISTINCT mapped_class) FILTER (WHERE mapped_class IS NOT NULL) = 1
           THEN MIN(mapped_class) FILTER (WHERE mapped_class IS NOT NULL)
           ELSE NULL
         END
    INTO v_condition
    FROM (
      SELECT CASE
               WHEN quality_class IN ('A', 'NEU')           THEN 'A'
               WHEN quality_class = 'B'                     THEN 'B'
               WHEN quality_class = 'C'                     THEN 'C'
               WHEN quality_class IN ('REPAIR_NEEDED', 'SCRAP') THEN 'Defekt'
               ELSE NULL
             END AS mapped_class
        FROM delivery_note_items
       WHERE delivery_note_id = NEW.id
         AND category_id IS NOT NULL
         AND quantity > 0
    ) sub;

  INSERT INTO pallet_accounts (company_id, partner_contact_id, pallet_type)
  VALUES (NEW.company_id, v_partner, v_type)
  ON CONFLICT (company_id, partner_contact_id, pallet_type) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_account_id;

  IF v_account_id IS NULL THEN
    SELECT id INTO v_account_id FROM pallet_accounts
      WHERE company_id = NEW.company_id AND partner_contact_id = v_partner AND pallet_type = v_type;
  END IF;

  -- We delivered our pallets to the partner → they now hold (owe us) more.
  IF COALESCE(NEW.pallets_delivered,0) > 0 THEN
    INSERT INTO pallet_account_transactions
      (company_id, pallet_account_id, delivery_note_id, direction, quantity, pallet_type, condition, reference, created_by)
    VALUES
      (NEW.company_id, v_account_id, NEW.id, 'in', NEW.pallets_delivered, v_type, v_condition,
       COALESCE(NEW.note_number, NEW.id::text), NEW.assigned_driver_id);
  END IF;

  -- Partner returned our pallets → they owe us less.
  IF COALESCE(NEW.pallets_returned,0) > 0 THEN
    INSERT INTO pallet_account_transactions
      (company_id, pallet_account_id, delivery_note_id, direction, quantity, pallet_type, condition, reference, created_by)
    VALUES
      (NEW.company_id, v_account_id, NEW.id, 'out', NEW.pallets_returned, v_type, v_condition,
       COALESCE(NEW.note_number, NEW.id::text), NEW.assigned_driver_id);
  END IF;

  UPDATE delivery_notes SET pallet_ledger_applied = true WHERE id = NEW.id;

  RETURN NEW;
END $function$;

-- 2a. Flip direction on historical auto-generated rows (statement reads
--     direction, so this is required for past statements to read correctly).
UPDATE pallet_account_transactions
SET direction = CASE direction
                  WHEN 'in'  THEN 'out'
                  WHEN 'out' THEN 'in'
                  ELSE direction
                END
WHERE delivery_note_id IS NOT NULL
  AND direction IN ('in','out');

-- 2b. Recompute every account's cached balance from opening + signed deltas.
UPDATE pallet_accounts pa
SET current_balance = pa.opening_balance + COALESCE((
      SELECT SUM(CASE t.direction
                   WHEN 'in'  THEN t.quantity
                   WHEN 'out' THEN -t.quantity
                   ELSE t.quantity
                 END)
      FROM pallet_account_transactions t
      WHERE t.pallet_account_id = pa.id
    ), 0),
    updated_at = now();
