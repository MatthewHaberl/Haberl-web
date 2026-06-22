-- ============================================================
-- Migration 033: quote catch-points
-- A place for Matthew to flag, mid-quote, "this is where an issue
-- gets caught" against a specific workflow step. These are candidate
-- audit rules — reviewed, then promoted into the rules registry.
-- Additive only; nothing else is touched.
-- ============================================================

create table if not exists public.quote_catch_points (
  id                 uuid primary key default uuid_generate_v4(),
  flow_id            text not null,                       -- which workflow diagram (e.g. 'design-workspace')
  step_label         text,                                -- which step / node it relates to
  note               text not null,                       -- what to catch / what's wrong
  severity           text not null default 'warn',        -- block | warn | info
  status             text not null default 'open',        -- open | added | dismissed
  quote_request_id   uuid references public.quote_requests(id) on delete set null,
  created_by         uuid references public.user_profiles(id),
  created_at         timestamptz not null default now()
);

create index if not exists quote_catch_points_flow_idx on public.quote_catch_points(flow_id);

alter table public.quote_catch_points enable row level security;

-- Employees, managers & admins can read and add catch-points
create policy "Staff read catch-points"
  on public.quote_catch_points for select
  using (public.current_role() in ('field_worker', 'manager', 'admin'));

create policy "Staff add catch-points"
  on public.quote_catch_points for insert
  with check (public.current_role() in ('field_worker', 'manager', 'admin'));

-- Managers & admins can update status (e.g. mark added / dismissed)
create policy "Managers update catch-points"
  on public.quote_catch_points for update
  using (public.current_role() in ('manager', 'admin'));

-- ============================================================
-- End migration
-- ============================================================
