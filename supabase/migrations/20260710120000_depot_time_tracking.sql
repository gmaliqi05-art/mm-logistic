/*
  # Depot time tracking (repair vs sorting) — Phase 1

  Measures how each depot worker splits the day between REPAIR (reparatur,
  the default) and SORTING (sortire). Workers are in repair all day; when
  goods arrive the manager activates sorting for selected workers, which
  pauses their repair time until sorting is stopped.

  Model (no € cost yet — only time + pallets):
  - Only SORTING sessions are explicitly tracked (start/stop).
  - Net productive time per day comes from an editable company config:
      shift (07:00-17:00) minus lunch (12:00-13:00), morning break
      (09:00-09:15), afternoon break (15:00-15:15) and a daily personal
      allowance (~20 min).  Baseline = 600 - 60 - 15 - 15 - 20 = 490 min.
  - Repair minutes = net productive - sorting minutes (residual).
  - Approved leave days (leave_requests) are excluded.

  1. depot_time_settings  — editable per-company schedule/breaks/allowance.
  2. depot_sorting_sessions — one row per active/finished sorting session.
  3. tstz_overlap_seconds() — helper.
  4. depot_worker_time_report() — per worker/day report used by both
     the depot and company dashboards.
*/

-- 1. Editable per-company configuration ------------------------------------
create table if not exists public.depot_time_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  shift_start time not null default '07:00',
  shift_end time not null default '17:00',
  lunch_start time not null default '12:00',
  lunch_end time not null default '13:00',
  morning_break_start time not null default '09:00',
  morning_break_end time not null default '09:15',
  afternoon_break_start time not null default '15:00',
  afternoon_break_end time not null default '15:15',
  daily_allowance_min int not null default 20,
  workdays int[] not null default '{1,2,3,4,5}', -- ISO dow: Mon=1 .. Sun=7
  timezone text not null default 'Europe/Berlin',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Seed a default row for every existing company
insert into public.depot_time_settings (company_id)
select id from public.companies
on conflict (company_id) do nothing;

alter table public.depot_time_settings enable row level security;

drop policy if exists dts_select_same_company on public.depot_time_settings;
create policy dts_select_same_company on public.depot_time_settings
  for select using (
    company_id in (select company_id from public.profiles_private
                   where id = (select auth.uid()))
  );

drop policy if exists dts_upsert_same_company on public.depot_time_settings;
create policy dts_upsert_same_company on public.depot_time_settings
  for insert with check (
    company_id in (select company_id from public.profiles_private
                   where id = (select auth.uid()) and role = 'company_admin')
  );

drop policy if exists dts_update_same_company on public.depot_time_settings;
create policy dts_update_same_company on public.depot_time_settings
  for update using (
    company_id in (select company_id from public.profiles_private
                   where id = (select auth.uid()) and role = 'company_admin')
  ) with check (
    company_id in (select company_id from public.profiles_private
                   where id = (select auth.uid()) and role = 'company_admin')
  );

-- 2. Sorting sessions -------------------------------------------------------
create table if not exists public.depot_sorting_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  depot_id uuid not null references public.depots(id) on delete cascade,
  worker_id uuid not null references public.profiles_private(id) on delete cascade,
  batch_id uuid references public.pallet_sorting_batches(id) on delete set null,
  started_at timestamptz not null default now(),
  started_by uuid references public.profiles_private(id),
  ended_at timestamptz,
  ended_by uuid references public.profiles_private(id),
  created_at timestamptz not null default now()
);

-- Only one active (not-yet-ended) sorting session per worker
create unique index if not exists uq_active_sorting_session_per_worker
  on public.depot_sorting_sessions(worker_id) where ended_at is null;

create index if not exists idx_sorting_sessions_company_started
  on public.depot_sorting_sessions(company_id, depot_id, started_at);

create index if not exists idx_sorting_sessions_worker_started
  on public.depot_sorting_sessions(worker_id, started_at);

alter table public.depot_sorting_sessions enable row level security;

drop policy if exists dss_select_same_company on public.depot_sorting_sessions;
create policy dss_select_same_company on public.depot_sorting_sessions
  for select using (
    company_id in (select company_id from public.profiles_private
                   where id = (select auth.uid()))
  );

drop policy if exists dss_insert_same_company on public.depot_sorting_sessions;
create policy dss_insert_same_company on public.depot_sorting_sessions
  for insert with check (
    company_id in (select company_id from public.profiles_private
                   where id = (select auth.uid())
                     and role = any (array['company_admin','depot_worker']))
  );

drop policy if exists dss_update_same_company on public.depot_sorting_sessions;
create policy dss_update_same_company on public.depot_sorting_sessions
  for update using (
    company_id in (select company_id from public.profiles_private
                   where id = (select auth.uid())
                     and role = any (array['company_admin','depot_worker']))
  ) with check (
    company_id in (select company_id from public.profiles_private
                   where id = (select auth.uid())
                     and role = any (array['company_admin','depot_worker']))
  );

-- 3. Overlap helper ---------------------------------------------------------
create or replace function public.tstz_overlap_seconds(
  a_start timestamptz, a_end timestamptz,
  b_start timestamptz, b_end timestamptz
) returns numeric language sql immutable as $$
  select greatest(0, extract(epoch from (
    least(a_end, b_end) - greatest(a_start, b_start)
  )))::numeric;
$$;

-- 4. Per worker/day report --------------------------------------------------
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
      case when lv.worker_id is not null or not g.is_workday then 0
        else greatest(0, (
          extract(epoch from (g.shift_e - g.shift_s))/60
          - extract(epoch from (g.lunch_e - g.lunch_s))/60
          - extract(epoch from (g.mb_e - g.mb_s))/60
          - extract(epoch from (g.ab_e - g.ab_s))/60
          - s.daily_allowance_min))::int
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
