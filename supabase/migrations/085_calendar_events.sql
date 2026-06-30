-- 085_calendar_events.sql
-- Scheduling calendar.
--
-- A single "appointments" layer for everything that ISN'T already a job:
-- site meetings, inspections, quote appointments, service visits and
-- follow-up calls. Each event has a date+time, an assigned field worker, and
-- can hang off a lead, customer, site or job.
--
-- Installations are intentionally NOT stored here — they already live on
-- jobs.scheduled_date with jobs.assigned_to, so the calendar UI overlays them
-- read-only from the jobs table (no double entry).
--
-- Visibility mirrors jobs (migration 001): a field worker sees the events
-- assigned to them (or that they created); managers/admins see everything.

create type calendar_event_type as enum (
  'site_meeting',       -- visit a lead/customer to assess the site
  'inspection',         -- formal inspection / survey
  'quote_appointment',  -- present or walk through a quote
  'service',            -- service / maintenance callout on an installed site
  'follow_up',          -- a reminder to call/contact a lead or customer
  'other'
);

create type calendar_event_status as enum (
  'scheduled',   -- booked, not yet confirmed with the customer
  'confirmed',   -- customer has confirmed they'll be there
  'completed',   -- it happened
  'cancelled',   -- called off
  'no_show'      -- nobody was there
);

create table public.calendar_events (
  id            uuid primary key default gen_random_uuid(),
  type          calendar_event_type   not null default 'site_meeting',
  title         text                  not null,
  starts_at     timestamptz           not null,
  ends_at       timestamptz           not null,
  all_day       boolean               not null default false,
  status        calendar_event_status not null default 'scheduled',

  -- who is doing it (the field worker / staff member)
  assigned_to   uuid references public.user_profiles(id) on delete set null,

  -- optional links — an event can attach to any of these
  lead_id       uuid references public.leads(id)      on delete set null,
  customer_id   uuid references public.customers(id)  on delete set null,
  site_id       uuid references public.sites(id)      on delete set null,
  job_id        uuid references public.jobs(id)       on delete set null,

  -- denormalised contact details (so an event off a bare lead still shows who/where)
  location      text,
  contact_name  text,
  contact_phone text,
  contact_email text,
  notes         text,

  -- ownership + audit. owner_id self-defaults to the creating session (matches
  -- the leads pattern in migration 071); service-role inserts leave it NULL.
  owner_id      uuid references public.user_profiles(id) on delete set null default auth.uid(),
  created_by    uuid references public.user_profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index calendar_events_starts_at_idx   on public.calendar_events (starts_at);
create index calendar_events_assigned_to_idx on public.calendar_events (assigned_to);
create index calendar_events_lead_id_idx     on public.calendar_events (lead_id);
create index calendar_events_customer_id_idx on public.calendar_events (customer_id);
create index calendar_events_job_id_idx      on public.calendar_events (job_id);

-- keep updated_at fresh on every edit
create or replace function public.touch_calendar_events_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger calendar_events_touch_updated_at
  before update on public.calendar_events
  for each row execute function public.touch_calendar_events_updated_at();

alter table public.calendar_events enable row level security;

-- A field worker sees events assigned to them or that they created; managers
-- and admins see the whole team's calendar.
create policy "calendar_events_select" on public.calendar_events
  for select
  using (
    assigned_to = auth.uid()
    or owner_id = auth.uid()
    or public.current_role() in ('manager', 'admin')
  );

-- Any staff member can create an event; non-staff (customers) cannot.
create policy "calendar_events_insert" on public.calendar_events
  for insert
  with check (public.current_role() in ('field_worker', 'manager', 'admin'));

-- You can edit an event you own or are assigned to; managers/admins edit all.
create policy "calendar_events_update" on public.calendar_events
  for update
  using (
    assigned_to = auth.uid()
    or owner_id = auth.uid()
    or public.current_role() in ('manager', 'admin')
  );

-- Only the owner or a manager/admin can delete an event.
create policy "calendar_events_delete" on public.calendar_events
  for delete
  using (
    owner_id = auth.uid()
    or public.current_role() in ('manager', 'admin')
  );
