/*
  # Enable RLS and Create Security Policies

  1. Security
    - Enable RLS on ALL tables
    - Create role-based access policies
    - Super admins can access everything
    - Company admins manage their company data
    - Depot workers manage depot-level data
    - Drivers access their assigned data
*/

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE depots ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_note_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- PROFILES POLICIES
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles_select_super_admin" ON profiles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

CREATE POLICY "profiles_select_same_company" ON profiles FOR SELECT TO authenticated
  USING (company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid() AND p.company_id IS NOT NULL));

CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_super_admin" ON profiles FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

CREATE POLICY "profiles_delete_super_admin" ON profiles FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

-- COMPANIES POLICIES
CREATE POLICY "companies_select_super_admin" ON companies FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

CREATE POLICY "companies_select_member" ON companies FOR SELECT TO authenticated
  USING (id IN (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()));

CREATE POLICY "companies_insert_super_admin" ON companies FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

CREATE POLICY "companies_update_super_admin" ON companies FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

CREATE POLICY "companies_delete_super_admin" ON companies FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

-- DEPOTS POLICIES
CREATE POLICY "depots_select_super_admin" ON depots FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

CREATE POLICY "depots_select_company_member" ON depots FOR SELECT TO authenticated
  USING (company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()));

CREATE POLICY "depots_insert_admin" ON depots FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (p.role = 'super_admin' OR (p.role = 'company_admin' AND p.company_id = company_id)))
  );

CREATE POLICY "depots_update_admin" ON depots FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (p.role = 'super_admin' OR (p.role = 'company_admin' AND p.company_id = depots.company_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (p.role = 'super_admin' OR (p.role = 'company_admin' AND p.company_id = company_id))));

CREATE POLICY "depots_delete_admin" ON depots FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (p.role = 'super_admin' OR (p.role = 'company_admin' AND p.company_id = depots.company_id))));

-- PRODUCT CATEGORIES POLICIES
CREATE POLICY "categories_select" ON product_categories FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

CREATE POLICY "categories_insert_admin" ON product_categories FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (p.role = 'super_admin' OR (p.role = 'company_admin' AND p.company_id = company_id))));

CREATE POLICY "categories_update_admin" ON product_categories FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (p.role = 'super_admin' OR (p.role = 'company_admin' AND p.company_id = product_categories.company_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (p.role = 'super_admin' OR (p.role = 'company_admin' AND p.company_id = company_id))));

CREATE POLICY "categories_delete_admin" ON product_categories FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (p.role = 'super_admin' OR (p.role = 'company_admin' AND p.company_id = product_categories.company_id))));

-- STOCK POLICIES
CREATE POLICY "stock_select" ON stock FOR SELECT TO authenticated
  USING (company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

CREATE POLICY "stock_insert" ON stock FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'company_admin', 'depot_worker') AND (p.company_id = company_id OR p.role = 'super_admin')));

CREATE POLICY "stock_update" ON stock FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'company_admin', 'depot_worker') AND (p.company_id = stock.company_id OR p.role = 'super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'company_admin', 'depot_worker') AND (p.company_id = company_id OR p.role = 'super_admin')));

CREATE POLICY "stock_delete" ON stock FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (p.role = 'super_admin' OR (p.role = 'company_admin' AND p.company_id = stock.company_id))));

-- STOCK MOVEMENTS POLICIES
CREATE POLICY "movements_select" ON stock_movements FOR SELECT TO authenticated
  USING (company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

CREATE POLICY "movements_insert" ON stock_movements FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'company_admin', 'depot_worker') AND (p.company_id = company_id OR p.role = 'super_admin')));

CREATE POLICY "movements_update" ON stock_movements FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'company_admin', 'depot_worker') AND (p.company_id = stock_movements.company_id OR p.role = 'super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'company_admin', 'depot_worker') AND (p.company_id = company_id OR p.role = 'super_admin')));

CREATE POLICY "movements_delete" ON stock_movements FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (p.role = 'super_admin' OR (p.role = 'company_admin' AND p.company_id = stock_movements.company_id))));

-- DELIVERY NOTES POLICIES
CREATE POLICY "dnotes_select" ON delivery_notes FOR SELECT TO authenticated
  USING (company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

CREATE POLICY "dnotes_insert" ON delivery_notes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (p.company_id = company_id OR p.role = 'super_admin')));

CREATE POLICY "dnotes_update" ON delivery_notes FOR UPDATE TO authenticated
  USING (company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'))
  WITH CHECK (company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

CREATE POLICY "dnotes_delete" ON delivery_notes FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (p.role = 'super_admin' OR (p.role = 'company_admin' AND p.company_id = delivery_notes.company_id))));

-- DELIVERY NOTE ITEMS POLICIES
CREATE POLICY "dnitems_select" ON delivery_note_items FOR SELECT TO authenticated
  USING (
    delivery_note_id IN (SELECT dn.id FROM delivery_notes dn WHERE dn.company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()))
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

CREATE POLICY "dnitems_insert" ON delivery_note_items FOR INSERT TO authenticated
  WITH CHECK (
    delivery_note_id IN (SELECT dn.id FROM delivery_notes dn WHERE dn.company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()))
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

CREATE POLICY "dnitems_update" ON delivery_note_items FOR UPDATE TO authenticated
  USING (delivery_note_id IN (SELECT dn.id FROM delivery_notes dn WHERE dn.company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())) OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'))
  WITH CHECK (delivery_note_id IN (SELECT dn.id FROM delivery_notes dn WHERE dn.company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())) OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

CREATE POLICY "dnitems_delete" ON delivery_note_items FOR DELETE TO authenticated
  USING (delivery_note_id IN (SELECT dn.id FROM delivery_notes dn WHERE dn.company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())) OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

-- CHAT ROOMS POLICIES
CREATE POLICY "chatrooms_select" ON chat_rooms FOR SELECT TO authenticated
  USING (
    id IN (SELECT cp.room_id FROM chat_participants cp WHERE cp.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

CREATE POLICY "chatrooms_insert" ON chat_rooms FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "chatrooms_update" ON chat_rooms FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'))
  WITH CHECK (created_by = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

CREATE POLICY "chatrooms_delete" ON chat_rooms FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

-- CHAT PARTICIPANTS POLICIES
CREATE POLICY "chatpart_select" ON chat_participants FOR SELECT TO authenticated
  USING (
    room_id IN (SELECT cp2.room_id FROM chat_participants cp2 WHERE cp2.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

CREATE POLICY "chatpart_insert" ON chat_participants FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY "chatpart_delete" ON chat_participants FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR room_id IN (SELECT cr.id FROM chat_rooms cr WHERE cr.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- CHAT MESSAGES POLICIES
CREATE POLICY "chatmsg_select" ON chat_messages FOR SELECT TO authenticated
  USING (
    room_id IN (SELECT cp.room_id FROM chat_participants cp WHERE cp.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

CREATE POLICY "chatmsg_insert" ON chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND room_id IN (SELECT cp.room_id FROM chat_participants cp WHERE cp.user_id = auth.uid())
  );

CREATE POLICY "chatmsg_update" ON chat_messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid()) WITH CHECK (sender_id = auth.uid());

CREATE POLICY "chatmsg_delete" ON chat_messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

-- NOTIFICATIONS POLICIES
CREATE POLICY "notif_select" ON notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

CREATE POLICY "notif_insert" ON notifications FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()));

CREATE POLICY "notif_update" ON notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "notif_delete" ON notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));