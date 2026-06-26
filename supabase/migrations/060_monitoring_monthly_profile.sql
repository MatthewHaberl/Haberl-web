-- ── monitoring_monthly_profile() ──────────────────────────────────────────────
-- Server-side aggregation of a system's stored readings into a per-calendar-month
-- average-power profile. The optimisation engine calls this instead of pulling
-- thousands of raw rows into the app: the heavy lifting (and the full backfilled
-- history) stays in Postgres, only 12 small rows come back, and NO brand API is
-- touched. Backfilling more data simply makes this profile richer + more accurate.
--
-- avg power × hours-in-month → kWh downstream. Averaging assumes roughly uniform
-- sampling (5-/15-min polling + backfill), which holds for this data.
-- security invoker → the caller's RLS on monitoring_readings still applies.
create or replace function public.monitoring_monthly_profile(p_system_id uuid)
returns table (
  month        int,
  avg_pv_w     numeric,
  avg_load_w   numeric,
  sample_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    extract(month from recorded_at)::int as month,
    avg(pv_power_w)                       as avg_pv_w,
    avg(load_power_w)                     as avg_load_w,
    count(*)                             as sample_count
  from public.monitoring_readings
  where system_id = p_system_id
  group by 1
$$;

grant execute on function public.monitoring_monthly_profile(uuid) to authenticated;
