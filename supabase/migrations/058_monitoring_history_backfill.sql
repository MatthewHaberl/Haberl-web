-- ── Historical backfill support for monitoring_readings ────────────────
-- Adds (1) a provenance column so backfilled / imported rows are
-- distinguishable from live polls, (2) a uniqueness guard on
-- (system_id, recorded_at) so backfill + import can UPSERT idempotently
-- (re-runnable without duplicating rows), and (3) a resumable job table so
-- a long "walk back to install date" survives serverless timeouts.

-- 1. Provenance: where did this row come from?
alter table public.monitoring_readings
  add column if not exists reading_source text not null default 'live'
    check (reading_source in ('live', 'backfill', 'import'));

-- 2. Dedup any pre-existing collisions (keep the newest id per key), then add a
--    unique index. Live polls use millisecond now() timestamps so collisions
--    are not expected, but this makes the upsert key safe regardless.
delete from public.monitoring_readings a
using public.monitoring_readings b
where a.system_id = b.system_id
  and a.recorded_at = b.recorded_at
  and a.id < b.id;

create unique index if not exists monitoring_readings_system_recorded_uniq
  on public.monitoring_readings (system_id, recorded_at);

-- 3. Resumable backfill jobs. One active job per system; the worker processes a
--    chunk of days per invocation and advances cursor_day backwards until it
--    crosses earliest_day (the auto-detected install date) or floor_day.
create table if not exists public.monitoring_backfill_jobs (
  id            uuid primary key default uuid_generate_v4(),
  system_id     uuid not null references public.monitoring_systems(id) on delete cascade,
  status        text not null default 'running'
                  check (status in ('running', 'done', 'error', 'cancelled')),
  -- Walking backwards: start at the most recent day, stop at floor_day.
  cursor_day    date not null,          -- next day to fetch (exclusive of already-done)
  floor_day     date not null,          -- never go earlier than this
  earliest_day  date,                   -- earliest day we actually found data for
  empty_streak  int  not null default 0,-- consecutive empty days (pre-install detector)
  days_done     int  not null default 0,
  rows_written  int  not null default 0,
  error         text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists monitoring_backfill_jobs_system
  on public.monitoring_backfill_jobs (system_id, created_at desc);

alter table public.monitoring_backfill_jobs enable row level security;

create policy "Staff can manage backfill jobs"
  on public.monitoring_backfill_jobs for all
  using (public.current_role() in ('manager', 'admin'));
