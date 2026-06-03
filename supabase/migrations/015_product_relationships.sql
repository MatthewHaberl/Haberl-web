-- ============================================================
-- Phase 2: Product Relationships
-- Link products together (e.g., lugs for inverters, cables)
-- Powers "Products that go with this" recommendations
-- ============================================================

-- ── Enum for relationship types ─────────────────────────────────
create type product_relationship_type as enum (
  'lugs_for_inverter',
  'cable_for_inverter',
  'breaker_for_inverter',
  'earthing_for_system',
  'mounting_for_panel',
  'other'
);

-- ── product_relationships table ─────────────────────────────────
create table if not exists public.product_relationships (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.products(id) on delete cascade,  -- main item
  related_product_id uuid not null references public.products(id) on delete cascade,  -- related item
  relationship_type product_relationship_type not null,
  reason text,                            -- human-readable explanation
  active boolean not null default true,
  priority integer not null default 0,    -- higher = show first
  created_at timestamptz not null default now(),
  unique (product_id, related_product_id, relationship_type)
);

create index if not exists product_relationships_product_id_idx
  on public.product_relationships (product_id, active);

create index if not exists product_relationships_related_id_idx
  on public.product_relationships (related_product_id, active);

-- ── RLS ────────────────────────────────────────────────────────
alter table public.product_relationships enable row level security;

-- Customers can view relationships (to see recommendations)
create policy "Anyone can view product relationships"
  on public.product_relationships for select
  using (active = true or public.current_role() in ('manager', 'admin'));

-- Admin can manage relationships
create policy "Admin can manage product relationships"
  on public.product_relationships for all
  using (public.current_role() in ('manager', 'admin'));

-- Relationships will be added via the admin portal UI.
-- To bulk-load from inverter_lug_configs data, run a separate data migration after
-- cables/lugs/breakers are loaded as products in the equipment_catalog.
