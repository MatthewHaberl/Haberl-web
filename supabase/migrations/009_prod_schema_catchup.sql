-- Catch the live project up to the app schema expected by the portal.
-- This is safe to run on a partially migrated production database.

alter type quote_request_status add value if not exists 'accepted';
alter type quote_request_status add value if not exists 'declined';

alter table public.quote_requests
  add column if not exists site_number integer not null default 1;

comment on column public.quote_requests.site_number is
  'Customer site index for multi-site quoting (1 = primary site, 2+ = secondary sites).';

create table if not exists public.equipment_catalog (
  id uuid primary key default uuid_generate_v4(),
  category text not null check (category in ('inverter', 'battery', 'panel', 'other')),
  brand text not null,
  sku text not null unique,
  description text not null,
  watts_ac integer,
  watts_dc integer,
  kwh numeric(8,2),
  phase text not null default 'any' check (phase in ('single', 'three', 'any')),
  cost_rands numeric(12,2) not null check (cost_rands >= 0),
  isc_amps numeric(8,2),
  voc_volts numeric(8,2),
  active boolean not null default true,
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists equipment_catalog_category_active_idx
  on public.equipment_catalog (category, active, brand, sort_order);

alter table public.equipment_catalog enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'equipment_catalog'
      and policyname = 'Authenticated users can read equipment catalog'
  ) then
    create policy "Authenticated users can read equipment catalog"
      on public.equipment_catalog for select
      using (auth.uid() is not null);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'equipment_catalog'
      and policyname = 'Admin can manage equipment catalog'
  ) then
    create policy "Admin can manage equipment catalog"
      on public.equipment_catalog for all
      using (public.current_role() = 'admin')
      with check (public.current_role() = 'admin');
  end if;
end
$$;

create or replace function public.set_equipment_catalog_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_equipment_catalog_updated_at on public.equipment_catalog;
create trigger trg_equipment_catalog_updated_at
before update on public.equipment_catalog
for each row
execute function public.set_equipment_catalog_updated_at();

create table if not exists public.quote_tier_configs (
  id uuid primary key default uuid_generate_v4(),
  min_inverter_kw numeric(6,2) not null,
  max_inverter_kw numeric(6,2) not null,
  tier text not null check (tier in ('premium', 'recommended', 'budget')),
  phase text not null default 'any' check (phase in ('single', 'three', 'any')),
  inverter_id uuid not null references public.equipment_catalog(id) on delete restrict,
  battery_id uuid not null references public.equipment_catalog(id) on delete restrict,
  panel_id uuid not null references public.equipment_catalog(id) on delete restrict,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quote_tier_configs_bracket_ck check (min_inverter_kw <= max_inverter_kw),
  constraint quote_tier_configs_unique unique (min_inverter_kw, max_inverter_kw, tier, phase)
);

create index if not exists quote_tier_configs_phase_active_idx
  on public.quote_tier_configs (phase, active, min_inverter_kw, max_inverter_kw, sort_order);

alter table public.quote_tier_configs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'quote_tier_configs'
      and policyname = 'Authenticated users can read quote tier configs'
  ) then
    create policy "Authenticated users can read quote tier configs"
      on public.quote_tier_configs for select
      using (auth.uid() is not null);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'quote_tier_configs'
      and policyname = 'Admin can manage quote tier configs'
  ) then
    create policy "Admin can manage quote tier configs"
      on public.quote_tier_configs for all
      using (public.current_role() = 'admin')
      with check (public.current_role() = 'admin');
  end if;
end
$$;

create or replace function public.set_quote_tier_configs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_quote_tier_configs_updated_at on public.quote_tier_configs;
create trigger trg_quote_tier_configs_updated_at
before update on public.quote_tier_configs
for each row
execute function public.set_quote_tier_configs_updated_at();

alter table public.quote_requests
  add column if not exists generation_method text not null default 'ai'
    check (generation_method in ('ai', 'calculator', 'manual')),
  add column if not exists selected_inverter_id uuid references public.equipment_catalog(id) on delete set null,
  add column if not exists selected_battery_id uuid references public.equipment_catalog(id) on delete set null,
  add column if not exists selected_panel_id uuid references public.equipment_catalog(id) on delete set null,
  add column if not exists selected_battery_qty integer,
  add column if not exists selected_panel_qty integer,
  add column if not exists cable_route_m numeric(8,1),
  add column if not exists storeys_premium_rands integer not null default 0;

comment on column public.quote_requests.generation_method is
  'How the quote was produced: ai, calculator, or manual.';

comment on column public.quote_requests.selected_inverter_id is
  'Catalog item used by the deterministic calculator for the saved quote.';

comment on column public.quote_requests.selected_battery_id is
  'Catalog battery item used by the deterministic calculator for the saved quote.';

comment on column public.quote_requests.selected_panel_id is
  'Catalog panel item used by the deterministic calculator for the saved quote.';

comment on column public.quote_requests.selected_battery_qty is
  'Battery quantity saved alongside a calculated quote.';

comment on column public.quote_requests.selected_panel_qty is
  'Panel quantity saved alongside a calculated quote.';

comment on column public.quote_requests.cable_route_m is
  'Admin-entered cable route length in metres for calculator pricing.';

comment on column public.quote_requests.storeys_premium_rands is
  'Explicit storeys premium persisted with calculator-generated quotes.';
