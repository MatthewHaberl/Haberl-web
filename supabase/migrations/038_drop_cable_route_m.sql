-- 038_drop_cable_route_m.sql
-- Drops the legacy scalar cable-run estimate. quote_requests.cable_route_m held a
-- single admin-entered metres figure that fed the calculator's cable quantities and
-- voltage-drop fallback. It is fully superseded by the measured routes in the
-- cable_routes table (per-run dcRunsM/acM/earthM from the Roof Design tab), which the
-- calculator now reads directly. No application code reads or writes this column
-- anymore; when no measured routes exist the calculator falls back to a 15m default.
alter table public.quote_requests
  drop column if exists cable_route_m;
