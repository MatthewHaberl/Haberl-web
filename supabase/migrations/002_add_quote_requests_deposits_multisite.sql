-- ============================================================
-- Migration: Add quote_requests table with deposits & multi-site
-- Date: 2026-06-01
-- ============================================================

-- ── quote_requests (technician submissions) ────────────────────
create table public.quote_requests (
  id                      uuid primary key default uuid_generate_v4(),
  customer_id             uuid not null references public.user_profiles(id) on delete cascade,
  site_number             integer not null default 1,      -- which site for this customer (1, 2, 3...)
  customer_name           text not null,
  customer_phone          text,
  customer_email          text,
  site_address            text,
  municipality            text not null,
  grid_supply_type        text not null default 'single_phase',  -- single_phase | three_phase
  roof_type               text,                              -- tile | ibr | flat
  storeys                 integer default 2,
  avg_monthly_usage_kwh   numeric(8,2),
  system_type             text not null default 'hybrid',    -- hybrid | off_grid | grid_tie
  battery_backup          boolean default true,
  essential_load_kw       numeric(8,2) default 0,
  target_offgrid_percent  numeric(5,2) default 90,
  ev_charger_required     boolean default false,
  inverter_brand_pref     text,                             -- NULL = AI decides
  battery_brand_pref      text,
  panel_brand_pref        text,
  photo_urls              text[] default '{}',              -- Supabase storage URLs
  notes                   text,

  -- Quote generation & status
  quote_generated         boolean default false,
  quote_html              text,                              -- Rendered HTML quote
  quote_json              jsonb,                             -- BOM as JSON
  quote_number            text,                              -- QUO-YYYY-###
  quote_version           text default 'simplified',         -- simplified | detailed

  -- Deposit items: array of line item names marked for deposit
  deposit_items           text[] default '{}'::text[],      -- e.g. ['Inverter','Battery','Panels (14×)','Mounting structure']
  deposit_amount          integer,                           -- cents
  total_amount            integer,                           -- cents

  -- Status & metadata
  status                  text not null default 'draft',     -- draft | generated | sent | accepted | declined
  created_by              uuid not null references public.user_profiles(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- ── equipment_brands (reference for dropdown UI) ───────────────
create table public.equipment_brands (
  id        uuid primary key default uuid_generate_v4(),
  category  text not null,  -- inverter | battery | panel
  brand     text not null,
  active    boolean default true,
  created_at timestamptz default now()
);

-- ── Row Level Security ─────────────────────────────────────────
alter table public.quote_requests enable row level security;
alter table public.equipment_brands enable row level security;

-- Customers can view their own quote requests
create policy "Customers view own quote requests"
  on public.quote_requests for select
  using (customer_id = auth.uid() or public.current_role() in ('manager', 'admin'));

-- Employees & admins can create quote requests
create policy "Employees create quote requests"
  on public.quote_requests for insert
  with check (public.current_role() in ('field_worker', 'manager', 'admin'));

-- Employees & admins can update quote requests
create policy "Employees update quote requests"
  on public.quote_requests for update
  using (public.current_role() in ('field_worker', 'manager', 'admin'));

-- Admins & managers can view all quote requests
create policy "Admins view all quote requests"
  on public.quote_requests for select
  using (public.current_role() in ('manager', 'admin'));

-- Equipment brands are publicly readable
create policy "Public read equipment brands"
  on public.equipment_brands for select
  using (true);

-- Only admins can manage equipment brands
create policy "Admin manage equipment brands"
  on public.equipment_brands for insert
  with check (public.current_role() = 'admin');

create policy "Admin update equipment brands"
  on public.equipment_brands for update
  using (public.current_role() = 'admin');

create policy "Admin delete equipment brands"
  on public.equipment_brands for delete
  using (public.current_role() = 'admin');

-- ============================================================
-- Seed equipment brands (standard Haberl stock as of June 2026)
-- ============================================================

insert into public.equipment_brands (category, brand) values
  ('inverter', 'Sigenergy'),
  ('inverter', 'Deye'),
  ('inverter', 'Sunsynk'),
  ('inverter', 'Solis'),
  ('inverter', 'LuxPower'),
  ('inverter', 'FoxESS'),
  ('inverter', 'Growatt'),
  ('inverter', 'Victron'),
  ('inverter', 'GoodWe'),
  ('inverter', 'SolaX'),
  ('inverter', 'Huawei'),

  ('battery', 'SigenStor'),
  ('battery', 'Dyness'),
  ('battery', 'Sunsynk'),
  ('battery', 'FreedomWon'),
  ('battery', 'Pylontech'),
  ('battery', 'Hubble'),
  ('battery', 'Solar MD'),
  ('battery', 'BYD'),
  ('battery', 'Eenovance'),
  ('battery', 'Photon'),

  ('panel', 'JA Solar'),
  ('panel', 'Aiko'),
  ('panel', 'LONGi'),
  ('panel', 'Trina'),
  ('panel', 'Canadian Solar'),
  ('panel', 'Jinko'),
  ('panel', 'ARTsolar'),
  ('panel', 'Risen');

-- ============================================================
-- End migration
-- ============================================================
