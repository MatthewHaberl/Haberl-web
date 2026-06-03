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

create policy "Authenticated users can read equipment catalog"
  on public.equipment_catalog for select
  using (auth.uid() is not null);

create policy "Admin can manage equipment catalog"
  on public.equipment_catalog for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

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
