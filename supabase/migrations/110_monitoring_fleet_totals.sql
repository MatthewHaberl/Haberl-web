-- Fleet-wide energy totals.
--
-- The per-system chart integrates power samples into kWh in the API route, which
-- is fine for one system but not for the whole fleet: a 30-day fleet window is
-- tens of thousands of rows and PostgREST caps a response at ~1,000, so the
-- route would have to paginate per system. This does the same trapezoidal
-- integration in the database and returns one row per system per SAST day.
--
-- Method matches app/api/monitoring/readings/route.ts exactly:
--   * energy = trapezoid (average of the two endpoint powers x the interval)
--   * each interval is credited to the SAST day of its EARLIER sample
--   * intervals longer than an hour are skipped, so a polling outage doesn't
--     get drawn as energy through the hole
--   * sign convention: grid + import / - export, battery + charge / - discharge
--
-- SECURITY INVOKER (the default, stated here for the record): RLS on
-- monitoring_readings still applies, so staff see the whole fleet and a
-- customer sees only their own sites through the very same function.
create or replace function public.monitoring_fleet_daily_totals(
  p_since timestamptz,
  p_until timestamptz
)
returns table (
  system_id             uuid,
  day                   date,
  production_kwh        numeric,
  consumption_kwh       numeric,
  grid_import_kwh       numeric,
  grid_export_kwh       numeric,
  battery_charge_kwh    numeric,
  battery_discharge_kwh numeric,
  pv_peak_w             numeric,
  load_peak_w           numeric,
  soc_min               numeric,
  soc_max               numeric,
  readings              bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with paired as (
    -- Each sample paired with the next one from the same system.
    select
      mr.system_id,
      mr.recorded_at,
      mr.pv_power_w, mr.load_power_w, mr.grid_power_w, mr.battery_power_w,
      lead(mr.recorded_at)     over w as t2,
      lead(mr.pv_power_w)      over w as pv2,
      lead(mr.load_power_w)    over w as load2,
      lead(mr.grid_power_w)    over w as grid2,
      lead(mr.battery_power_w) over w as bat2
    from monitoring_readings mr
    where mr.recorded_at >= p_since
      and mr.recorded_at <  p_until
    window w as (partition by mr.system_id order by mr.recorded_at)
  ),
  steps as (
    select
      system_id,
      (recorded_at at time zone 'Africa/Johannesburg')::date as day,
      extract(epoch from (t2 - recorded_at)) / 3600.0 as dt_h,
      pv_power_w, pv2, load_power_w, load2, grid_power_w, grid2, battery_power_w, bat2
    from paired
    where t2 is not null
      and t2 >  recorded_at
      and t2 <= recorded_at + interval '1 hour'
  ),
  energy as (
    select
      system_id, day,
      sum((greatest(coalesce(pv_power_w, 0), 0)      + greatest(coalesce(pv2, 0), 0))      / 2 * dt_h / 1000) as production_kwh,
      sum((greatest(coalesce(load_power_w, 0), 0)    + greatest(coalesce(load2, 0), 0))    / 2 * dt_h / 1000) as consumption_kwh,
      sum((greatest(coalesce(grid_power_w, 0), 0)    + greatest(coalesce(grid2, 0), 0))    / 2 * dt_h / 1000) as grid_import_kwh,
      sum((greatest(-coalesce(grid_power_w, 0), 0)   + greatest(-coalesce(grid2, 0), 0))   / 2 * dt_h / 1000) as grid_export_kwh,
      sum((greatest(coalesce(battery_power_w, 0), 0) + greatest(coalesce(bat2, 0), 0))     / 2 * dt_h / 1000) as battery_charge_kwh,
      sum((greatest(-coalesce(battery_power_w, 0), 0)+ greatest(-coalesce(bat2, 0), 0))    / 2 * dt_h / 1000) as battery_discharge_kwh
    from steps
    group by system_id, day
  ),
  daily as (
    -- Peaks and SoC range over every sample (not just the paired ones), so a
    -- day with a single reading still reports something.
    select
      mr.system_id,
      (mr.recorded_at at time zone 'Africa/Johannesburg')::date as day,
      max(mr.pv_power_w)       as pv_peak_w,
      max(mr.load_power_w)     as load_peak_w,
      min(mr.battery_soc_pct)  as soc_min,
      max(mr.battery_soc_pct)  as soc_max,
      count(*)                 as readings
    from monitoring_readings mr
    where mr.recorded_at >= p_since
      and mr.recorded_at <  p_until
    group by 1, 2
  )
  select
    d.system_id,
    d.day,
    round(coalesce(e.production_kwh, 0), 3),
    round(coalesce(e.consumption_kwh, 0), 3),
    round(coalesce(e.grid_import_kwh, 0), 3),
    round(coalesce(e.grid_export_kwh, 0), 3),
    round(coalesce(e.battery_charge_kwh, 0), 3),
    round(coalesce(e.battery_discharge_kwh, 0), 3),
    round(d.pv_peak_w, 1),
    round(d.load_peak_w, 1),
    round(d.soc_min, 1),
    round(d.soc_max, 1),
    d.readings
  from daily d
  left join energy e on e.system_id = d.system_id and e.day = d.day
  order by d.day, d.system_id
$$;

comment on function public.monitoring_fleet_daily_totals(timestamptz, timestamptz) is
  'Per-system, per-SAST-day energy totals and peaks for a window. Trapezoidal integration matching the per-system readings API; RLS-scoped to the caller.';

grant execute on function public.monitoring_fleet_daily_totals(timestamptz, timestamptz) to authenticated;
