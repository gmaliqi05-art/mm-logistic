/*
  # Repair time: reparature-only + attendance-driven

  Two corrections to depot_worker_time_report():
  1. Only REPARATURE (physical) workers are tracked — depoist depot operators
     (managers) are excluded from the time/productivity lists.
  2. Repair time is now strictly attendance-driven: a worker accrues productive
     (repair) time only while clocked in. No clock-in row for the day means no
     productive time — so repair auto-starts at clock-in and stops at clock-out,
     linking the repair system to the work-hours list.
*/

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
      and pr.worker_category = 'reparature'
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
  presence as (
    select g.worker_id, g.d,
      coalesce(ws.clock_in, g.shift_s) as p_start,
      case when ws.id is not null then coalesce(ws.clock_out, now()) else g.shift_s end as p_end
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
