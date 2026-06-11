-- Phase 2 "design-accurate BOM": measured cable routes drawn on the roof
-- designer, purchasable pack sizes on the catalog, and a design-lock gate
-- that freezes the BOM before procurement.

-- 1 ── cable_routes: polylines drawn on the map, one row per run
create table if not exists public.cable_routes (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references public.quote_requests(id) on delete cascade,
  route_type text not null
    check (route_type in ('dc_string', 'ac_run', 'battery', 'earth')),
  label text,
  points jsonb not null default '[]'::jsonb,  -- [{lat,lng}, ...]
  measured_m numeric not null default 0,      -- horizontal geodesic length
  vertical_m numeric not null default 0,      -- storeys drop / rise allowance
  slack_pct numeric not null default 10,      -- termination + routing slack
  final_m numeric not null default 0,         -- (measured + vertical) × (1 + slack)
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists cable_routes_quote_idx
  on public.cable_routes (quote_request_id, sort_order);

alter table public.cable_routes enable row level security;

create policy "Staff can manage cable routes"
  on public.cable_routes for all
  using ("current_role"() in ('field_worker', 'manager', 'admin'));

-- 2 ── purchasable pack sizes on the catalog (cable drums, conduit sticks…)
alter table public.equipment_catalog
  add column if not exists pack_size numeric,  -- e.g. 100 (m per drum), 4 (m per stick)
  add column if not exists pack_unit text;     -- e.g. 'm drum', 'm stick', 'box of 10'

-- 3 ── design lock: freeze the BOM that procurement buys against
alter table public.quote_requests
  add column if not exists design_locked_at timestamptz,
  add column if not exists design_locked_by uuid references public.user_profiles(id),
  add column if not exists bom_snapshot jsonb;
