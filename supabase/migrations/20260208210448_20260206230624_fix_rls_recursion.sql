/*
  # Fix RLS Policy Recursion

  The profiles table policies reference the profiles table itself,
  causing infinite recursion during auth. This migration:
  
  1. Creates a SECURITY DEFINER function to get user role without RLS
  2. Creates a SECURITY DEFINER function to get user company_id without RLS
  3. Drops all existing policies on all tables
  4. Recreates policies using the helper functions instead of subqueries on profiles
*/

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_user_depot_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT depot_id FROM profiles WHERE id = auth.uid();
$$;

-- Drop ALL existing policies

DO $$ 
DECLARE 
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname, tablename 
    FROM pg_policies 
    WHERE schemaname = 'public'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- PROFILES POLICIES (no self-referencing)
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles_select_super_admin" ON profiles FOR SELECT TO authenticated
  USING (public.get_user_role() = 'super_admin');

CREATE POLICY "profiles_select_same_company" ON profiles FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id() AND public.get_user_company_id() IS NOT NULL);

CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_super_admin" ON profiles FOR UPDATE TO authenticated
  USING (public.get_user_role() = 'super_admin')
  WITH CHECK (public.get_user_role() = 'super_admin');

CREATE POLICY "profiles_delete_super_admin" ON profiles FOR DELETE TO authenticated
  USING (public.get_user_role() = 'super_admin');

-- COMPANIES POLICIES
CREATE POLICY "companies_select_super_admin" ON companies FOR SELECT TO authenticated
  USING (public.get_user_role() = 'super_admin');

CREATE POLICY "companies_select_member" ON companies FOR SELECT TO authenticated
  USING (id = public.get_user_company_id());

CREATE POLICY "companies_insert_super_admin" ON companies FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() = 'super_admin');

CREATE POLICY "companies_update_super_admin" ON companies FOR UPDATE TO authenticated
  USING (public.get_user_role() = 'super_admin')
  WITH CHECK (public.get_user_role() = 'super_admin');

CREATE POLICY "companies_delete_super_admin" ON companies FOR DELETE TO authenticated
  USING (public.get_user_role() = 'super_admin');

-- DEPOTS POLICIES
CREATE POLICY "depots_select_super_admin" ON depots FOR SELECT TO authenticated
  USING (public.get_user_role() = 'super_admin');

CREATE POLICY "depots_select_company_member" ON depots FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());

CREATE POLICY "depots_insert_admin" ON depots FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role() = 'super_admin' 
    OR (public.get_user_role() = 'company_admin' AND company_id = public.get_user_company_id())
  );

CREATE POLICY "depots_update_admin" ON depots FOR UPDATE TO authenticated
  USING (public.get_user_role() = 'super_admin' OR (public.get_user_role() = 'company_admin' AND company_id = public.get_user_company_id()))
  WITH CHECK (public.get_user_role() = 'super_admin' OR (public.get_user_role() = 'company_admin' AND company_id = public.get_user_company_id()));

CREATE POLICY "depots_delete_admin" ON depots FOR DELETE TO authenticated
  USING (public.get_user_role() = 'super_admin' OR (public.get_user_role() = 'company_admin' AND company_id = public.get_user_company_id()));

-- PRODUCT CATEGORIES POLICIES
CREATE POLICY "categories_select" ON product_categories FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id() OR public.get_user_role() = 'super_admin');

CREATE POLICY "categories_insert_admin" ON product_categories FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() = 'super_admin' OR (public.get_user_role() = 'company_admin' AND company_id = public.get_user_company_id()));

CREATE POLICY "categories_update_admin" ON product_categories FOR UPDATE TO authenticated
  USING (public.get_user_role() = 'super_admin' OR (public.get_user_role() = 'company_admin' AND company_id = public.get_user_company_id()))
  WITH CHECK (public.get_user_role() = 'super_admin' OR (public.get_user_role() = 'company_admin' AND company_id = public.get_user_company_id()));

CREATE POLICY "categories_delete_admin" ON product_categories FOR DELETE TO authenticated
  USING (public.get_user_role() = 'super_admin' OR (public.get_user_role() = 'company_admin' AND company_id = public.get_user_company_id()));

-- STOCK POLICIES
CREATE POLICY "stock_select" ON stock FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id() OR public.get_user_role() = 'super_admin');

CREATE POLICY "stock_insert" ON stock FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() IN ('super_admin', 'company_admin', 'depot_worker') AND (company_id = public.get_user_company_id() OR public.get_user_role() = 'super_admin'));

CREATE POLICY "stock_update" ON stock FOR UPDATE TO authenticated
  USING (public.get_user_role() IN ('super_admin', 'company_admin', 'depot_worker') AND (company_id = public.get_user_company_id() OR public.get_user_role() = 'super_admin'))
  WITH CHECK (public.get_user_role() IN ('super_admin', 'company_admin', 'depot_worker') AND (company_id = public.get_user_company_id() OR public.get_user_role() = 'super_admin'));

CREATE POLICY "stock_delete" ON stock FOR DELETE TO authenticated
  USING (public.get_user_role() = 'super_admin' OR (public.get_user_role() = 'company_admin' AND company_id = public.get_user_company_id()));

-- STOCK MOVEMENTS POLICIES
CREATE POLICY "movements_select" ON stock_movements FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id() OR public.get_user_role() = 'super_admin');

CREATE POLICY "movements_insert" ON stock_movements FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() IN ('super_admin', 'company_admin', 'depot_worker') AND (company_id = public.get_user_company_id() OR public.get_user_role() = 'super_admin'));

CREATE POLICY "movements_update" ON stock_movements FOR UPDATE TO authenticated
  USING (public.get_user_role() IN ('super_admin', 'company_admin', 'depot_worker') AND (company_id = public.get_user_company_id() OR public.get_user_role() = 'super_admin'))
  WITH CHECK (public.get_user_role() IN ('super_admin', 'company_admin', 'depot_worker') AND (company_id = public.get_user_company_id() OR public.get_user_role() = 'super_admin'));

CREATE POLICY "movements_delete" ON stock_movements FOR DELETE TO authenticated
  USING (public.get_user_role() = 'super_admin' OR (public.get_user_role() = 'company_admin' AND company_id = public.get_user_company_id()));

-- DELIVERY NOTES POLICIES
CREATE POLICY "dnotes_select" ON delivery_notes FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id() OR public.get_user_role() = 'super_admin');

CREATE POLICY "dnotes_insert" ON delivery_notes FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id() OR public.get_user_role() = 'super_admin');

CREATE POLICY "dnotes_update" ON delivery_notes FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id() OR public.get_user_role() = 'super_admin')
  WITH CHECK (company_id = public.get_user_company_id() OR public.get_user_role() = 'super_admin');

CREATE POLICY "dnotes_delete" ON delivery_notes FOR DELETE TO authenticated
  USING (public.get_user_role() = 'super_admin' OR (public.get_user_role() = 'company_admin' AND company_id = public.get_user_company_id()));

-- DELIVERY NOTE ITEMS POLICIES
CREATE POLICY "dnitems_select" ON delivery_note_items FOR SELECT TO authenticated
  USING (
    delivery_note_id IN (SELECT dn.id FROM delivery_notes dn WHERE dn.company_id = public.get_user_company_id())
    OR public.get_user_role() = 'super_admin'
  );

CREATE POLICY "dnitems_insert" ON delivery_note_items FOR INSERT TO authenticated
  WITH CHECK (
    delivery_note_id IN (SELECT dn.id FROM delivery_notes dn WHERE dn.company_id = public.get_user_company_id())
    OR public.get_user_role() = 'super_admin'
  );

CREATE POLICY "dnitems_update" ON delivery_note_items FOR UPDATE TO authenticated
  USING (delivery_note_id IN (SELECT dn.id FROM delivery_notes dn WHERE dn.company_id = public.get_user_company_id()) OR public.get_user_role() = 'super_admin')
  WITH CHECK (delivery_note_id IN (SELECT dn.id FROM delivery_notes dn WHERE dn.company_id = public.get_user_company_id()) OR public.get_user_role() = 'super_admin');

CREATE POLICY "dnitems_delete" ON delivery_note_items FOR DELETE TO authenticated
  USING (delivery_note_id IN (SELECT dn.id FROM delivery_notes dn WHERE dn.company_id = public.get_user_company_id()) OR public.get_user_role() = 'super_admin');

-- CHAT ROOMS POLICIES
CREATE POLICY "chatrooms_select" ON chat_rooms FOR SELECT TO authenticated
  USING (
    id IN (SELECT cp.room_id FROM chat_participants cp WHERE cp.user_id = auth.uid())
    OR public.get_user_role() = 'super_admin'
  );

CREATE POLICY "chatrooms_insert" ON chat_rooms FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "chatrooms_update" ON chat_rooms FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.get_user_role() = 'super_admin')
  WITH CHECK (created_by = auth.uid() OR public.get_user_role() = 'super_admin');

CREATE POLICY "chatrooms_delete" ON chat_rooms FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.get_user_role() = 'super_admin');

-- CHAT PARTICIPANTS POLICIES
CREATE POLICY "chatpart_select" ON chat_participants FOR SELECT TO authenticated
  USING (
    room_id IN (SELECT cp2.room_id FROM chat_participants cp2 WHERE cp2.user_id = auth.uid())
    OR public.get_user_role() = 'super_admin'
  );

CREATE POLICY "chatpart_insert" ON chat_participants FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "chatpart_delete" ON chat_participants FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR room_id IN (SELECT cr.id FROM chat_rooms cr WHERE cr.created_by = auth.uid())
    OR public.get_user_role() = 'super_admin'
  );

-- CHAT MESSAGES POLICIES
CREATE POLICY "chatmsg_select" ON chat_messages FOR SELECT TO authenticated
  USING (
    room_id IN (SELECT cp.room_id FROM chat_participants cp WHERE cp.user_id = auth.uid())
    OR public.get_user_role() = 'super_admin'
  );

CREATE POLICY "chatmsg_insert" ON chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND room_id IN (SELECT cp.room_id FROM chat_participants cp WHERE cp.user_id = auth.uid())
  );

CREATE POLICY "chatmsg_update" ON chat_messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid()) WITH CHECK (sender_id = auth.uid());

CREATE POLICY "chatmsg_delete" ON chat_messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid() OR public.get_user_role() = 'super_admin');

-- NOTIFICATIONS POLICIES
CREATE POLICY "notif_select" ON notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.get_user_role() = 'super_admin');

CREATE POLICY "notif_insert" ON notifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "notif_update" ON notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "notif_delete" ON notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.get_user_role() = 'super_admin');