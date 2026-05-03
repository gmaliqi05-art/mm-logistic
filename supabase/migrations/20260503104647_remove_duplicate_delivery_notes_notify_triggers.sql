/*
  # Heqja e trigger-ave te dyfishte te njoftimeve ne delivery_notes

  1. Problemi
    - Tabela `delivery_notes` kishte 3 trigger te mbivendosur qe therrisnin funksionin `delivery_notes_notify`:
      - `trg_delivery_notes_notify` (INSERT OR UPDATE)
      - `trg_delivery_notes_notify_ins` (INSERT)
      - `trg_delivery_notes_notify_upd` (UPDATE)
    - Si pasoje, shoferi merrte 2 njoftime per cdo veprim.

  2. Rregullimi
    - Hiqen trigger-at `trg_delivery_notes_notify_ins` dhe `trg_delivery_notes_notify_upd`.
    - Mbetet vetem `trg_delivery_notes_notify` (INSERT OR UPDATE), i cili mbulon te dy rastet.

  3. Siguria & te dhenat
    - Nuk prekim asnje rresht te dhene ekzistuese (njoftimet demo nuk fshihen).
    - Nuk prekim RLS.
*/

DROP TRIGGER IF EXISTS trg_delivery_notes_notify_ins ON public.delivery_notes;
DROP TRIGGER IF EXISTS trg_delivery_notes_notify_upd ON public.delivery_notes;
