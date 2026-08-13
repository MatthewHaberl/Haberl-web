-- 106_job_schedule_slots.sql
-- Multi-day job scheduling with per-day time windows.
--
-- jobs.scheduled_date is a single bare date, so an install that runs three days
-- could only ever be booked for one — and the calendar showed it as a single
-- all-day block. This adds a slot per working day: each slot carries its own
-- start/end timestamp (the hours the crew is on site that day) and its own
-- assignee, so different days can go to different workers.
--
-- jobs.scheduled_date stays the job's FIRST day and is kept in sync by trigger,
-- so every existing read (job list, job card, stage emails) keeps working
-- untouched. Slots are the detail; scheduled_date is the headline.

create table public.job_schedule_slots (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,

  -- The window the crew is booked on site that day.
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,

  -- Who is on site that day. Defaults to the job's assignee at insert time
  -- (application-side), but a long install can hand over between workers.
  assigned_to uuid references public.user_profiles(id) on delete set null,
  notes       text,

  created_by  uuid references public.user_profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint job_schedule_slots_window_valid check (ends_at > starts_at)
);

create index job_schedule_slots_job_id_idx      on public.job_schedule_slots (job_id);
create index job_schedule_slots_starts_at_idx   on public.job_schedule_slots (starts_at);
create index job_schedule_slots_assigned_to_idx on public.job_schedule_slots (assigned_to);

create or replace function public.touch_job_schedule_slots_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger job_schedule_slots_touch_updated_at
  before update on public.job_schedule_slots
  for each row execute function public.touch_job_schedule_slots_updated_at();

-- Keep jobs.scheduled_date pinned to the job's first scheduled day, in SA local
-- time (a 07:00 SAST start is 05:00 UTC — using the UTC date would be right by
-- luck, not by rule). When the last slot is removed the date is cleared.
create or replace function public.sync_job_scheduled_date()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target uuid := coalesce(new.job_id, old.job_id);
  first_day date;
begin
  select min((starts_at at time zone 'Africa/Johannesburg')::date)
    into first_day
    from public.job_schedule_slots
   where job_id = target;

  update public.jobs
     set scheduled_date = first_day
   where id = target
     and scheduled_date is distinct from first_day;

  return null;
end;
$$;

create trigger job_schedule_slots_sync_job_date
  after insert or update or delete on public.job_schedule_slots
  for each row execute function public.sync_job_scheduled_date();

alter table public.job_schedule_slots enable row level security;

-- Visibility follows the job (migration 001): a field worker sees slots on jobs
-- assigned to them, or slots assigned to them personally; managers/admins all.
create policy "job_schedule_slots_select" on public.job_schedule_slots
  for select
  using (
    assigned_to = auth.uid()
    or exists (
      select 1 from public.jobs j
      where j.id = job_id
        and (j.assigned_to = auth.uid() or public.current_role() in ('manager', 'admin'))
    )
  );

-- Booking (insert/update/delete) follows job write access.
create policy "job_schedule_slots_write" on public.job_schedule_slots
  for all
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and (j.assigned_to = auth.uid() or public.current_role() in ('manager', 'admin'))
    )
  )
  with check (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and (j.assigned_to = auth.uid() or public.current_role() in ('manager', 'admin'))
    )
  );

-- Backfill: every job that already has a date gets a first-day slot for the
-- default working day (07:00–16:00 SAST) so the calendar keeps showing it and
-- the crew can extend it from the job page.
insert into public.job_schedule_slots (job_id, starts_at, ends_at, assigned_to)
select
  j.id,
  (j.scheduled_date::timestamp + time '07:00') at time zone 'Africa/Johannesburg',
  (j.scheduled_date::timestamp + time '16:00') at time zone 'Africa/Johannesburg',
  j.assigned_to
from public.jobs j
where j.scheduled_date is not null
  and j.stage not in ('cancelled');
