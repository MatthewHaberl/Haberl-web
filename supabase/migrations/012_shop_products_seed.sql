-- ============================================================
-- Phase 2: Shop Products Seed & Extensions
-- Load 67 products from equipment_catalog with 30% markup
-- ============================================================

-- ── Add columns to products table ─────────────────────────────
alter table public.products
  add column if not exists external_id uuid,           -- link back to equipment_catalog
  add column if not exists weight_kg numeric(8,2) default 1.0,
  add column if not exists brand text,
  add column if not exists watts_ac integer,
  add column if not exists watts_dc integer,
  add column if not exists kwh numeric(8,2),
  add column if not exists meta jsonb default '{}'::jsonb;

-- ── Seed products from equipment_catalog ──────────────────────
-- Insert all active items with 30% markup (cost * 1.30)
-- slug format: brand-sku lowercase
insert into public.products (
  slug, name, description, price, category, sku, stock_qty, active,
  external_id, weight_kg, brand, watts_ac, watts_dc, kwh, meta
)
select
  trim(both '-' from lower(regexp_replace(ec.brand || '-' || ec.sku, '[^a-zA-Z0-9]+', '-', 'g'))),
  ec.description,
  ec.description,
  cast(ec.cost_rands * 1.30 * 100 as integer),  -- price in cents
  ec.category,
  ec.sku,
  99,  -- indicates unlimited stock, managed externally
  ec.active,
  ec.id,
  1.0,  -- default weight (to be updated per product later)
  ec.brand,
  ec.watts_ac,
  ec.watts_dc,
  ec.kwh,
  jsonb_build_object(
    'phase', ec.phase,
    'isc_amps', ec.isc_amps,
    'voc_volts', ec.voc_volts,
    'notes', ec.notes
  )
from public.equipment_catalog ec
where ec.active = true
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  category = excluded.category,
  sku = excluded.sku,
  active = excluded.active,
  external_id = excluded.external_id,
  brand = excluded.brand,
  watts_ac = excluded.watts_ac,
  watts_dc = excluded.watts_dc,
  kwh = excluded.kwh,
  meta = excluded.meta;

-- ── Verify seed completed ────────────────────────────────────
-- Count should be 67
-- SELECT COUNT(*) FROM public.products;
