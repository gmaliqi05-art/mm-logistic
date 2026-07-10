/*
  # Depot attendance + report submissions — Phase 5

  Extends the repair/sorting time system so the depot manager can record actual
  presence (work hours) for depot workers, and submit reports to the company.

  1. depot_work_shifts — one clock-in/clock-out row per worker/day. Activating a
     worker opens a shift (clock_in defaults to the shift start); ending the day
     early sets clock_out (e.g. a worker leaves at 11:00). This BOUNDS the
     worker's productive window so repair time reflects real hours.
  2. depot_worker_time_report() is replaced to be attendance-aware:
     - if a shift row exists for the worker/day, the productive window is
       [clock_in, clock_out or now/shift-end];
     - if none exists, it falls back to the full standard shift (previous
       behaviour), so dashboards that don't use attendance are unaffected.
  3. depot_time_report_submissions — persisted reports the depot sends to the
     company (daily / weekly / monthly / custom, optionally per worker).
*/

-- 1. Attendance ------------------------------------------------------------
create table if not exists public.depot_work_shifts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  depot_id uuid not null references public.depots(id) on delete cascade,
  worker_id uuid not null references public.profiles_private(id) on delete cascade,
  work_date date not null,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  opened_by uuid references public.profiles_private(id),
  closed_by uuid references public.profiles_private(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_work_shift_per_worker_day
  on public.depot_work_shifts(worker_id, work_date);
create index if not exists idx_work_shifts_company_date
  on public.depot_work_shifts(company_id, depot_id, work_date);

alter table public.depot_work_shifts enable row level security;

drop policy if exists dws_select_same_company on public.depot_work_shifts;
create policy dws_select_same_company on public.depot_work_shifts
  for select using (
    company_id in (select company_id from public.profiles_private
                   where id = (select auth.uid()))
  );

drop policy if exists dws_insert_same_company on public.depot_work_shifts;
create policy dws_insert_same_company on public.depot_work_shifts
  for insert with check (
    company_id in (select company_id from public.profiles_private
                   where id = (select auth.uid())
                     and role = any (array['company_admin','depot_worker']))
  );

drop policy if exists dws_update_same_company on public.depot_work_shifts;
create policy dws_update_same_company on public.depot_work_shifts
  for update using (
    company_id in (select company_id from public.profiles_private
                   where id = (select auth.uid())
                     and role = any (array['company_admin','depot_worker']))
  ) with check (
    company_id in (select company_id from public.profiles_private
                   where id = (select auth.uid())
                     and role = any (array['company_admin','depot_worker']))
  );

-- 2. Attendance-aware report -----------------------------------------------
create or replace function public.depot_worker_time_report(
  p_company_id uuid,
  p_depot_id uuid default null,
  p_from date default null,
  p_to date default null
) returns table (
  worker_id uuid,
  full_name text,
  work_date date,
  on_leave boolean,
  net_productive_min int,
  sorting_min int,
  repair_min int,
  repaired_pallets int,
  scrapped_pallets int,
  sorted_pallets int
) language plpgsql security invoker set search_path = public as $$
declare
  s public.depot_time_settings%rowtype;
  v_tz text;
  v_from date;
  v_to date;
begin
  select * into s from public.depot_time_settings where company_id = p_company_id;
  if not found then
    s.shift_start := time '07:00'; s.shift_end := time '17:00';
    s.lunch_start := time '12:00'; s.lunch_end := time '13:00';
    s.morning_break_start := time '09:00'; s.morning_break_end := time '09:15';
    s.afternoon_break_start := time '15:00'; s.afternoon_break_end := time '15:15';
    s.daily_allowance_min := 20; s.workdays := '{1,2,3,4,5}';
    s.timezone := 'Europe/Berlin';
  end if;
  v_tz := coalesce(s.timezone, 'Europe/Berlin');
  v_to := coalesce(p_to, (now() at time zone v_tz)::date);
  v_from := coalesce(p_from, v_to);

  return query
  with days as (
    select generate_series(v_from, v_to, interval '1 day')::date as d
  ),
  workers as (
    select pr.id as worker_id, pr.full_name
    from public.profiles pr
    where pr.company_id = p_company_id
      and pr.role = 'depot_worker'
      and (p_depot_id is null or pr.depot_id = p_depot_id)
  ),
  grid as (
    select w.worker_id, w.full_name, dy.d,
      (extract(isodow from dy.d)::int = any (s.workdays)) as is_workday,
      ((dy.d::text||' '||s.shift_start::text)::timestamp at time zone v_tz) as shift_s,
      ((dy.d::text||' '||s.shift_end::text)::timestamp at time zone v_tz) as shift_e,
      ((dy.d::text||' '||s.lunch_start::text)::timestamp at time zone v_tz) as lunch_s,
      ((dy.d::text||' '||s.lunch_end::text)::timestamp at time zone v_tz) as lunch_e,
      ((dy.d::text||' '||s.morning_break_start::text)::timestamp at time zone v_tz) as mb_s,
      ((dy.d::text||' '||s.morning_break_end::text)::timestamp at time zone v_tz) as mb_e,
      ((dy.d::text||' '||s.afternoon_break_start::text)::timestamp at time zone v_tz) as ab_s,
      ((dy.d::text||' '||s.afternoon_break_end::text)::timestamp at time zone v_tz) as ab_e
    from workers w cross join days dy
  ),
  leave as (
    select distinct grid.worker_id, grid.d
    from grid
    join public.leave_requests lr
      on lr.user_id = grid.worker_id
     and lr.company_id = p_company_id
     and lr.status = 'approved'
     and grid.d between lr.start_date and lr.end_date
  ),
  -- Presence window per worker/day: attendance row if present, else full shift.
  presence as (
    select g.worker_id, g.d,
      coalesce(ws.clock_in, g.shift_s) as p_start,
      coalesce(ws.clock_out, case when ws.id is not null then now() else g.shift_e end) as p_end
    from grid g
    left join public.depot_work_shifts ws
      on ws.worker_id = g.worker_id and ws.work_date = g.d
     and (p_depot_id is null or ws.depot_id = p_depot_id)
  ),
  sess as (
    select g.worker_id, g.d, sum(
        public.tstz_overlap_seconds(ds.started_at, coalesce(ds.ended_at, now()), g.shift_s, g.shift_e)
      - public.tstz_overlap_seconds(ds.started_at, coalesce(ds.ended_at, now()), g.lunch_s, g.lunch_e)
      - public.tstz_overlap_seconds(ds.started_at, coalesce(ds.ended_at, now()), g.mb_s, g.mb_e)
      - public.tstz_overlap_seconds(ds.started_at, coalesce(ds.ended_at, now()), g.ab_s, g.ab_e)
    ) as sort_sec
    from grid g
    join public.depot_sorting_sessions ds
      on ds.worker_id = g.worker_id
     and coalesce(ds.ended_at, now()) > g.shift_s
     and ds.started_at < g.shift_e
     and (p_depot_id is null or ds.depot_id = p_depot_id)
    group by g.worker_id, g.d
  ),
  repairs as (
    select dr.worker_id, (dr.logged_at at time zone v_tz)::date as d,
      sum(coalesce(dr.quantity_repaired,0)) as repaired,
      sum(coalesce(dr.quantity_scrapped,0)) as scrapped
    from public.depot_repairs dr
    where dr.company_id = p_company_id
      and (p_depot_id is null or dr.depot_id = p_depot_id)
      and (dr.logged_at at time zone v_tz)::date between v_from and v_to
    group by dr.worker_id, (dr.logged_at at time zone v_tz)::date
  ),
  depot_day_sorted as (
    select (b.completed_at at time zone v_tz)::date as d, sum(coalesce(b.total_received,0)) as pallets
    from public.pallet_sorting_batches b
    where b.company_id = p_company_id
      and b.status = 'completed'
      and b.completed_at is not null
      and (p_depot_id is null or b.depot_id = p_depot_id)
      and (b.completed_at at time zone v_tz)::date between v_from and v_to
    group by (b.completed_at at time zone v_tz)::date
  ),
  day_sort_total as (
    select d, sum(greatest(sort_sec, 0)) as tot_sec from sess group by d
  ),
  computed as (
    select
      g.worker_id, g.full_name, g.d,
      (lv.worker_id is not null) as on_leave,
      g.is_workday,
      -- net productive from the presence window, breaks that fall inside it,
      -- and the daily personal allowance.
      case when lv.worker_id is not null or not g.is_workday then 0
        else greatest(0, (
          public.tstz_overlap_seconds(pz.p_start, pz.p_end, g.shift_s, g.shift_e)/60
          - public.tstz_overlap_seconds(pz.p_start, pz.p_end, g.lunch_s, g.lunch_e)/60
          - public.tstz_overlap_seconds(pz.p_start, pz.p_end, g.mb_s, g.mb_e)/60
          - public.tstz_overlap_seconds(pz.p_start, pz.p_end, g.ab_s, g.ab_e)/60
          - case when public.tstz_overlap_seconds(pz.p_start, pz.p_end, g.shift_s, g.shift_e) > 0
                 then s.daily_allowance_min else 0 end))::int
      end as net_min,
      case when lv.worker_id is not null then 0
        else round(greatest(coalesce(se.sort_sec, 0), 0)/60)::int end as sort_min,
      coalesce(rp.repaired, 0)::int as repaired,
      coalesce(rp.scrapped, 0)::int as scrapped,
      coalesce(se.sort_sec, 0) as w_sort_sec,
      coalesce(dst.tot_sec, 0) as day_tot_sec,
      coalesce(dds.pallets, 0) as day_pallets
    from grid g
    left join leave lv on lv.worker_id = g.worker_id and lv.d = g.d
    left join presence pz on pz.worker_id = g.worker_id and pz.d = g.d
    left join sess se on se.worker_id = g.worker_id and se.d = g.d
    left join repairs rp on rp.worker_id = g.worker_id and rp.d = g.d
    left join day_sort_total dst on dst.d = g.d
    left join depot_day_sorted dds on dds.d = g.d
  )
  select
    c.worker_id, c.full_name, c.d as work_date, c.on_leave,
    c.net_min as net_productive_min,
    c.sort_min as sorting_min,
    greatest(0, c.net_min - c.sort_min)::int as repair_min,
    c.repaired as repaired_pallets,
    c.scrapped as scrapped_pallets,
    case when c.day_tot_sec > 0
      then round(c.w_sort_sec / c.day_tot_sec * c.day_pallets)::int
      else 0 end as sorted_pallets
  from computed c
  where c.on_leave
     or c.net_min > 0
     or c.sort_min > 0
     or c.repaired > 0
     or c.scrapped > 0
  order by c.d, c.full_name;
end;
$$;

grant execute on function public.depot_worker_time_report(uuid, uuid, date, date) to authenticated;

-- 3. Report submissions ----------------------------------------------------
create table if not exists public.depot_time_report_submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  depot_id uuid references public.depots(id) on delete set null,
  submitted_by uuid references public.profiles_private(id),
  period_type text not null default 'custom',
  from_date date not null,
  to_date date not null,
  worker_id uuid,
  note text,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_time_report_subs_company
  on public.depot_time_report_submissions(company_id, created_at desc);

alter table public.depot_time_report_submissions enable row level security;

drop policy if exists dtrs_select_same_company on public.depot_time_report_submissions;
create policy dtrs_select_same_company on public.depot_time_report_submissions
  for select using (
    company_id in (select company_id from public.profiles_private
                   where id = (select auth.uid()))
  );

drop policy if exists dtrs_insert_same_company on public.depot_time_report_submissions;
create policy dtrs_insert_same_company on public.depot_time_report_submissions
  for insert with check (
    company_id in (select company_id from public.profiles_private
                   where id = (select auth.uid())
                     and role = any (array['company_admin','depot_worker']))
  );
