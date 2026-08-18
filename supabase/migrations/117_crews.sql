-- ============================================================================
-- Migration 117: crews — a named team of staff, assigned once and tracked.
-- ----------------------------------------------------------------------------
-- Today every place that needs "who is doing this work" names people one at a
-- time: the quote's crew panel, jobs.assigned_to, and a per-day assignee on
-- every schedule slot. A three-day install therefore names the same four
-- people four times, and the day a labourer is swapped nobody can tell which
-- of those lists is now wrong.
--
-- A crew is that list, once. It is built on `staff`, NOT user_profiles: the
-- people who actually swing the tools are paid without ever logging into the
-- portal (see migration 112), so a crew of logins could not hold them.
--
-- The same crew binds three different ways, and the differences are the design:
--
--   QUOTE  — SNAPSHOT. Picking a crew copies names and rates into the quote's
--            scope JSON. Never an FK. A raise, or a leaver, must not silently
--            reprice a quote already sent. (Same discipline as payslips.lines.)
--
--   JOB    — REFERENCE. jobs.crew_id, and schedule slots inherit it. This is
--            the "choose once" — a slot only carries its own crew_id when that
--            day genuinely differs (a hand-over mid-install).
--
--   HOURS  — ACTUALS. Confirming a booked day writes one time_entry per crew
--            member, at each person's own rate, linked back to the slot that
--            produced it. Exceptions (absent, overtime, swapped) are edited
--            afterwards; the crew supplies the default, not the truth.
--
-- jobs.assigned_to is deliberately untouched: it stays "who is responsible and
-- gets the notifications" — a login. crew_id is "who is on site" — staff.
-- ============================================================================

-- ── crews ───────────────────────────────────────────────────────────────────
create table if not exists public.crews (
  id     uuid primary key default gen_random_uuid(),
  name   text not null,

  -- Chip colour on the calendar. Free-form so the UI owns the palette.
  colour text,
  notes  text,

  -- Crews are retired, not deleted: jobs and quotes reference the ones that
  -- have already worked.
  active boolean not null default true,

  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint crews_name_not_blank check (length(btrim(name)) > 0)
);

-- Two live crews called "Crew A" is a data-entry mistake every time. Retired
-- crews are exempt so the name can be reused.
create unique index if not exists crews_active_name_uniq
  on public.crews (lower(btrim(name))) where active;

comment on table public.crews is
  'A named team of staff. Assigned to a job once; quotes take a priced snapshot of its members.';

-- ── crew_members ────────────────────────────────────────────────────────────
-- Many-to-many on purpose: people move between crews job to job, and one
-- person can be on two crews in the same week. A "crew" column on staff would
-- have to be rewritten every time that happened.
create table if not exists public.crew_members (
  crew_id    uuid not null references public.crews(id) on delete cascade,
  staff_id   uuid not null references public.staff(id) on delete cascade,

  -- The person in charge on site. Not a pay grade — a phone number to call.
  role       text not null default 'member' check (role in ('leader', 'member')),
  sort_order integer not null default 0,

  created_at timestamptz not null default now(),

  primary key (crew_id, staff_id)
);

-- One leader per crew, or the phrase means nothing.
create unique index if not exists crew_members_one_leader
  on public.crew_members (crew_id) where role = 'leader';

create index if not exists crew_members_staff_idx on public.crew_members (staff_id);

-- ── the crew on the work ────────────────────────────────────────────────────
alter table public.jobs
  add column if not exists crew_id uuid references public.crews(id) on delete set null;

comment on column public.jobs.crew_id is
  'Who is on site for this job. jobs.assigned_to stays the responsible login.';

-- Null means "the job's crew" — a slot only names its own when the day differs.
alter table public.job_schedule_slots
  add column if not exists crew_id uuid references public.crews(id) on delete set null;

create index if not exists jobs_crew_id_idx                on public.jobs (crew_id);
create index if not exists job_schedule_slots_crew_id_idx  on public.job_schedule_slots (crew_id);

-- ── hours generated from a booked day ───────────────────────────────────────
-- The link back to the slot is what makes confirming a day repeatable: a second
-- confirmation updates the same rows instead of paying the day twice.
alter table public.time_entries
  add column if not exists slot_id uuid references public.job_schedule_slots(id) on delete set null;

create index if not exists time_entries_slot_idx on public.time_entries (slot_id);

-- Deliberately NOT a partial index: PostgREST's upsert cannot name an index
-- predicate, so a `where slot_id is not null` index could not be inferred by
-- ON CONFLICT. Postgres treats NULLs as distinct, so hand-typed entries (which
-- have no slot) are unaffected by the constraint either way.
create unique index if not exists time_entries_slot_staff_uniq
  on public.time_entries (slot_id, staff_id);

-- 'crew' marks hours the crew-day button generated, so a manager can tell them
-- from hours somebody typed or clocked — and so regenerating only ever touches
-- its own rows.
alter table public.time_entries drop constraint if exists time_entries_source_check;
alter table public.time_entries
  add constraint time_entries_source_check check (source in ('manual', 'clock', 'crew'));

-- ── updated_at ──────────────────────────────────────────────────────────────
drop trigger if exists crews_touch_updated_at on public.crews;
create trigger crews_touch_updated_at before update on public.crews
  for each row execute function public.touch_staff_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Who is on which crew is roster information, not wage information: everyone in
-- the field needs it to know who they are working with. The rates behind those
-- people stay locked in `staff`, which only a manager can read.
alter table public.crews        enable row level security;
alter table public.crew_members enable row level security;

drop policy if exists "crews_select" on public.crews;
create policy "crews_select" on public.crews
  for select using (public.current_role() in ('field_worker', 'manager', 'admin'));

drop policy if exists "crews_write" on public.crews;
create policy "crews_write" on public.crews
  for all
  using (public.current_role() in ('manager', 'admin'))
  with check (public.current_role() in ('manager', 'admin'));

drop policy if exists "crew_members_select" on public.crew_members;
create policy "crew_members_select" on public.crew_members
  for select using (public.current_role() in ('field_worker', 'manager', 'admin'));

drop policy if exists "crew_members_write" on public.crew_members;
create policy "crew_members_write" on public.crew_members
  for all
  using (public.current_role() in ('manager', 'admin'))
  with check (public.current_role() in ('manager', 'admin'));
