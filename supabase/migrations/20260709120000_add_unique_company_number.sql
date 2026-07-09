/*
  # Unique company (tenant) number

  Every company on the platform gets a stable, human-readable identifier
  (e.g. MML-0001) in addition to its UUID, for identification in the UI.

  1. New column `companies.company_number` (unique).
  2. Sequence `company_number_seq` + BEFORE INSERT trigger to auto-assign
     `MML-<0001>` on every new company.
  3. Existing companies are backfilled deterministically by creation order.

  Additive; no behaviour change beyond the new identifier.
*/

alter table public.companies add column if not exists company_number text;

create sequence if not exists public.company_number_seq;

with ordered as (
  select id, row_number() over (order by created_at, id) as rn
  from public.companies
  where company_number is null
)
update public.companies c
set company_number = 'MML-' || lpad(o.rn::text, 4, '0')
from ordered o
where c.id = o.id;

do $$
declare n int;
begin
  select count(*) into n from public.companies;
  if n > 0 then perform setval('public.company_number_seq', n);
  end if;
end $$;

create or replace function public.assign_company_number()
returns trigger language plpgsql as $$
begin
  if new.company_number is null or new.company_number = '' then
    new.company_number := 'MML-' || lpad(nextval('public.company_number_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_company_number on public.companies;
create trigger trg_assign_company_number
  before insert on public.companies
  for each row execute function public.assign_company_number();

create unique index if not exists uq_companies_company_number
  on public.companies(company_number) where company_number is not null;
