-- ============================================================
-- Haberl Web — Initial Schema
-- Run in Supabase SQL editor or via supabase db push
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Types ────────────────────────────────────────────────────
create type user_role     as enum ('customer', 'field_worker', 'manager', 'admin');
create type job_status    as enum ('pending', 'in_progress', 'completed', 'cancelled');
create type job_priority  as enum ('low', 'medium', 'high', 'urgent');
create type order_status  as enum ('pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled');
create type doc_type      as enum ('coc', 'sld', 'warranty', 'invoice', 'photo', 'other');
create type quote_status  as enum ('draft', 'sent', 'accepted', 'declined');
create type site_status   as enum ('active', 'pending', 'maintenance', 'decommissioned');

-- ── user_profiles ─────────────────────────────────────────────
-- Extends Supabase auth.users. Created automatically via trigger on signup.
create table public.user_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        user_role not null default 'customer',
  full_name   text not null default '',
  phone       text,
  email       text not null default '',
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- Trigger: create a profile row on new user signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (id, email, full_name, phone, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── sites ─────────────────────────────────────────────────────
create table public.sites (
  id              uuid primary key default uuid_generate_v4(),
  customer_id     uuid not null references public.user_profiles(id) on delete cascade,
  name            text not null,
  address         text not null default '',
  system_type     text not null default '',
  system_size_kw  numeric(8,2),
  install_date    date,
  warranty_expiry date,
  status          site_status not null default 'active',
  gps_lat         numeric(10,7),
  gps_lng         numeric(10,7),
  created_at      timestamptz not null default now()
);

-- ── documents ─────────────────────────────────────────────────
create table public.documents (
  id           uuid primary key default uuid_generate_v4(),
  site_id      uuid not null references public.sites(id) on delete cascade,
  type         doc_type not null default 'other',
  name         text not null,
  file_url     text not null,
  uploaded_by  uuid not null references public.user_profiles(id),
  created_at   timestamptz not null default now()
);

-- ── jobs ──────────────────────────────────────────────────────
create table public.jobs (
  id             uuid primary key default uuid_generate_v4(),
  site_id        uuid references public.sites(id) on delete set null,
  assigned_to    uuid not null references public.user_profiles(id),
  title          text not null,
  description    text,
  scheduled_date date,
  status         job_status not null default 'pending',
  priority       job_priority not null default 'medium',
  created_by     uuid not null references public.user_profiles(id),
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);

-- ── job_tasks ─────────────────────────────────────────────────
create table public.job_tasks (
  id           uuid primary key default uuid_generate_v4(),
  job_id       uuid not null references public.jobs(id) on delete cascade,
  description  text not null,
  completed    boolean not null default false,
  completed_at timestamptz,
  notes        text
);

-- ── service_records ───────────────────────────────────────────
create table public.service_records (
  id               uuid primary key default uuid_generate_v4(),
  site_id          uuid not null references public.sites(id) on delete cascade,
  job_id           uuid references public.jobs(id) on delete set null,
  date             date not null,
  technician_id    uuid not null references public.user_profiles(id),
  work_performed   text not null,
  materials_used   text,
  notes            text
);

-- ── products ──────────────────────────────────────────────────
create table public.products (
  id            uuid primary key default uuid_generate_v4(),
  slug          text unique not null,
  name          text not null,
  description   text,
  price         integer not null,        -- cents (ZAR)
  compare_price integer,
  images        text[] not null default '{}',
  category      text,
  sku           text,
  stock_qty     integer not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ── orders ────────────────────────────────────────────────────
create table public.orders (
  id                    uuid primary key default uuid_generate_v4(),
  customer_id           uuid not null references public.user_profiles(id),
  status                order_status not null default 'pending',
  subtotal              integer not null default 0,   -- cents
  tax                   integer not null default 0,
  total                 integer not null default 0,
  payfast_payment_id    text,
  created_at            timestamptz not null default now()
);

create table public.order_items (
  id           uuid primary key default uuid_generate_v4(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  product_id   uuid not null references public.products(id),
  quantity     integer not null default 1,
  unit_price   integer not null,
  total_price  integer not null
);

-- ── quotes ────────────────────────────────────────────────────
create table public.quotes (
  id          uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.user_profiles(id),
  site_id     uuid references public.sites(id) on delete set null,
  items       jsonb not null default '[]',
  subtotal    integer not null default 0,
  tax         integer not null default 0,
  total       integer not null default 0,
  status      quote_status not null default 'draft',
  valid_until date,
  notes       text,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.user_profiles  enable row level security;
alter table public.sites           enable row level security;
alter table public.documents       enable row level security;
alter table public.jobs            enable row level security;
alter table public.job_tasks       enable row level security;
alter table public.service_records enable row level security;
alter table public.products        enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;
alter table public.quotes          enable row level security;

-- Helper: get current user's role
create or replace function public.current_role()
returns user_role language sql security definer stable as $$
  select role from public.user_profiles where id = auth.uid()
$$;

-- ── user_profiles policies ────────────────────────────────────
create policy "Users can view own profile"
  on public.user_profiles for select
  using (id = auth.uid() or public.current_role() in ('manager', 'admin'));

create policy "Users can update own profile"
  on public.user_profiles for update
  using (id = auth.uid());

create policy "Managers can update any profile"
  on public.user_profiles for update
  using (public.current_role() in ('manager', 'admin'));

-- ── sites policies ────────────────────────────────────────────
create policy "Customers see own sites"
  on public.sites for select
  using (
    customer_id = auth.uid()
    or public.current_role() in ('field_worker', 'manager', 'admin')
  );

create policy "Managers can insert/update sites"
  on public.sites for all
  using (public.current_role() in ('manager', 'admin'));

-- ── documents policies ────────────────────────────────────────
create policy "Documents follow site access"
  on public.documents for select
  using (
    exists (
      select 1 from public.sites s
      where s.id = site_id
        and (s.customer_id = auth.uid() or public.current_role() in ('field_worker', 'manager', 'admin'))
    )
  );

create policy "Managers can manage documents"
  on public.documents for all
  using (public.current_role() in ('manager', 'admin'));

-- ── jobs policies ─────────────────────────────────────────────
create policy "Field workers see assigned jobs"
  on public.jobs for select
  using (
    assigned_to = auth.uid()
    or public.current_role() in ('manager', 'admin')
  );

create policy "Field workers can update assigned jobs"
  on public.jobs for update
  using (assigned_to = auth.uid() or public.current_role() in ('manager', 'admin'));

create policy "Managers can manage all jobs"
  on public.jobs for all
  using (public.current_role() in ('manager', 'admin'));

-- ── job_tasks policies ────────────────────────────────────────
create policy "Job tasks follow job access"
  on public.job_tasks for select
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and (j.assigned_to = auth.uid() or public.current_role() in ('manager', 'admin'))
    )
  );

create policy "Workers can update tasks on assigned jobs"
  on public.job_tasks for update
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and (j.assigned_to = auth.uid() or public.current_role() in ('manager', 'admin'))
    )
  );

-- ── service_records policies ──────────────────────────────────
create policy "Service records follow site access"
  on public.service_records for select
  using (
    exists (
      select 1 from public.sites s
      where s.id = site_id
        and (s.customer_id = auth.uid() or public.current_role() in ('field_worker', 'manager', 'admin'))
    )
  );

create policy "Managers can manage service records"
  on public.service_records for all
  using (public.current_role() in ('manager', 'admin'));

-- ── products policies ─────────────────────────────────────────
create policy "Anyone can view active products"
  on public.products for select
  using (active = true or public.current_role() in ('manager', 'admin'));

create policy "Managers can manage products"
  on public.products for all
  using (public.current_role() in ('manager', 'admin'));

-- ── orders policies ───────────────────────────────────────────
create policy "Customers see own orders"
  on public.orders for select
  using (customer_id = auth.uid() or public.current_role() in ('manager', 'admin'));

create policy "Customers can insert own orders"
  on public.orders for insert
  with check (customer_id = auth.uid());

create policy "Managers can manage all orders"
  on public.orders for all
  using (public.current_role() in ('manager', 'admin'));

-- ── order_items policies ──────────────────────────────────────
create policy "Order items follow order access"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = auth.uid() or public.current_role() in ('manager', 'admin'))
    )
  );

-- ── quotes policies ───────────────────────────────────────────
create policy "Customers see own quotes"
  on public.quotes for select
  using (customer_id = auth.uid() or public.current_role() in ('manager', 'admin'));

create policy "Managers can manage all quotes"
  on public.quotes for all
  using (public.current_role() in ('manager', 'admin'));
