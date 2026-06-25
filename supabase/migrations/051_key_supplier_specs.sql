-- 051_key_supplier_specs.sql
-- Supplier dimension + structured technical attributes on the equipment catalog.
--
-- WHY: bulk-importing distributor catalogs (first: Key Electric) needs (1) a
-- supplier tag distinct from `brand` (brand stays the MANUFACTURER, e.g. CBI/ABB;
-- supplier is who we buy from, e.g. 'Key Electric'), and (2) real, queryable
-- attributes for protection gear — poles, amperage, AC/DC, voltage, polarity,
-- breaking capacity, trip curve — instead of cramming them into the description.
--
-- SAFETY: purely additive. New columns are nullable / defaulted; existing rows,
-- quoting, and the store mirror are untouched until a row is edited.

-- 1. New columns -------------------------------------------------------------
alter table public.equipment_catalog
  add column if not exists supplier     text,
  add column if not exists specs        jsonb not null default '{}'::jsonb,
  add column if not exists source_url   text,
  add column if not exists external_ref text;

comment on column public.equipment_catalog.supplier is
  'Who we buy this from (distributor), e.g. ''Key Electric''. Distinct from brand (the manufacturer). Drives the supplier filter in catalog settings.';
comment on column public.equipment_catalog.specs is
  'Structured technical attributes as JSON: poles, pole_config, amperage_a, current_type (AC|DC|AC/DC), voltage_v, voltage_ac_v, voltage_dc_v, polarized, breaking_capacity_ka, curve, mechanism, modules, plus category-specific keys.';
comment on column public.equipment_catalog.source_url is
  'Provenance: the supplier product page this row was imported from.';
comment on column public.equipment_catalog.external_ref is
  'Supplier-side identifier (e.g. WooCommerce product id) for idempotent re-imports.';

-- 2. Indexes -----------------------------------------------------------------
create index if not exists equipment_catalog_supplier_idx
  on public.equipment_catalog (supplier);
create index if not exists equipment_catalog_specs_gin
  on public.equipment_catalog using gin (specs);

-- 3. Register Key Electric as a supplier (idempotent; no unique constraint on name)
insert into public.suppliers (name, notes, active)
select 'Key Electric',
       'Electrical wholesaler — keyelectric.co.za. Catalog imported via WooCommerce Store API.',
       true
where not exists (select 1 from public.suppliers where lower(name) = lower('Key Electric'));

-- 4. Carry supplier + specs through the store mirror -------------------------
-- Identical to migration 048's function, with `supplier` and `specs` added to
-- products.meta so the storefront / future 3D layer can read them. All other
-- logic (pricing, slug, upsert, store-visibility safety) is unchanged.
create or replace function public.sync_catalog_item_to_store()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_markup      numeric;
  v_price_rands numeric;
  v_price_cents integer;
  v_slug        text;
  v_name        text;
  v_desc        text;
begin
  -- Catalog item deleted: hide its mirror but keep the row (order history).
  if tg_op = 'DELETE' then
    update public.products set active = false where external_id = old.id;
    return old;
  end if;

  -- Not for sale online: hide an existing mirror, never create one.
  if new.show_on_store is not true then
    update public.products set active = false where external_id = new.id;
    return new;
  end if;

  -- Retail price: per-item override, else cost x default store markup.
  select coalesce(store_markup_pct, 30) into v_markup
  from public.company_settings where id = true;
  v_markup := coalesce(v_markup, 30);
  v_price_rands := coalesce(new.store_price_rands, coalesce(new.cost_rands, 0) * (1 + v_markup / 100.0));
  v_price_cents := round(v_price_rands * 100);

  v_name := coalesce(nullif(btrim(new.description), ''), new.sku, 'Item');
  v_desc := coalesce(new.shop_description, new.description);

  -- Slug from SKU (fallback to id); suffix if another product owns the slug.
  v_slug := regexp_replace(lower(coalesce(new.sku, new.id::text)), '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '(^-|-$)', '', 'g');
  if v_slug = '' then v_slug := left(new.id::text, 8); end if;
  if exists (
    select 1 from public.products
    where slug = v_slug and external_id is distinct from new.id
  ) then
    v_slug := v_slug || '-' || left(new.id::text, 4);
  end if;

  insert into public.products as p (
    external_id, name, slug, brand, category, sku, description,
    price, watts_ac, watts_dc, kwh, images, meta, stock_qty, active
  ) values (
    new.id, v_name, v_slug, new.brand, new.category, new.sku, v_desc,
    v_price_cents, new.watts_ac, new.watts_dc, new.kwh,
    case when new.primary_image_url is not null then array[new.primary_image_url] else '{}'::text[] end,
    jsonb_build_object(
      'phase', new.phase, 'voc_volts', new.voc_volts, 'isc_amps', new.isc_amps,
      'datasheet_url', new.datasheet_url, 'model_3d_url', new.model_3d_url,
      'supplier', new.supplier, 'specs', coalesce(new.specs, '{}'::jsonb)
    ),
    99, true
  )
  on conflict (external_id) do update set
    name        = excluded.name,
    slug        = excluded.slug,
    brand       = excluded.brand,
    category    = excluded.category,
    sku         = excluded.sku,
    description = excluded.description,
    price       = excluded.price,
    watts_ac    = excluded.watts_ac,
    watts_dc    = excluded.watts_dc,
    kwh         = excluded.kwh,
    -- preserve manually-managed shop images unless the catalog has a primary image
    images      = case when new.primary_image_url is not null then array[new.primary_image_url] else p.images end,
    meta        = excluded.meta,
    active      = true;

  return new;
end;
$$;
