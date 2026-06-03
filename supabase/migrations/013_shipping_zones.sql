-- ============================================================
-- Phase 2: Shipping Zones (Weight-based Delivery Calculation)
-- ============================================================

create table if not exists public.shipping_zones (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,           -- "Gauteng", "Outside Gauteng"
  description text,
  base_fee_cents integer not null,     -- base cost in cents
  per_kg_rate_cents integer not null,  -- cost per kg in cents
  max_weight_kg numeric(8,2),          -- optional weight limit
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── RLS ────────────────────────────────────────────────────────
alter table public.shipping_zones enable row level security;

create policy "Anyone can view active shipping zones"
  on public.shipping_zones for select
  using (active = true or public.current_role() in ('manager', 'admin'));

create policy "Admin can manage shipping zones"
  on public.shipping_zones for all
  using (public.current_role() in ('manager', 'admin'));

-- ── Update trigger ──────────────────────────────────────────────
create or replace function public.set_shipping_zones_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_shipping_zones_updated_at on public.shipping_zones;
create trigger trg_shipping_zones_updated_at
before update on public.shipping_zones
for each row execute function public.set_shipping_zones_updated_at();

-- ── Default shipping zones (Gauteng + Outside) ──────────────────
insert into public.shipping_zones (name, description, base_fee_cents, per_kg_rate_cents, active)
values
  ('Gauteng', 'Johannesburg, Pretoria, surrounding areas', 10000, 1000, true),
  ('Outside Gauteng', 'Rest of South Africa', 30000, 2500, true)
on conflict (name) do nothing;
