-- ============================================================
-- Migration 040: customers as a first-class CRM entity
-- ------------------------------------------------------------
-- Until now a "customer" only existed as a Supabase auth login:
-- user_profiles.id == auth.users.id, and sites/quotes/jobs hung off
-- that auth id. So a prospect could not be a customer until an account
-- (and an email invite) was created for them.
--
-- This migration introduces public.customers: the business contact.
-- It can exist with no login at all (even with only a phone number),
-- and links to a login via auth_user_id once the person registers.
--
--   account status (derived, not stored):
--     auth_user_id IS NULL          -> Prospect
--     auth_user_id + registered_at NULL -> Invited
--     registered_at IS NOT NULL     -> Registered (verified)
--
-- sites.customer_id is repointed from user_profiles(id) to customers(id).
-- Every customer-facing RLS policy that compared sites.customer_id to
-- auth.uid() is rewritten to use the new current_customer_id() helper.
-- ============================================================

-- ── 1. customers table ───────────────────────────────────────
create table if not exists public.customers (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null default '',
  email         text,
  phone         text,
  address       text,
  is_business   boolean not null default false,
  contact_name  text,                       -- business contact person
  source        text not null default 'manual',  -- manual | lead | quote | website | backfill
  notes         text,
  auth_user_id  uuid references auth.users(id) on delete set null,
  invited_at    timestamptz,                -- when the portal invite was sent
  registered_at timestamptz,                -- when they verified (set a password)
  created_by    uuid references public.user_profiles(id),
  created_at    timestamptz not null default now()
);

-- one customer per login; one customer per email (when present)
create unique index if not exists customers_auth_user_id_key
  on public.customers (auth_user_id) where auth_user_id is not null;
create unique index if not exists customers_email_lower_key
  on public.customers (lower(email)) where email is not null and email <> '';

-- ── 2. helper: current auth user -> their customer id ─────────
-- Returns NULL when the logged-in user has no customer record, which
-- makes every "customer_id = current_customer_id()" comparison false.
create or replace function public.current_customer_id()
returns uuid language sql security definer stable set search_path = public as $$
  select id from public.customers where auth_user_id = auth.uid() limit 1
$$;

-- ── 3. backfill: a customer row for each existing customer login ─
insert into public.customers (full_name, email, phone, auth_user_id, registered_at, created_at, source)
select up.full_name, nullif(up.email, ''), up.phone, up.id, up.created_at, up.created_at, 'backfill'
from public.user_profiles up
where up.role = 'customer'
  and not exists (select 1 from public.customers c where c.auth_user_id = up.id);

-- ── 4. repoint sites.customer_id -> customers(id) ─────────────
-- sites currently has 0 rows, so this needs no data backfill.
alter table public.sites drop constraint if exists sites_customer_id_fkey;
alter table public.sites
  add constraint sites_customer_id_fkey
  foreign key (customer_id) references public.customers(id) on delete cascade;

-- ── 5. rewrite customer-facing policies: auth.uid() -> current_customer_id()
-- These all keyed off sites.customer_id, which is now a customers.id.

-- sites
drop policy if exists "Customers see own sites" on public.sites;
create policy "Customers see own sites"
  on public.sites for select
  using (
    customer_id = public.current_customer_id()
    or public.current_role() in ('field_worker', 'manager', 'admin')
  );

-- documents
drop policy if exists "Documents follow site access" on public.documents;
create policy "Documents follow site access"
  on public.documents for select
  using (
    exists (
      select 1 from public.sites s
      where s.id = documents.site_id
        and (s.customer_id = public.current_customer_id()
             or public.current_role() in ('field_worker', 'manager', 'admin'))
    )
  );

-- service_records
drop policy if exists "Service records follow site access" on public.service_records;
create policy "Service records follow site access"
  on public.service_records for select
  using (
    exists (
      select 1 from public.sites s
      where s.id = service_records.site_id
        and (s.customer_id = public.current_customer_id()
             or public.current_role() in ('field_worker', 'manager', 'admin'))
    )
  );

-- jobs
drop policy if exists "Customers see jobs for their sites" on public.jobs;
create policy "Customers see jobs for their sites"
  on public.jobs for select
  using (
    exists (
      select 1 from public.sites s
      where s.id = jobs.site_id
        and s.customer_id = public.current_customer_id()
    )
  );

-- job_status_history
drop policy if exists "Customers see visible job history" on public.job_status_history;
create policy "Customers see visible job history"
  on public.job_status_history for select
  using (
    customer_visible
    and exists (
      select 1 from public.jobs j
      join public.sites s on s.id = j.site_id
      where j.id = job_status_history.job_id
        and s.customer_id = public.current_customer_id()
    )
  );

-- job_tasks
drop policy if exists "Customers see tasks for their site jobs" on public.job_tasks;
create policy "Customers see tasks for their site jobs"
  on public.job_tasks for select
  using (
    exists (
      select 1 from public.jobs j
      join public.sites s on s.id = j.site_id
      where j.id = job_tasks.job_id
        and s.customer_id = public.current_customer_id()
    )
  );

-- monitoring_systems
drop policy if exists "Customers can read own monitoring systems" on public.monitoring_systems;
create policy "Customers can read own monitoring systems"
  on public.monitoring_systems for select
  using (
    public.current_role() = 'customer'
    and site_id in (select id from public.sites where customer_id = public.current_customer_id())
  );

-- monitoring_readings
drop policy if exists "Customers can read own readings" on public.monitoring_readings;
create policy "Customers can read own readings"
  on public.monitoring_readings for select
  using (
    system_id in (
      select ms.id from public.monitoring_systems ms
      join public.sites s on s.id = ms.site_id
      where s.customer_id = public.current_customer_id()
    )
  );

-- monitoring_alert_events
drop policy if exists "Customers can read own alert events" on public.monitoring_alert_events;
create policy "Customers can read own alert events"
  on public.monitoring_alert_events for select
  using (
    system_id in (
      select ms.id from public.monitoring_systems ms
      join public.sites s on s.id = ms.site_id
      where s.customer_id = public.current_customer_id()
    )
  );

-- ── 6. link columns on quote_requests + leads ─────────────────
alter table public.quote_requests add column if not exists customer_id uuid references public.customers(id);
alter table public.leads          add column if not exists customer_id uuid references public.customers(id);

-- ── 7. backfill quote_requests.customer_id (history on the Customers page)
-- (a) link quotes whose email already matches a customer
update public.quote_requests q
set customer_id = c.id
from public.customers c
where q.customer_id is null
  and q.customer_email is not null and q.customer_email <> ''
  and lower(c.email) = lower(q.customer_email);

-- (b) create a customer for each remaining quote that has an email
with ins as (
  insert into public.customers (full_name, email, phone, address, is_business, contact_name, source, created_at)
  select distinct on (lower(q.customer_email))
    coalesce(nullif(q.customer_name, ''), 'Unknown'),
    lower(q.customer_email),
    q.customer_phone,
    coalesce(q.customer_address, q.address),
    coalesce(q.is_business, false),
    q.contact_name,
    'quote',
    q.created_at
  from public.quote_requests q
  where q.customer_id is null
    and q.customer_email is not null and q.customer_email <> ''
    and not exists (select 1 from public.customers c where lower(c.email) = lower(q.customer_email))
  order by lower(q.customer_email), q.created_at
  returning id, email
)
update public.quote_requests q
set customer_id = ins.id
from ins
where q.customer_id is null and lower(q.customer_email) = ins.email;

-- (c) remaining quotes have no email — create one customer per quote
do $$
declare
  r record;
  new_id uuid;
begin
  for r in
    select id, customer_name, customer_phone, customer_address, address, is_business, contact_name, created_at
    from public.quote_requests
    where customer_id is null
  loop
    insert into public.customers (full_name, phone, address, is_business, contact_name, source, created_at)
    values (
      coalesce(nullif(r.customer_name, ''), 'Unknown'),
      r.customer_phone,
      coalesce(r.customer_address, r.address),
      coalesce(r.is_business, false),
      r.contact_name,
      'quote',
      r.created_at
    )
    returning id into new_id;
    update public.quote_requests set customer_id = new_id where id = r.id;
  end loop;
end $$;

-- (Leads are NOT auto-converted — converting a lead to a customer is a
--  deliberate action in the Leads UI.)

-- ── 8. customers RLS ──────────────────────────────────────────
alter table public.customers enable row level security;

create policy "Customers visible to staff and self"
  on public.customers for select
  using (
    auth_user_id = auth.uid()
    or public.current_role() in ('field_worker', 'manager', 'admin')
  );

create policy "Managers can insert customers"
  on public.customers for insert
  with check (public.current_role() in ('manager', 'admin'));

create policy "Managers can update customers"
  on public.customers for update
  using (public.current_role() in ('manager', 'admin'));

create policy "Managers can delete customers"
  on public.customers for delete
  using (public.current_role() in ('manager', 'admin'));

-- ── 9. extend the new-user trigger to link the CRM record ─────
-- Invite links carry customer_id in user metadata; self-signups match by
-- email. A link failure must never block account creation.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_customer_id uuid;
begin
  insert into public.user_profiles (id, email, full_name, phone, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    'customer'  -- never trust client-supplied role; admin promotes via dashboard
  );

  begin
    v_customer_id := nullif(new.raw_user_meta_data->>'customer_id', '')::uuid;
  exception when others then
    v_customer_id := null;
  end;

  if v_customer_id is not null then
    update public.customers
      set auth_user_id = new.id
      where id = v_customer_id and auth_user_id is null;
  elsif coalesce(new.email, '') <> '' then
    update public.customers
      set auth_user_id = new.id
      where auth_user_id is null
        and email is not null
        and lower(email) = lower(new.email);
  end if;

  return new;
end;
$$;
