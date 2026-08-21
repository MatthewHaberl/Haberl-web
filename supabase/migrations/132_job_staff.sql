-- ============================================================================
-- Migration 132: job_staff — the named people on a job, not just the team.
-- ----------------------------------------------------------------------------
-- Migration 117 gave a job a CREW: one pick that puts four people on site. That
-- is the right default and it stays. What it could not say is "the crew, plus
-- Sipho for the first day", or "no crew on this one — just Lucas and me", and
-- it could not carry across the thing the quote already knew: WHICH PEOPLE were
-- priced into this job.
--
-- job_staff is that roster. It is the list the day's hours are written from,
-- and every row remembers where it came from:
--
--   'quoted' — copied from the quote's crew lines when the job was created.
--              The people the customer is paying for, with the hours and the
--              rate the quote used, so quoted-vs-actual has a per-person half.
--   'crew'   — put there by assigning a crew. Re-assigning a crew replaces
--              exactly these rows and leaves the other two kinds alone.
--   'manual' — somebody added this person to this job by hand. Never touched
--              by a crew change; removing them is a deliberate act.
--
-- jobs.crew_id is untouched and still means "the team on this job" — it fills
-- the roster and colours the calendar. jobs.assigned_to still means "the login
-- that is responsible". The roster is who actually gets paid for the day.
-- ============================================================================

create table if not exists public.job_staff (
  job_id   uuid not null references public.jobs(id)  on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,

  -- The person in charge on site — same meaning as crew_members.role.
  role   text not null default 'member' check (role in ('leader', 'member')),

  -- Where this row came from. See the header: it decides what a crew change
  -- is allowed to overwrite.
  source text not null default 'manual' check (source in ('quoted', 'crew', 'manual')),

  -- The crew that put this person here, when source = 'crew'. Kept so changing
  -- crews can clear the outgoing crew's people precisely, and so a person who
  -- is on the job for two reasons is still one row.
  from_crew_id uuid references public.crews(id) on delete set null,

  -- What the QUOTE promised for this person (source = 'quoted'). A snapshot,
  -- exactly like the quote's own crew lines: a raise next month must not
  -- rewrite what a job was sold for.
  quoted_hours       numeric,
  quoted_cost_rate_r numeric,

  sort_order integer not null default 0,
  notes      text,

  added_by   uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  primary key (job_id, staff_id)
);

comment on table public.job_staff is
  'Who is on this job, person by person. Filled by assigning a crew, by the quote''s crew lines, or by hand.';
comment on column public.job_staff.source is
  'quoted = came from the quote; crew = came from jobs.crew_id; manual = added by hand. Only ''crew'' rows are replaced when the crew changes.';
comment on column public.job_staff.quoted_cost_rate_r is
  'The rate the quote used for this person. A snapshot — never read live from staff.';

-- One leader on a job, or the word means nothing (mirrors crew_members).
create unique index if not exists job_staff_one_leader
  on public.job_staff (job_id) where role = 'leader';

create index if not exists job_staff_staff_idx on public.job_staff (staff_id);
create index if not exists job_staff_crew_idx  on public.job_staff (from_crew_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Same call as crews: who is working with whom is roster information every
-- employee needs. The RATES stay locked inside `staff`, which only a manager
-- can read — a field worker reading this table sees names, not wages. The
-- quoted_* snapshot columns are the exception and they are wage figures, so
-- reads by field workers are limited to their own row.
alter table public.job_staff enable row level security;

drop policy if exists "job_staff_select" on public.job_staff;
create policy "job_staff_select" on public.job_staff
  for select using (public.current_role() in ('field_worker', 'manager', 'admin'));

drop policy if exists "job_staff_write" on public.job_staff;
create policy "job_staff_write" on public.job_staff
  for all
  using (public.current_role() in ('manager', 'admin'))
  with check (public.current_role() in ('manager', 'admin'));

-- ── Backfill: every job that already has a crew gets that crew's people ─────
-- Without this, an existing job would show an empty roster next to a crew name
-- it plainly has, and logging a day would find nobody.
-- Everyone lands as a member first: job_staff_one_leader is a UNIQUE index, and
-- a job whose crew shares a leader with another crew would fail the insert
-- outright. The leader is promoted in a second pass, one per job.
insert into public.job_staff (job_id, staff_id, role, source, from_crew_id, sort_order)
select j.id, cm.staff_id, 'member', 'crew', j.crew_id, cm.sort_order
from public.jobs j
join public.crew_members cm on cm.crew_id = j.crew_id
where j.crew_id is not null
on conflict (job_id, staff_id) do nothing;

with leaders as (
  select distinct on (j.id) j.id as job_id, cm.staff_id
  from public.jobs j
  join public.crew_members cm on cm.crew_id = j.crew_id
  where j.crew_id is not null and cm.role = 'leader'
  order by j.id, cm.sort_order, cm.staff_id
)
update public.job_staff js
set role = 'leader'
from leaders l
where js.job_id = l.job_id and js.staff_id = l.staff_id;
