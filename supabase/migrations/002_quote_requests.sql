-- ============================================================
-- Quote Requests — AI-assisted solar quoting workflow
-- Technicians submit a site survey; admin reviews and generates
-- ============================================================

create type quote_request_status as enum ('pending', 'generated', 'sent');

create table public.quote_requests (
  id                   uuid primary key default uuid_generate_v4(),
  submitted_by         uuid not null references public.user_profiles(id),
  status               quote_request_status not null default 'pending',

  -- Customer details
  customer_name        text not null,
  customer_phone       text,
  customer_email       text,
  address              text,
  municipality         text,

  -- Site information
  grid_supply          text not null default 'Single Phase',
  roof_type            text,
  storeys              text not null default '1',
  monthly_kwh          text,

  -- System requirements
  system_type          text not null default 'Hybrid',
  battery_hours        text not null default '4',
  essential_load       text not null default '3',
  ev_charger           text not null default 'No',
  equipment_preference text,
  notes                text,

  -- Generated quote (populated by admin after AI generation)
  generated_quote      text,
  generated_at         timestamptz,
  generated_by         uuid references public.user_profiles(id),

  created_at           timestamptz not null default now()
);

alter table public.quote_requests enable row level security;

-- Any authenticated employee or admin can submit a new request
create policy "Employees can submit quote requests"
  on public.quote_requests for insert
  with check (
    submitted_by = auth.uid()
    and public.current_role() in ('field_worker', 'manager', 'admin')
  );

-- Submitter sees their own; managers + admins see all
create policy "Quote requests are visible to submitter and managers"
  on public.quote_requests for select
  using (
    submitted_by = auth.uid()
    or public.current_role() in ('manager', 'admin')
  );

-- Only admin can update (to save generated quote and status)
create policy "Admin can update quote requests"
  on public.quote_requests for update
  using (public.current_role() = 'admin');
