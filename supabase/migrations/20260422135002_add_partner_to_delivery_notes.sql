/*
  # Shto identifikim te partnerit ne fletedergesa

  ## Përshkrim
  Shton tre kolona te reja te `delivery_notes` per te mundesuar lidhjen automatike
  te fletedergeses me nje kontakt ekzistues (kompani klient ose furnitor) nga
  moduli i kontabilitetit. Kur AI skanon nje dokument dhe identifikon emrin e
  furnitorit/klientit, sistemi kerkon ne tabelen `acc_contacts` dhe plotson
  automatikisht adresen e dergeses/marrjes.

  ## Ndryshime
  1. `delivery_notes.partner_id` (uuid) - ID e kontaktit te lidhur (FK te acc_contacts)
  2. `delivery_notes.partner_name` (text) - Emri i kompanise partnere (per historik edhe nese kontakti fshihet)
  3. Index mbi (company_id, partner_id) per renditje te shpejte sipas kompanise partnere

  ## Vërejtje
  - Perdoret IF NOT EXISTS per siguri
  - partner_name eshte kopje per te ruajtur historin edhe nese kontakti fshihet
  - FK ON DELETE SET NULL per te mos humbur fletedergesen
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_notes' AND column_name = 'partner_id'
  ) THEN
    ALTER TABLE delivery_notes ADD COLUMN partner_id uuid REFERENCES acc_contacts(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_notes' AND column_name = 'partner_name'
  ) THEN
    ALTER TABLE delivery_notes ADD COLUMN partner_name text DEFAULT '';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_delivery_notes_partner ON delivery_notes(company_id, partner_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_partner_name ON delivery_notes(company_id, partner_name);
