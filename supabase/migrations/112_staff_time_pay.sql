-- ============================================================================
-- Migration 112: staff, hours, and pay.
-- ----------------------------------------------------------------------------
-- Until now the only "people" model was user_profiles — a PORTAL LOGIN. That's
-- the wrong shape for a wage bill: a labourer on site earns money whether or
-- not he ever signs into the portal. So `staff` is the employment record, and
-- `user_id` links it to a login only when one exists.
--
--   staff            — the person, their pay basis and their cost rate
--   time_entries     — hours worked, per day, optionally against a job
--   staff_payments   — money that isn't hours: piece work, bonus, allowance
--                      (and later advances/deductions — the `kind` list is
--                      already there, the payslip just doesn't subtract yet)
--   payslips         — a frozen pay run for one person over one period
--
-- Pay today is GROSS: hours × rate + piece work. PAYE/UIF/SDL are deliberately
-- out — `deductions_r`/`net_pay_r` exist and read zero, so adding statutory
-- deductions later is arithmetic, not a re-modelling exercise.
--
-- Rate snapshots: every time_entry carries the cost rate it was captured at.
-- Giving someone a raise must never silently reprice last month's timesheet.
-- ============================================================================

-- ── staff ───────────────────────────────────────────────────────────────────
create table if not exists public.staff (
  id          uuid primary key default gen_random_uuid(),

  -- The portal login for this person, when they have one. Null for crew who
  -- are paid but never sign in.
  user_id     uuid unique references public.user_profiles(id) on delete set null,

  full_name   text not null,
  employee_no text,
  job_title   text,
  phone       text,
  email       text,

  -- Pay basis. 'hourly' bills hours × cost_rate_r; 'piece' means the money
  -- comes from staff_payments rows agreed per job. Hours are still captured
  -- for piece workers — they cost the job even when they do not set the pay.
  pay_type            text    not null default 'hourly' check (pay_type in ('hourly', 'piece')),
  cost_rate_r         numeric not null default 0,
  overtime_multiplier numeric not null default 1.5,

  employed_from date,
  employed_to   date,
  active        boolean not null default true,
  notes         text,

  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint staff_rate_non_negative check (cost_rate_r >= 0 and overtime_multiplier >= 1)
);

comment on table public.staff is
  'Employment record. Separate from user_profiles: a person can be paid without ever having a portal login.';
comment on column public.staff.cost_rate_r is
  'R/hr this person costs the business. NOT what a customer is billed — quote markup lives on the quote.';

create index if not exists staff_active_idx  on public.staff (active);
create index if not exists staff_user_id_idx on public.staff (user_id);

-- ── payslips ────────────────────────────────────────────────────────────────
-- Created before time_entries so entries can point at the run that paid them.
create table if not exists public.payslips (
  id        uuid primary key default gen_random_uuid(),
  staff_id  uuid not null references public.staff(id) on delete restrict,
  reference text not null unique,

  period_start date not null,
  period_end   date not null,

  normal_hours   numeric not null default 0,
  overtime_hours numeric not null default 0,

  hours_pay_r numeric not null default 0,
  piece_pay_r numeric not null default 0,
  other_pay_r numeric not null default 0,
  gross_pay_r numeric not null default 0,

  -- Reserved for PAYE/UIF/SDL. Zero today, so net == gross.
  deductions_r numeric not null default 0,
  net_pay_r    numeric not null default 0,

  status text not null default 'draft' check (status in ('draft', 'finalised', 'paid')),

  -- The line detail frozen at finalise. A timesheet corrected next week must
  -- not rewrite a payslip already handed to someone.
  lines jsonb not null default '[]'::jsonb,

  notes   text,
  paid_at timestamptz,

  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payslips_period_valid check (period_end >= period_start)
);

-- One pay run per person per period — the expensive mistake here is paying the
-- same week twice. Re-running means deleting the draft, which releases its
-- entries back to unpaid.
create unique index if not exists payslips_staff_period_uniq
  on public.payslips (staff_id, period_start, period_end);

create index if not exists payslips_period_idx on public.payslips (period_start, period_end);

-- ── time_entries ────────────────────────────────────────────────────────────
create table if not exists public.time_entries (
  id       uuid not null primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,

  -- Null for work that is not against a job (workshop, yard, training).
  job_id uuid references public.jobs(id) on delete set null,

  work_date date not null,

  -- Set when the hours came off the clock; null for hours typed into the grid.
  started_at    timestamptz,
  ended_at      timestamptz,
  break_minutes integer not null default 0,

  hours          numeric not null default 0,
  overtime_hours numeric not null default 0,

  category text not null default 'work'
    check (category in ('work', 'travel', 'workshop', 'standby', 'other')),
  notes text,

  -- Snapshot of the pay basis at capture time — see the header note.
  cost_rate_r         numeric not null default 0,
  overtime_multiplier numeric not null default 1.5,

  source text not null default 'manual' check (source in ('manual', 'clock')),
  status text not null default 'submitted'
    check (status in ('running', 'submitted', 'approved', 'paid')),

  approved_by uuid references public.user_profiles(id) on delete set null,
  approved_at timestamptz,

  -- Set when a pay run swallows this entry; cleared if that run is deleted.
  payslip_id uuid references public.payslips(id) on delete set null,

  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint time_entries_window_valid
    check (ended_at is null or started_at is null or ended_at > started_at),
  constraint time_entries_hours_non_negative
    check (hours >= 0 and overtime_hours >= 0 and break_minutes >= 0)
);

create index if not exists time_entries_staff_date_idx on public.time_entries (staff_id, work_date);
create index if not exists time_entries_job_idx        on public.time_entries (job_id);
create index if not exists time_entries_payslip_idx    on public.time_entries (payslip_id);
create index if not exists time_entries_status_idx     on public.time_entries (status);

-- A person can only be on the clock once. Without this, a double-tap on Start
-- leaves two running timers and the day is billed twice.
create unique index if not exists time_entries_one_running_per_staff
  on public.time_entries (staff_id) where status = 'running';

-- ── staff_payments ──────────────────────────────────────────────────────────
create table if not exists public.staff_payments (
  id       uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  job_id   uuid references public.jobs(id) on delete set null,

  pay_date date not null default current_date,

  -- 'deduction'/'advance' are accepted now but the payslip does not subtract
  -- them yet — that arrives with the statutory pass.
  kind text not null default 'piece'
    check (kind in ('piece', 'bonus', 'allowance', 'deduction', 'advance')),

  description text not null default '',
  amount_r    numeric not null default 0,

  payslip_id uuid references public.payslips(id) on delete set null,

  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_payments_staff_date_idx on public.staff_payments (staff_id, pay_date);
create index if not exists staff_payments_payslip_idx    on public.staff_payments (payslip_id);
create index if not exists staff_payments_job_idx        on public.staff_payments (job_id);

-- ── updated_at triggers ─────────────────────────────────────────────────────
create or replace function public.touch_staff_updated_at()
returns trigger language plpgsql set search_path = public as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists staff_touch_updated_at on public.staff;
create trigger staff_touch_updated_at before update on public.staff
  for each row execute function public.touch_staff_updated_at();

drop trigger if exists payslips_touch_updated_at on public.payslips;
create trigger payslips_touch_updated_at before update on public.payslips
  for each row execute function public.touch_staff_updated_at();

drop trigger if exists time_entries_touch_updated_at on public.time_entries;
create trigger time_entries_touch_updated_at before update on public.time_entries
  for each row execute function public.touch_staff_updated_at();

drop trigger if exists staff_payments_touch_updated_at on public.staff_payments;
create trigger staff_payments_touch_updated_at before update on public.staff_payments
  for each row execute function public.touch_staff_updated_at();

-- ============================================================================
-- RLS
-- ----------------------------------------------------------------------------
-- Wages are sensitive. The rule everywhere below is the same:
--   • managers/admins  — full read/write on everyone
--   • a staff member   — reads their OWN record, hours and payslips, and may
--                        capture/correct their own hours until a manager
--                        approves them or a pay run locks them
--   • customers        — nothing
-- ============================================================================

alter table public.staff          enable row level security;
alter table public.payslips       enable row level security;
alter table public.time_entries   enable row level security;
alter table public.staff_payments enable row level security;

-- Resolve the caller's own staff row. security definer so the helper can read
-- `staff` without recursing into the policies that call it.
create or replace function public.current_staff_id()
returns uuid language sql stable security definer set search_path = public as $fn$
  select id from public.staff where user_id = auth.uid() limit 1;
$fn$;

-- ── staff ───────────────────────────────────────────────────────────────────
create policy "staff_select" on public.staff
  for select using (
    user_id = auth.uid() or public.current_role() in ('manager', 'admin')
  );

create policy "staff_write" on public.staff
  for all
  using (public.current_role() in ('manager', 'admin'))
  with check (public.current_role() in ('manager', 'admin'));

-- ── time_entries ────────────────────────────────────────────────────────────
create policy "time_entries_select" on public.time_entries
  for select using (
    staff_id = public.current_staff_id() or public.current_role() in ('manager', 'admin')
  );

-- Own hours: capture freely.
create policy "time_entries_insert_own" on public.time_entries
  for insert with check (
    staff_id = public.current_staff_id() or public.current_role() in ('manager', 'admin')
  );

-- Own hours: correctable only while still unapproved and unpaid. Once a
-- manager approves — or a pay run claims it — the entry is the manager's.
create policy "time_entries_update_own" on public.time_entries
  for update
  using (
    public.current_role() in ('manager', 'admin')
    or (staff_id = public.current_staff_id() and status in ('running', 'submitted') and payslip_id is null)
  )
  with check (
    public.current_role() in ('manager', 'admin')
    or (staff_id = public.current_staff_id() and status in ('running', 'submitted') and payslip_id is null)
  );

create policy "time_entries_delete_own" on public.time_entries
  for delete using (
    public.current_role() in ('manager', 'admin')
    or (staff_id = public.current_staff_id() and status in ('running', 'submitted') and payslip_id is null)
  );

-- ── staff_payments ──────────────────────────────────────────────────────────
-- A worker sees what they were paid; only a manager decides it.
create policy "staff_payments_select" on public.staff_payments
  for select using (
    staff_id = public.current_staff_id() or public.current_role() in ('manager', 'admin')
  );

create policy "staff_payments_write" on public.staff_payments
  for all
  using (public.current_role() in ('manager', 'admin'))
  with check (public.current_role() in ('manager', 'admin'));

-- ── payslips ────────────────────────────────────────────────────────────────
create policy "payslips_select" on public.payslips
  for select using (
    staff_id = public.current_staff_id() or public.current_role() in ('manager', 'admin')
  );

create policy "payslips_write" on public.payslips
  for all
  using (public.current_role() in ('manager', 'admin'))
  with check (public.current_role() in ('manager', 'admin'));

-- ============================================================================
-- Permissions matrix: the new 'staff' section (migration 060 shape).
-- Manager + admin. Field workers capture their own hours from the dashboard
-- clock, which needs no section grant — the wage bill stays out of their reach.
-- ============================================================================
insert into public.role_permissions (role, section, allowed) values
  ('field_worker'::user_role, 'staff', false),
  ('manager'::user_role,      'staff', true),
  ('admin'::user_role,        'staff', true)
on conflict (role, section) do nothing;

-- ============================================================================
-- Backfill: every existing employee login becomes a staff record, so the page
-- is populated on day one rather than presenting an empty table. Rates start
-- at zero — Matthew sets each person's real rate on the staff page.
-- ============================================================================
insert into public.staff (user_id, full_name, email, phone, job_title, active)
select p.id,
       coalesce(nullif(p.full_name, ''), p.email, 'Unnamed'),
       p.email,
       p.phone,
       case p.role
         when 'admin'        then 'Owner'
         when 'manager'      then 'Manager'
         when 'field_worker' then 'Technician'
       end,
       true
from public.user_profiles p
where p.role in ('field_worker', 'manager', 'admin')
on conflict (user_id) do nothing;
