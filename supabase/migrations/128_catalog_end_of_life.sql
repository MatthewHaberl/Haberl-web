-- 128_catalog_end_of_life.sql
-- End-of-life items must never reach a customer.
--
-- Key Electric marks a discontinued line by prefixing its description —
-- "[EOL] CHINT 16A 2P CIRCUIT BREAKER…". Because that status lived inside the
-- description text it travelled everywhere the description did: onto the web
-- store, and onto customer quote documents (two sent quotes already carry it).
--
-- This turns the marker into a real column, strips it out of the customer-
-- visible text, and teaches the store mirror to refuse EOL stock. Quoting is
-- deliberately untouched: staff can still price an EOL item they hold in
-- stock — they just see an EOL badge instead of a bracket in the product name.

-- 1. The flag ----------------------------------------------------------------
alter table public.equipment_catalog
  add column if not exists end_of_life boolean not null default false;

comment on column public.equipment_catalog.end_of_life is
  'Supplier has discontinued this line. Never published to the web store and never offered to a customer; still quotable by staff for stock on hand. Parsed from the "[EOL]" description marker on import — see lib/catalog/eol.ts.';

create index if not exists equipment_catalog_end_of_life_idx
  on public.equipment_catalog (end_of_life) where end_of_life;

-- 2. Backfill from the marker, then strip it out of the text ------------------
-- Bracket variants all appear in the source spreadsheets: [EOL] (EOL) {EOL] [EOL
update public.equipment_catalog
set end_of_life = true
where description ~* '[[({][[:space:]]*EOL'
   or shop_description ~* '[[({][[:space:]]*EOL';

update public.equipment_catalog
set description = nullif(btrim(regexp_replace(
      regexp_replace(description, '[[({][[:space:]]*EOL[[:space:]]*[])}]?[[:space:]]*[-–—:]?[[:space:]]*', '', 'gi'),
      '[[:space:]]{2,}', ' ', 'g')), ''),
    shop_description = nullif(btrim(regexp_replace(
      regexp_replace(coalesce(shop_description, ''), '[[({][[:space:]]*EOL[[:space:]]*[])}]?[[:space:]]*[-–—:]?[[:space:]]*', '', 'gi'),
      '[[:space:]]{2,}', ' ', 'g')), '')
where description ~* '[[({][[:space:]]*EOL'
   or shop_description ~* '[[({][[:space:]]*EOL';

-- 3. The store mirror refuses EOL stock --------------------------------------
-- Same body as migration 101, with one added guard: an EOL item is treated
-- exactly like show_on_store = false, so flipping the toggle on a discontinued
-- line (or an item going EOL while listed) hides it instead of publishing it.
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
  v_images      text[];
begin
  if tg_op = 'DELETE' then
    update public.products set active = false where external_id = old.id;
    return old;
  end if;

  -- Not for sale online — or discontinued: hide any mirror, never create one.
  if new.show_on_store is not true or new.end_of_life is true then
    update public.products set active = false where external_id = new.id;
    return new;
  end if;

  select coalesce(store_markup_pct, 30) into v_markup
  from public.company_settings where id = true;
  v_markup := coalesce(v_markup, 30);
  v_price_rands := coalesce(new.store_price_rands, coalesce(new.cost_rands, 0) * (1 + v_markup / 100.0));
  v_price_cents := round(v_price_rands * 100);

  v_name := coalesce(nullif(btrim(new.description), ''), new.sku, 'Item');
  v_desc := coalesce(new.shop_description, new.description);

  select coalesce(array_agg(distinct_url order by ord), '{}'::text[]) into v_images
  from (
    select url as distinct_url, min(ord) as ord
    from unnest(
      array_remove(array[new.primary_image_url] || coalesce(new.gallery_image_urls, '{}'::text[]), null)
    ) with ordinality as t(url, ord)
    where btrim(url) <> ''
    group by url
  ) deduped;

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
    images      = case when cardinality(v_images) > 0 then v_images else p.images end,
    meta        = excluded.meta,
    active      = true;

  return new;
end;
$$;

-- 4. Pull down anything EOL that is already listed ----------------------------
update public.products p
set active = false
from public.equipment_catalog e
where p.external_id = e.id and e.end_of_life and p.active;

update public.equipment_catalog
set show_on_store = false
where end_of_life and show_on_store;
