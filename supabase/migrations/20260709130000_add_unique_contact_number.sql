/*
  # Unique client/partner number per company

  Each client (acc_contacts) gets a stable, human-readable identifier
  (KL-0001, per company) for the client list and the client statement (kartela).

  1. New column `acc_contacts.contact_number`.
  2. BEFORE INSERT trigger assigns the next `KL-<0001>` per company.
  3. Existing clients are backfilled deterministically by creation order.
  4. Unique per (company_id, contact_number).
*/

alter table public.acc_contacts add column if not exists contact_number text;

with ordered as (
  select id, row_number() over (partition by company_id order by created_at, id) as rn
  from public.acc_contacts
  where contact_number is null
)
update public.acc_contacts a
set contact_number = 'KL-' || lpad(o.rn::text, 4, '0')
from ordered o
where a.id = o.id;

create or replace function public.assign_contact_number()
returns trigger language plpgsql as $$
declare next_n int;
begin
  if new.contact_number is null or new.contact_number = '' then
    select coalesce(max((regexp_replace(contact_number, '\D', '', 'g'))::int), 0) + 1
      into next_n
      from public.acc_contacts
      where company_id = new.company_id and contact_number ~ '^KL-\d+$';
    new.contact_number := 'KL-' || lpad(next_n::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_contact_number on public.acc_contacts;
create trigger trg_assign_contact_number
  before insert on public.acc_contacts
  for each row execute function public.assign_contact_number();

create unique index if not exists uq_acc_contacts_number_per_company
  on public.acc_contacts(company_id, contact_number) where contact_number is not null;
