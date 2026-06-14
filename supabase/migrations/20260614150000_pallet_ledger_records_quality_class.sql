/*
  # M4: record EPAL quality class on pallet_account_transactions

  ## Why
  `auto_pallet_ledger_on_delivery` (canonical body in migration
  20260508095640) inserts rows into `pallet_account_transactions`
  without ever populating the `condition` column (CHECK: NULL or in
  'A','B','C','Defekt'). The ledger therefore tracks counts but not
  EPAL grade, which makes per-class valuation, sorting decisions and
  Bonner-protocol reconciliation impossible without a manual lookup
  back to `delivery_note_items`.

  PR #201 (K5) and #202 (K6) made sure `delivery_note_items.quality_class`
  is filled and internally consistent, so the trigger can now derive
  a single EPAL grade for a whole delivery whenever the items agree.

  ## What this changes
  - Rewrite `auto_pallet_ledger_on_delivery` to compute a per-delivery
    `v_condition` from `delivery_note_items.quality_class`:

      All items map to 'A' (covers quality_class IN ('A', 'NEU')) → 'A'
      All items map to 'B'                                       → 'B'
      All items map to 'C'                                       → 'C'
      All items map to 'Defekt' (REPAIR_NEEDED, SCRAP)           → 'Defekt'
      Mixed classes, UNSORTED, or all NULL                       → NULL

  - That value is inserted into both the 'out' and 'in' ledger rows.
    Mixed/unsorted deliveries keep NULL — they're still recorded so
    the count is right; only the grade is left unspecified until an
    operator classifies them.

  ## Safety
  - No schema changes; only the trigger function body is replaced.
  - Function retains SECURITY DEFINER, search_path = public, and
    identical signature.
  - All existing behaviour (early return when partner_id IS NULL,
    pallet_ledger_applied guard, in/out direction, ledger upsert) is
    preserved exactly.
  - Current prod has 4 ledger rows, all with `condition IS NULL`; new
    inserts that don't satisfy a single-class condition will continue
    to land with NULL, matching the prior behaviour.
*/

CREATE OR REPLACE FUNCTION public.auto_pallet_ledger_on_delivery()
 RETURNS TRIGGER
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
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

  -- Derive a single EPAL grade for this delivery iff every item agrees
  -- on a non-null mapping. Mixed, unsorted, or unclassified deliveries
  -- leave the legacy `condition` NULL (unchanged from previous behaviour).
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

  IF COALESCE(NEW.pallets_delivered,0) > 0 THEN
    INSERT INTO pallet_account_transactions
      (company_id, pallet_account_id, delivery_note_id, direction, quantity, pallet_type, condition, reference, created_by)
    VALUES
      (NEW.company_id, v_account_id, NEW.id, 'out', NEW.pallets_delivered, v_type, v_condition,
       COALESCE(NEW.note_number, NEW.id::text), NEW.assigned_driver_id);
  END IF;

  IF COALESCE(NEW.pallets_returned,0) > 0 THEN
    INSERT INTO pallet_account_transactions
      (company_id, pallet_account_id, delivery_note_id, direction, quantity, pallet_type, condition, reference, created_by)
    VALUES
      (NEW.company_id, v_account_id, NEW.id, 'in', NEW.pallets_returned, v_type, v_condition,
       COALESCE(NEW.note_number, NEW.id::text), NEW.assigned_driver_id);
  END IF;

  UPDATE delivery_notes SET pallet_ledger_applied = true WHERE id = NEW.id;

  RETURN NEW;
END $function$;
