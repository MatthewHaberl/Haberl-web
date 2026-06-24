-- 048_unify_catalog_store.sql
-- One catalog, one toggle. equipment_catalog is the single source of truth;
-- products becomes an auto-managed storefront mirror.
--
-- SAFETY: quoting is untouched. The quote calculator reads `active`
-- (calculator visibility). The web store reads the NEW, independent
-- `show_on_store` flag (mirrored into products.active). Hiding an item from
-- the store never affects whether a quote can use it, and vice versa.

-- 1. Store-facing columns on the master catalog ------------------------------
alter table public.equipment_catalog
  add column if not exists show_on_store    boolean not null default false,
  add column if not exists store_price_rands numeric,
  add column if not exists model_3d_url     text;

comment on column public.equipment_catalog.show_on_store is
  'When true, this item is published to the customer web store (mirrored into products). Independent of `active`, which controls quote-calculator visibility.';
comment on column public.equipment_catalog.store_price_rands is
  'Optional retail price override in Rands. When null, store price = cost_rands * (1 + company_settings.store_markup_pct/100).';
comment on column public.equipment_catalog.model_3d_url is
  'Reserved: URL to a 3D model (glb/gltf) for the future 3D landscape view.';

-- 2. Default store markup (separate from quote markup_pct = 15) ---------------
alter table public.company_settings
  add column if not exists store_markup_pct numeric not null default 30;

comment on column public.company_settings.store_markup_pct is
  'Default percent markup over cost for web-store retail price. Quote pricing uses markup_pct (unchanged).';

-- 3. Seed the toggle from the CURRENT store state (zero visible change) -------
update public.equipment_catalog e
set show_on_store = true
from public.products p
where p.external_id = e.id and p.active = true;

-- 4. Reconcile links by SKU so the mirror updates existing rows instead of
--    creating duplicates later. Any product newly linked here was hidden
--    before (the store filters external_id IS NOT NULL), so keep it hidden.
update public.products p
set external_id = e.id,
    active = false
from public.equipment_catalog e
where p.external_id is null
  and p.sku is not null
  and lower(p.sku) = lower(e.sku);

-- 5. The mirror function: equipment_catalog -> products ----------------------
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
      'datasheet_url', new.datasheet_url, 'model_3d_url', new.model_3d_url
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

-- 6. Wire the trigger. Fires only on catalog edits (never during quoting). ----
drop trigger if exists trg_sync_catalog_to_store on public.equipment_catalog;
create trigger trg_sync_catalog_to_store
after insert or update or delete on public.equipment_catalog
for each row execute function public.sync_catalog_item_to_store();
