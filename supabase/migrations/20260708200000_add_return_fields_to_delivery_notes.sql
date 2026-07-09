/*
  # Returns / reclamations on delivery notes

  A return (reklamacion) is modelled as an incoming delivery note (type='pickup')
  linked back to the original outgoing delivery it corrects. Reusing the pickup
  path means the existing stock trigger increases depot stock and the pallet
  account trigger reduces what the partner holds — no new stock logic.

  1. New columns on `delivery_notes`
     - `is_return boolean` — marks the note as a return/reclamation.
     - `return_of_delivery_note_id uuid` — the original delivery being returned
       against (nullable; ON DELETE SET NULL).

  Additive only. No behaviour change for existing rows.
*/

alter table public.delivery_notes
  add column if not exists is_return boolean not null default false,
  add column if not exists return_of_delivery_note_id uuid
    references public.delivery_notes(id) on delete set null;

create index if not exists idx_delivery_notes_return_of
  on public.delivery_notes(return_of_delivery_note_id);

create index if not exists idx_delivery_notes_is_return
  on public.delivery_notes(company_id, is_return) where is_return = true;
