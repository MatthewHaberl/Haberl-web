-- 108_solar_repair_work_type.sql — "Solar repair / service" work type
--
-- Data-only: adds a scope-engine work type for fault-finding and repairs on
-- existing solar installs. Slots in after the two solar design types (sort 2),
-- so the seeded scope types shift down one. DEFAULT_WORK_TYPES in
-- lib/quotes/work-types.ts mirrors this row — the jobs/new form renders from
-- the static mirror, so it must stay in sync.

update public.work_types
  set sort_order = sort_order + 1
  where sort_order >= 2
    and not exists (select 1 from public.work_types where code = 'solar_repair');

insert into public.work_types (code, label, engine, job_pipeline, default_sections, description, sort_order) values
  ('solar_repair', 'Solar repair / service', 'scope', 'lite',
   '{"Fault finding","Materials","Labour","Compliance"}',
   'Fault-finding and repairs on existing solar installs — inverters, batteries, panels, monitoring.', 2)
on conflict (code) do nothing;
