/*
  # Security hotfix: cross-tenant leaks in a view and chat participant inserts

  Two cross-tenant isolation gaps found in the super-audit:

  1. `delivery_notes_3party_view` (created in 20260512100000_three_party_logistics_model.sql)
     was defined WITHOUT `security_invoker = true` and granted SELECT to
     `authenticated`. A plain (non-invoker) view runs with the privileges of its
     owner (postgres, which has BYPASSRLS), so RLS on the underlying
     delivery_notes / acc_contacts / companies tables is NOT applied. Any
     authenticated user could `SELECT * FROM delivery_notes_3party_view` and read
     every company's delivery notes plus consignor/consignee/carrier names and
     addresses. Every other reporting view was switched to security_invoker in
     20260517163433 / 20260521160000; this one was missed by that allowlist.

  2. `chatpart_insert` on chat_participants only required the caller to be the
     room creator (or super_admin). It did NOT verify that the user being added
     belongs to the same company as the room, so a room creator could inject a
     profile from another tenant into a room and that foreign user would then be
     able to read the room's messages (via chatpart_select / chatmsg_select).
     This is the same class of bug fixed for document_recipients in
     20260622120000 — the equivalent guard was never applied to chat.

  Helper functions live in the `private` schema (moved in 20260427190333).
*/

-- 1. Make the 3-party view respect the caller's RLS.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_views
    WHERE schemaname = 'public' AND viewname = 'delivery_notes_3party_view'
  ) THEN
    EXECUTE 'ALTER VIEW public.delivery_notes_3party_view SET (security_invoker = true)';
  END IF;
END $$;

-- 2. Enforce same-company membership when adding chat participants.
DROP POLICY IF EXISTS "chatpart_insert" ON public.chat_participants;

CREATE POLICY "chatpart_insert"
  ON public.chat_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.get_user_role() = 'super_admin'
    OR (
      private.is_chat_room_creator(room_id)
      AND EXISTS (
        SELECT 1
        FROM public.chat_rooms cr
        JOIN public.profiles p ON p.id = chat_participants.user_id
        WHERE cr.id = chat_participants.room_id
          AND cr.company_id = p.company_id
      )
    )
  );
