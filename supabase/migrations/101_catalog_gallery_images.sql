-- 096_catalog_gallery_images.sql
-- W53 — extra product images beyond the single primary_image_url.
--
-- primary_image_url (migration 048) is the ONE hero shot the web store renders.
-- A quote and a job need more than that: the customer wants to see what they are
-- buying from more than one angle, and the technician on site wants the terminal
-- layout, the wiring label, the mounting detail.
--
-- Same shape as the store's hero image (plain URLs, no new bucket) so the images
-- the supplier scrapes already produce can be attached as-is.

alter table public.equipment_catalog
  add column if not exists gallery_image_urls text[] not null default '{}';

comment on column public.equipment_catalog.gallery_image_urls is
  'Additional product images shown on quotes and job material lists, in order. primary_image_url stays the hero shot; this is everything else (angles, terminal layout, mounting detail, nameplate). Plain URLs — same convention as primary_image_url.';

-- The store mirror already has an images[] column, so the gallery rides along in
-- it rather than getting a second column: hero first, then the rest. Redefining
-- the migration-048 sync function is the whole change — the trigger it is bound
-- to is unchanged and keeps firing on catalog edits only.
create or replace function public.sync_catalog_item_to_store()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_markup      numeric;
  v_price_rands numeric;
  v_price_cents integer;
  v_slug        text;
  v_name        text;
  v_desc        text;
  v_images      text[];
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

  -- Hero shot first, then the gallery, skipping blanks and duplicates.
  select coalesce(array_agg(distinct_url order by ord), '{}'::text[]) into v_images
  from (
    select url as distinct_url, min(ord) as ord
    from unnest(
      array_remove(array[new.primary_image_url] || coalesce(new.gallery_image_urls, '{}'::text[]), null)
    ) with ordinality as t(url, ord)
    where btrim(url) <> ''
    group by url
  ) deduped;

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
    v_images,
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
    -- preserve manually-managed shop images unless the catalog supplies some
    images      = case when cardinality(v_images) > 0 then v_images else p.images end,
    meta        = excluded.meta,
    active      = true;

  return new;
end;
$$;
