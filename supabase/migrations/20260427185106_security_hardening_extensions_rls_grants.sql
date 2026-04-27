/*
  # Security hardening: extensions, RLS, storage policies, function grants

  ## Pershkrim
  Ky migration adreson disa gjetje sigurie:
  1. Spostimi i ekstensionit `pg_trgm` jashte `public` ne skemen `extensions`
  2. Forcimi i politikes RLS `notif_insert` ne `notifications` (nuk eshte me TRUE)
  3. Heqja e politikave SELECT shume te gjera ne bucket-et publike `avatars`
     dhe `product-images` (URL-te publike vazhdojne te funksionojne)
  4. Revoke EXECUTE nga `anon` per te gjitha funksionet SECURITY DEFINER
  5. Revoke EXECUTE nga `authenticated` per funksionet trigger-only
     (helper-at e RLS-se mbeten te ekzekutueshem nga `authenticated`)

  ## Shenim
  - Aktivizimi i "Leaked Password Protection" eshte konfigurim Auth ne
    Supabase Dashboard, jo SQL — duhet aktivizuar manualisht.
*/

-- 1. Move pg_trgm to a dedicated extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_trgm' AND n.nspname = 'public'
  ) THEN
    EXECUTE 'ALTER EXTENSION pg_trgm SET SCHEMA extensions';
  END IF;
END $$;

-- Ensure search_path can still find pg_trgm operators when needed
ALTER DATABASE postgres SET search_path = "$user", public, extensions;

-- 2. Tighten notifications insert policy (was always TRUE)
DROP POLICY IF EXISTS notif_insert ON public.notifications;
CREATE POLICY notif_insert ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles me
      JOIN public.profiles target ON target.id = public.notifications.user_id
      WHERE me.id = auth.uid()
        AND me.company_id IS NOT NULL
        AND me.company_id = target.company_id
    )
  );

-- 3. Drop overly broad SELECT policies on storage objects for public buckets
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS product_images_read ON storage.objects;

-- 4 + 5. Lock down SECURITY DEFINER function execute privileges
-- Helper category (called from RLS): keep authenticated, drop anon
DO $$
DECLARE
  f text;
  helpers text[] := ARRAY[
    'public.company_has_accounting(uuid)',
    'public.company_has_logistics(uuid)',
    'public.get_document_company_id(uuid)',
    'public.get_my_company_id()',
    'public.get_next_acc_number(uuid, text)',
    'public.get_user_chat_room_ids()',
    'public.get_user_company_chat_room_ids()',
    'public.get_user_company_id()',
    'public.get_user_company_id_safe()',
    'public.get_user_depot_id()',
    'public.get_user_role()',
    'public.get_user_role_and_company()',
    'public.is_chat_room_creator(uuid)',
    'public.is_chat_room_member(uuid, uuid)',
    'public.is_document_recipient(uuid)',
    'public.is_document_sender(uuid)',
    'public.is_super_admin()',
    'public.is_super_admin_safe()',
    'public.notify_logistics_admins(uuid, text, text, text, uuid)'
  ];
BEGIN
  FOREACH f IN ARRAY helpers LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXCEPTION WHEN undefined_function THEN
      -- function may not exist with that exact signature; skip
      NULL;
    END;
  END LOOP;
END $$;

-- Trigger-only / system-only category: revoke from PUBLIC, anon, authenticated
DO $$
DECLARE
  f text;
  triggers text[] := ARRAY[
    'public.acc_dn_sync_invoice()',
    'public.acc_handle_invoice_stock()',
    'public.acc_handle_purchase_stock()',
    'public.acc_invoice_apply_stock_movement()',
    'public.acc_invoice_on_dispatch()',
    'public.acc_products_seed_stock_row()',
    'public.acc_products_sync_to_depot()',
    'public.auto_assign_free_trial()',
    'public.category_products_notify_accounting()',
    'public.chat_messages_notify()',
    'public.cleanup_inactive_push_subscriptions()',
    'public.delivery_notes_notify()',
    'public.log_document_upload()',
    'public.process_delivery_note_stock()',
    'public.set_company_country_id()',
    'public.sync_acc_product_category_to_company()',
    'public.sync_acc_product_category_to_logistics()',
    'public.sync_acc_product_to_company()',
    'public.sync_acc_product_to_logistics()',
    'public.sync_category_product_to_acc()',
    'public.sync_product_category_to_acc()'
  ];
BEGIN
  FOREACH f IN ARRAY triggers LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END LOOP;
END $$;
