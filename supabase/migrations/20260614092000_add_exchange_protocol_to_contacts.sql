/*
  # Kölner vs Bonner exchange protocol on acc_contacts

  German pallet logistics distinguishes two contractual models for who
  carries the pallet-exchange risk in transport:

  - **Kölner Palettentausch** (Doppeltausch): the carrier brings empty
    EPALs to the loading point, swaps them for full ones at A, and
    swaps full-for-empty again at B. The carrier owns the empty stock
    in transit. Recommended for changing routes / part loads.

  - **Bonner Palettentausch** (Rückführungspflicht): the carrier
    arrives at B without empties; B has a *return obligation* to
    deliver an equivalent number of empties to A within an agreed
    window. Recommended for line-haul / regular routes.

  Mis-applying these models causes recurring disputes — OLG Düsseldorf
  has held that transferring the Tauschrisiko via AGB alone is invalid;
  it must be an Individualabrede (specifically negotiated per partner).
  This flag lets the operator pin the agreement per relationship so
  the delivery-note workflow can warn early when a transport contradicts
  the contractual model.

  ## What's added

  - `acc_contacts.exchange_protocol` text NULL
    Values: 'koelner' | 'bonner' | NULL (unconfigured = no contract).
    Nullable because: most contacts (suppliers, end customers, casual
    relationships) don't run a Palettenkonto at all.

  ## Safety

  - No constraint changes on existing columns.
  - Default NULL — no INSERT statement breaks.
  - CHECK constraint accepts only the two named protocols.
  - Idempotent via DO IF NOT EXISTS.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'acc_contacts'
      AND column_name = 'exchange_protocol'
  ) THEN
    ALTER TABLE public.acc_contacts
      ADD COLUMN exchange_protocol text NULL
      CHECK (
        exchange_protocol IS NULL
        OR exchange_protocol IN ('koelner', 'bonner')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.acc_contacts.exchange_protocol IS
  'Pallet exchange protocol agreed with this partner. "koelner" = carrier brings empties to A, swaps at A and B (Doppeltausch). "bonner" = receiver has return obligation. NULL = no Palettenkonto agreement.';
