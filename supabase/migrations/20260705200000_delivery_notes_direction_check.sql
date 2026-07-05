/*
  # A-M2: lock the delivery-note direction invariant at the schema level

  A-M1 (20260705170000) added a BEFORE trigger that derives `our_role` and
  `flow_role` from the canonical `type`, and backfilled every row so the three
  direction fields agree. This CHECK constraint is defense-in-depth: even if
  that trigger is dropped, disabled, or a direct write bypasses it, the fields
  can never diverge again — the exact bug that had mis-set 2 of 15 live notes
  (type='pickup' stored with our_role='consignor') before A-M1.

  Carrier notes (our_role='carrier') and any non delivery/pickup `type` are
  intentionally left unconstrained — a carrier is not a consignor/consignee on
  the consignment and does not map to a single stock direction.

  Verified before adding: 0 of 15 existing rows violate the invariant. Verified
  after: a divergent insert (pickup + consignor) is rejected by the constraint
  even with the sync trigger disabled.

  Applied to prod via MCP; recorded here.
*/

ALTER TABLE public.delivery_notes
  ADD CONSTRAINT delivery_notes_direction_consistent CHECK (
    type NOT IN ('delivery', 'pickup')
    OR our_role = 'carrier'
    OR (type = 'delivery' AND our_role = 'consignor' AND flow_role = 'sender')
    OR (type = 'pickup'   AND our_role = 'consignee' AND flow_role = 'receiver')
  );
