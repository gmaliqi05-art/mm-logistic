/*
  # Heqja e RLS helper-eve nga skema `public`

  ## Pershkrim
  Funksionet ndihmese `SECURITY DEFINER` qe perdoren brenda politikave RLS
  ndodheshin ne `public`, ku PostgREST i ekspozonte automatikisht si RPC.
  Per t'i hequr nga API publike pa demtuar RLS-ne, i spostojme ne nje
  skeme private `private`. Postgres ruan referencat e RLS-se sipas OID,
  prandaj politikat ekzistuese vazhdojne te funksionojne pa modifikim.

  Funksionin `public.get_next_acc_number` e mbajme ne public sepse thirret
  drejtperdrejt nga klienti, por e konvertojme ne `SECURITY INVOKER` per
  te respektuar RLS-ne ne `acc_invoice_sequences`.

  ## Ndryshime
  1. Krijohet skema `private` (USAGE per authenticated)
  2. ALTER FUNCTION ... SET SCHEMA private per ~19 helper-a
  3. ALTER FUNCTION public.get_next_acc_number SECURITY INVOKER
*/

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

DO $$
DECLARE
  sig text;
  sigs text[] := ARRAY[
    'public.company_has_accounting(uuid)',
    'public.company_has_logistics(uuid)',
    'public.get_document_company_id(uuid)',
    'public.get_my_company_id()',
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
  FOREACH sig IN ARRAY sigs LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET SCHEMA private', sig);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    WHEN duplicate_function THEN
      -- already moved
      NULL;
    END;
  END LOOP;
END $$;

-- Make sure the moved helpers still find public tables
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid, n.nspname, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private'
  LOOP
    EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public, private',
      fn.nspname, fn.proname,
      pg_catalog.pg_get_function_identity_arguments(fn.oid));
  END LOOP;
END $$;

-- Convert get_next_acc_number to SECURITY INVOKER (still callable via RPC,
-- but now respects caller RLS on acc_invoice_sequences).
ALTER FUNCTION public.get_next_acc_number(uuid, text) SECURITY INVOKER;
