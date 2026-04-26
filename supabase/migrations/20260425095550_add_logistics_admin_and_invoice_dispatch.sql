/*
  # Logistics Admin role + Invoice dispatch + Auto stock sync

  ## Summary
  Wires invoices, delivery notes, depot stock and notifications into a single
  end-to-end workflow.

  ## Schema changes
  1. profiles.role gains a new value: `logistics_admin`
  2. acc_invoices: adds `delivery_status`, `dispatched_to_logistics_at`,
     `dispatched_by`, `source_depot_id`
  3. acc_delivery_notes: adds `assigned_driver_id`, `assigned_logistics_admin_id`,
     `source_depot_id`, and accepts new statuses (`pending_dispatch`, `assigned`,
     `in_transit`, `delivered`, `confirmed`, plus the original draft/sent)
  4. acc_products: gains `depot_category_id` to map an invoice line back to a
     logistics stock category (so we can move pallets when a sale is recorded)
  5. notifications.type accepts new values: `invoice`, `dispatch`, `assignment`

  ## Automations
  - When an invoice's `delivery_status` becomes `pending`, we notify all
    logistics_admin users in the same company.
  - When a delivery note linked to an invoice is assigned to a driver, the
    invoice's `delivery_status` is updated to `assigned`, the driver and the
    company admin both get a notification.
  - When the linked delivery note is set to `in_transit`/`delivered`, the
    invoice mirrors that status.
  - When an invoice transitions to `sent` and has a `source_depot_id`,
    we create `stock_movements` rows for each line item that has a mapped
    `depot_category_id` and decrement the matching `stock` row.

  ## Security
  - All new columns inherit RLS from existing tables.
  - Triggers run with SECURITY DEFINER and an explicit search_path.
  - No data is deleted; all operations are idempotent and use IF NOT EXISTS.
*/

-- 1. Roles --------------------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
  ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
    CHECK (role = ANY (ARRAY[
      'super_admin'::text,
      'company_admin'::text,
      'depot_worker'::text,
      'driver'::text,
      'accountant'::text,
      'logistics_admin'::text
    ]));
END $$;

-- 2. Notifications types ------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type = ANY (ARRAY[
      'delivery_note'::text,
      'chat'::text,
      'stock'::text,
      'system'::text,
      'invoice'::text,
      'dispatch'::text,
      'assignment'::text
    ]));
END $$;

-- 3. acc_invoices columns -----------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='acc_invoices' AND column_name='delivery_status'
  ) THEN
    ALTER TABLE acc_invoices ADD COLUMN delivery_status text NOT NULL DEFAULT 'none'
      CHECK (delivery_status IN ('none','pending','assigned','in_transit','delivered','cancelled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='acc_invoices' AND column_name='dispatched_to_logistics_at'
  ) THEN
    ALTER TABLE acc_invoices ADD COLUMN dispatched_to_logistics_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='acc_invoices' AND column_name='dispatched_by'
  ) THEN
    ALTER TABLE acc_invoices ADD COLUMN dispatched_by uuid REFERENCES profiles(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='acc_invoices' AND column_name='source_depot_id'
  ) THEN
    ALTER TABLE acc_invoices ADD COLUMN source_depot_id uuid REFERENCES depots(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_acc_invoices_delivery_status ON acc_invoices(delivery_status);
CREATE INDEX IF NOT EXISTS idx_acc_invoices_source_depot ON acc_invoices(source_depot_id);

-- 4. acc_delivery_notes columns ----------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='acc_delivery_notes' AND column_name='assigned_driver_id'
  ) THEN
    ALTER TABLE acc_delivery_notes ADD COLUMN assigned_driver_id uuid REFERENCES profiles(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='acc_delivery_notes' AND column_name='assigned_logistics_admin_id'
  ) THEN
    ALTER TABLE acc_delivery_notes ADD COLUMN assigned_logistics_admin_id uuid REFERENCES profiles(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='acc_delivery_notes' AND column_name='source_depot_id'
  ) THEN
    ALTER TABLE acc_delivery_notes ADD COLUMN source_depot_id uuid REFERENCES depots(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='acc_delivery_notes' AND column_name='dispatched_at'
  ) THEN
    ALTER TABLE acc_delivery_notes ADD COLUMN dispatched_at timestamptz;
  END IF;
END $$;

-- Relax status check on acc_delivery_notes to support logistics workflow
DO $$
DECLARE
  c_name text;
BEGIN
  SELECT con.conname INTO c_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'acc_delivery_notes'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%status%';
  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE acc_delivery_notes DROP CONSTRAINT %I', c_name);
  END IF;
END $$;

ALTER TABLE acc_delivery_notes ADD CONSTRAINT acc_delivery_notes_status_check
  CHECK (status IN ('draft','sent','pending_dispatch','assigned','in_transit','delivered','confirmed','cancelled'));

CREATE INDEX IF NOT EXISTS idx_acc_dn_assigned_driver ON acc_delivery_notes(assigned_driver_id);
CREATE INDEX IF NOT EXISTS idx_acc_dn_status ON acc_delivery_notes(status);

-- 5. acc_products mapping -----------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='acc_products' AND column_name='depot_category_id'
  ) THEN
    ALTER TABLE acc_products ADD COLUMN depot_category_id uuid REFERENCES product_categories(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_acc_products_depot_category ON acc_products(depot_category_id);

-- 6. Helper: notify all logistics admins of a company -------------------------
CREATE OR REPLACE FUNCTION notify_logistics_admins(
  p_company_id uuid,
  p_title text,
  p_message text,
  p_type text,
  p_reference_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM profiles
    WHERE company_id = p_company_id
      AND role = 'logistics_admin'
      AND is_active = true
  LOOP
    INSERT INTO notifications(user_id, title, message, type, reference_id)
    VALUES (r.id, p_title, p_message, p_type, p_reference_id);
  END LOOP;
END $$;

-- 7. Trigger: invoice dispatch -> notify logistics ----------------------------
CREATE OR REPLACE FUNCTION acc_invoice_on_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE')
     AND COALESCE(OLD.delivery_status,'none') <> 'pending'
     AND NEW.delivery_status = 'pending' THEN
    PERFORM notify_logistics_admins(
      NEW.company_id,
      'Fatura e re per dergim',
      'Fatura ' || COALESCE(NEW.invoice_number,'') || ' u dergua ne logjistike per caktim shoferi.',
      'dispatch',
      NEW.id
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_acc_invoice_on_dispatch ON acc_invoices;
CREATE TRIGGER trg_acc_invoice_on_dispatch
  AFTER UPDATE OF delivery_status ON acc_invoices
  FOR EACH ROW
  EXECUTE FUNCTION acc_invoice_on_dispatch();

-- 8. Trigger: acc_delivery_notes assignment & status sync ---------------------
CREATE OR REPLACE FUNCTION acc_dn_sync_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_status text;
  v_invoice_number text;
  v_company_admin uuid;
BEGIN
  IF NEW.invoice_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Map delivery note status -> invoice delivery_status
  CASE NEW.status
    WHEN 'pending_dispatch' THEN v_invoice_status := 'pending';
    WHEN 'assigned'         THEN v_invoice_status := 'assigned';
    WHEN 'in_transit'       THEN v_invoice_status := 'in_transit';
    WHEN 'delivered'        THEN v_invoice_status := 'delivered';
    WHEN 'confirmed'        THEN v_invoice_status := 'delivered';
    WHEN 'cancelled'        THEN v_invoice_status := 'cancelled';
    ELSE v_invoice_status := NULL;
  END CASE;

  IF v_invoice_status IS NOT NULL THEN
    UPDATE acc_invoices
       SET delivery_status = v_invoice_status,
           updated_at = now()
     WHERE id = NEW.invoice_id
     RETURNING invoice_number INTO v_invoice_number;
  END IF;

  -- New driver assignment? Notify driver and company admins.
  IF (TG_OP = 'UPDATE')
     AND NEW.assigned_driver_id IS NOT NULL
     AND NEW.assigned_driver_id IS DISTINCT FROM OLD.assigned_driver_id THEN
    INSERT INTO notifications(user_id, title, message, type, reference_id)
    VALUES (
      NEW.assigned_driver_id,
      'Dergese e re e caktuar',
      'Ju keni nje dergese te re ' || COALESCE(NEW.note_number,'') ||
        CASE WHEN v_invoice_number IS NOT NULL
             THEN ' (Fatura ' || v_invoice_number || ')'
             ELSE '' END,
      'assignment',
      NEW.id
    );

    SELECT id INTO v_company_admin
    FROM profiles
    WHERE company_id = NEW.company_id AND role = 'company_admin' AND is_active = true
    LIMIT 1;
    IF v_company_admin IS NOT NULL THEN
      INSERT INTO notifications(user_id, title, message, type, reference_id)
      VALUES (
        v_company_admin,
        'Shoferi u caktua',
        'Logjistika caktoi shoferin per fletedergesen ' || COALESCE(NEW.note_number,''),
        'assignment',
        NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_acc_dn_sync_invoice ON acc_delivery_notes;
CREATE TRIGGER trg_acc_dn_sync_invoice
  AFTER INSERT OR UPDATE ON acc_delivery_notes
  FOR EACH ROW
  EXECUTE FUNCTION acc_dn_sync_invoice();

-- 9. Trigger: invoice -> sent decrements depot stock -------------------------
CREATE OR REPLACE FUNCTION acc_invoice_apply_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it RECORD;
  v_cat uuid;
  v_stock_id uuid;
  v_qty integer;
BEGIN
  IF NEW.source_depot_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE')
     AND COALESCE(OLD.status,'') <> 'sent'
     AND NEW.status = 'sent' THEN

    FOR it IN
      SELECT ii.product_id, ii.quantity, p.depot_category_id
      FROM acc_invoice_items ii
      LEFT JOIN acc_products p ON p.id = ii.product_id
      WHERE ii.invoice_id = NEW.id
    LOOP
      v_cat := it.depot_category_id;
      v_qty := COALESCE(it.quantity, 0)::integer;
      IF v_cat IS NULL OR v_qty <= 0 THEN
        CONTINUE;
      END IF;

      INSERT INTO stock_movements(
        company_id, depot_id, category_id, movement_type, quantity,
        condition_before, condition_after, notes, performed_by
      ) VALUES (
        NEW.company_id, NEW.source_depot_id, v_cat, 'exit', v_qty,
        'good', 'good',
        'Auto: shitje fature ' || COALESCE(NEW.invoice_number,''),
        COALESCE(NEW.dispatched_by, NEW.created_by)
      );

      SELECT id INTO v_stock_id
      FROM stock
      WHERE company_id = NEW.company_id
        AND depot_id = NEW.source_depot_id
        AND category_id = v_cat
        AND condition = 'good'
      LIMIT 1;

      IF v_stock_id IS NOT NULL THEN
        UPDATE stock
           SET quantity = GREATEST(0, quantity - v_qty),
               updated_at = now()
         WHERE id = v_stock_id;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_acc_invoice_apply_stock ON acc_invoices;
CREATE TRIGGER trg_acc_invoice_apply_stock
  AFTER UPDATE OF status ON acc_invoices
  FOR EACH ROW
  EXECUTE FUNCTION acc_invoice_apply_stock_movement();

-- 10. Allow logistics_admin to view & update needed tables --------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='acc_invoices' AND policyname='Logistics admins read company invoices'
  ) THEN
    CREATE POLICY "Logistics admins read company invoices"
      ON acc_invoices FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
            AND p.role = 'logistics_admin'
            AND p.company_id = acc_invoices.company_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='acc_delivery_notes' AND policyname='Logistics admins read company delivery notes'
  ) THEN
    CREATE POLICY "Logistics admins read company delivery notes"
      ON acc_delivery_notes FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('logistics_admin','company_admin','accountant','driver')
            AND p.company_id = acc_delivery_notes.company_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='acc_delivery_notes' AND policyname='Logistics admins update company delivery notes'
  ) THEN
    CREATE POLICY "Logistics admins update company delivery notes"
      ON acc_delivery_notes FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('logistics_admin','company_admin')
            AND p.company_id = acc_delivery_notes.company_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('logistics_admin','company_admin')
            AND p.company_id = acc_delivery_notes.company_id
        )
      );
  END IF;
END $$;
