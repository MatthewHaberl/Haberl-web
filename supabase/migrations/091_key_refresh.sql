-- 091_key_refresh.sql
-- Automated Key Electric price refresh + catalog enrichment.
--
-- WHY: the July catalog import (migrations 051/052, scripts/key-electric-*.mjs)
-- loaded ~14k products with Key Electric supplier offers. Prices go stale — the
-- catalog UI flags costs older than 60 days — and ~10k rows imported without an
-- image / source URL / datasheet. This migration makes re-scraping the supplier's
-- public WooCommerce Store API a repeatable, idempotent sweep:
--
--   * equipment_supplier_offers.last_seen_at — when the offer was last confirmed
--     live on the supplier's site (sweep-end report lists offers NOT seen).
--   * supplier_refresh_state — one row per supplier: sweep cursor + accumulators,
--     so the cron route can process a few pages per invocation and resume.
--   * key_refresh_ingest_page(page_no, page_json) — parses a raw Store-API page
--     and applies it: refresh existing Key offers (price, stock, last_seen_at),
--     create offers for products we track that lack one (external_ref match only),
--     backfill missing catalog images / source URLs / datasheet links, and stamp
--     price_updated_at. Products not in the catalog are only REPORTED (stats.
--     new_products), never auto-created — creation stays with key-electric-load.mjs.
--   * key_refresh_finish() — closes the sweep: writes last_run_summary including
--     offers not seen on the site, resets the cursor.
--
-- The parse/apply logic lives HERE (not in the route) so a manual DB-side run,
-- the Vercel cron route, and any future runner all share one implementation.
--
-- SAFETY: additive. Nothing is deleted or deactivated automatically; "vanished"
-- products are only reported. Price writes go through the migration-052 cheapest-
-- offer trigger exactly like the original import did.

-- 1. When was this offer last confirmed on the supplier's site? ---------------
alter table public.equipment_supplier_offers
  add column if not exists last_seen_at timestamptz;
comment on column public.equipment_supplier_offers.last_seen_at is
  'Last time a refresh sweep found this product live on the supplier''s site. NULL / older than the last completed sweep = not listed publicly anymore (see supplier_refresh_state.last_run_summary).';

-- 2. Sweep state --------------------------------------------------------------
create table if not exists public.supplier_refresh_state (
  supplier         text primary key,
  page_cursor      int not null default 0,   -- last Store-API page ingested; 0 = no sweep in progress
  run_started_at   timestamptz,              -- set when page 1 of a sweep is ingested
  price_mode       text check (price_mode in ('inc_vat', 'ex_vat')),
  stats            jsonb not null default '{}'::jsonb,  -- in-flight sweep accumulators
  last_run_summary jsonb,                    -- written by key_refresh_finish()
  updated_at       timestamptz not null default now()
);
comment on table public.supplier_refresh_state is
  'Progress + results of supplier catalog refresh sweeps (currently Key Electric). One row per supplier. stats accumulates while a sweep is chunked across cron invocations; last_run_summary holds the previous completed sweep.';
comment on column public.supplier_refresh_state.price_mode is
  'How the supplier''s public price maps to our columns, calibrated on page 1 of each sweep against existing offers: ex_vat (Key Electric: site shows EX VAT, cost = price x 1.15) or inc_vat (cost = price as shown).';

alter table public.supplier_refresh_state enable row level security;
drop policy if exists "Authenticated can read refresh state" on public.supplier_refresh_state;
create policy "Authenticated can read refresh state"
  on public.supplier_refresh_state for select using (auth.uid() is not null);
drop policy if exists "Admin can manage refresh state" on public.supplier_refresh_state;
create policy "Admin can manage refresh state"
  on public.supplier_refresh_state for all
  using ("current_role"() = 'admin'::user_role)
  with check ("current_role"() = 'admin'::user_role);

insert into public.supplier_refresh_state (supplier)
values ('Key Electric')
on conflict (supplier) do nothing;

-- 3. Ingest one raw Store-API page --------------------------------------------
-- p_page is the verbatim JSON array from
--   https://keyelectric.co.za/wp-json/wc/store/v1/products?per_page=100&page=N&orderby=date&order=asc
-- Page 1 starts a new sweep (resets accumulators, recalibrates price_mode).
create or replace function public.key_refresh_ingest_page(p_page_number int, p_page jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_supplier constant text := 'Key Electric';
  v_now     timestamptz := now();
  v_started timestamptz;
  v_mode    text;
  v_inc     int;
  v_ex      int;
  n_items   int;
  n_matched int;
  n_offers  int;
  n_created int;
  n_filled  int;
  n_new     int;
  v_new     jsonb;
begin
  if p_page is null or jsonb_typeof(p_page) <> 'array' then
    return jsonb_build_object('error', 'page payload is not a JSON array');
  end if;

  if p_page_number = 1 then
    update supplier_refresh_state
       set run_started_at = v_now, page_cursor = 0, stats = '{}'::jsonb, updated_at = v_now
     where supplier = c_supplier;
  end if;

  select run_started_at into v_started
    from supplier_refresh_state where supplier = c_supplier;
  if v_started is null then
    return jsonb_build_object('error', 'no sweep in progress — ingest page 1 first');
  end if;

  -- Parse the page. prices.price is in currency minor units (cents).
  drop table if exists _kr_items;
  create temp table _kr_items as
  select p->>'id'                                          as external_ref,
         nullif(btrim(p->>'sku'), '')                      as sku,
         left(coalesce(p->>'name', ''), 300)               as name,
         p->>'permalink'                                   as permalink,
         round((nullif(p->'prices'->>'price', ''))::numeric
           / power(10::numeric, coalesce((p->'prices'->>'currency_minor_unit')::int, 2)), 2) as price_rands,
         p->'images'->0->>'src'                            as image_url,
         (regexp_match(coalesce(p->>'description', '') || coalesce(p->>'short_description', ''),
                       'href="([^"]+\.pdf[^"]*)"', 'i'))[1] as datasheet_url,
         (p->>'is_in_stock')::boolean                      as in_stock
  from jsonb_array_elements(p_page) p
  where nullif(p->'prices'->>'price', '') is not null;

  select count(*) into n_items from _kr_items;

  -- Match to the catalog: exact supplier product id (external_ref) first; else
  -- normalised SKU — the same rule the original import used. SKU matches never
  -- CREATE offers (short numeric SKUs can collide across brands), only update.
  drop table if exists _kr_cand;
  create temp table _kr_cand as
  select i.*, e.id as catalog_id, 'ref'::text as how
    from _kr_items i
    join equipment_catalog e on e.external_ref = i.external_ref
  union all
  select i.*, e.id, 'sku'
    from _kr_items i
    join equipment_catalog e
      on i.sku is not null
     and lower(regexp_replace(e.sku, '[^a-zA-Z0-9]', '', 'g'))
       = lower(regexp_replace(i.sku, '[^a-zA-Z0-9]', '', 'g'))
   where not exists (select 1 from equipment_catalog x where x.external_ref = i.external_ref);

  -- Calibrate on page 1: does the site price line up with our stored cost
  -- (inc VAT) or list (ex VAT)? Refuse to write when inconclusive.
  if p_page_number = 1 then
    select count(*) filter (where abs(o.cost_rands - c.price_rands) <= 0.02),
           count(*) filter (where abs(coalesce(o.list_price_rands, -1) - c.price_rands) <= 0.02)
      into v_inc, v_ex
      from _kr_cand c
      join equipment_supplier_offers o
        on o.catalog_id = c.catalog_id and o.supplier = c_supplier;
    if v_ex >= 5 and v_ex >= 3 * v_inc then
      v_mode := 'ex_vat';
    elsif v_inc >= 5 and v_inc >= 3 * v_ex then
      v_mode := 'inc_vat';
    else
      return jsonb_build_object('error', 'price calibration inconclusive — not writing',
        'price_vs_cost_hits', v_inc, 'price_vs_list_hits', v_ex);
    end if;
    update supplier_refresh_state
       set price_mode = v_mode, updated_at = v_now where supplier = c_supplier;
  else
    select price_mode into v_mode from supplier_refresh_state where supplier = c_supplier;
    if v_mode is null then
      return jsonb_build_object('error', 'price_mode not calibrated — ingest page 1 first');
    end if;
  end if;

  -- One row per catalog product ('ref' match wins over 'sku' when both exist).
  drop table if exists _kr_final;
  create temp table _kr_final as
  select distinct on (c.catalog_id) c.*,
         case when v_mode = 'inc_vat' then c.price_rands
              else round(c.price_rands * 1.15, 2) end as new_cost,
         case when v_mode = 'inc_vat' then round(c.price_rands / 1.15, 2)
              else c.price_rands end as new_list
  from _kr_cand c
  order by c.catalog_id, c.how;  -- 'ref' < 'sku'

  select count(*) into n_matched from _kr_final;

  -- Refresh existing Key offers (migration-052 trigger re-prices the product).
  update equipment_supplier_offers o
     set cost_rands       = f.new_cost,
         list_price_rands = f.new_list,
         supplier_sku     = coalesce(f.sku, o.supplier_sku),
         source_url       = coalesce(f.permalink, o.source_url),
         in_stock         = f.in_stock,
         last_seen_at     = v_now,
         updated_at       = v_now
    from _kr_final f
   where o.catalog_id = f.catalog_id and o.supplier = c_supplier;
  get diagnostics n_offers = row_count;

  -- A tracked product (imported with this external_ref) that somehow has no Key
  -- offer yet gets one. SKU-only matches are excluded on purpose.
  insert into equipment_supplier_offers
         (catalog_id, supplier, supplier_sku, cost_rands, list_price_rands,
          source_url, in_stock, last_seen_at, updated_at)
  select f.catalog_id, c_supplier, f.sku, f.new_cost, f.new_list,
         f.permalink, f.in_stock, v_now, v_now
    from _kr_final f
   where f.how = 'ref'
     and not exists (select 1 from equipment_supplier_offers o
                      where o.catalog_id = f.catalog_id and o.supplier = c_supplier)
  on conflict (catalog_id, supplier) do nothing;
  get diagnostics n_created = row_count;

  -- Enrichment: fill missing image / source / datasheet / external_ref, and
  -- stamp price_updated_at — the price was verified even when unchanged.
  select count(*) into n_filled
    from equipment_catalog e
    join _kr_final f on f.catalog_id = e.id
   where (e.primary_image_url is null and f.image_url is not null)
      or (e.source_url is null and f.permalink is not null)
      or (e.datasheet_url is null and f.datasheet_url is not null);

  update equipment_catalog e
     set primary_image_url = coalesce(e.primary_image_url, f.image_url),
         source_url        = coalesce(e.source_url, f.permalink),
         datasheet_url     = coalesce(e.datasheet_url, f.datasheet_url),
         external_ref      = coalesce(e.external_ref, f.external_ref),
         price_updated_at  = v_now,
         updated_at        = v_now
    from _kr_final f
   where e.id = f.catalog_id;

  -- Products on the site that we don't stock: report, never create.
  select count(*),
         coalesce(jsonb_agg(jsonb_build_object('sku', s.sku, 'name', s.name, 'price', s.price_rands)
                            order by s.name) filter (where s.rn <= 25), '[]'::jsonb)
    into n_new, v_new
    from (select i.*, row_number() over (order by i.name) as rn
            from _kr_items i
           where not exists (select 1 from _kr_cand c where c.external_ref = i.external_ref)) s;

  update supplier_refresh_state s
     set page_cursor = p_page_number,
         stats = s.stats
           || jsonb_build_object(
                'pages_done',        p_page_number,
                'items_seen',        coalesce((s.stats->>'items_seen')::int, 0) + n_items,
                'matched',           coalesce((s.stats->>'matched')::int, 0) + n_matched,
                'offers_updated',    coalesce((s.stats->>'offers_updated')::int, 0) + n_offers,
                'offers_created',    coalesce((s.stats->>'offers_created')::int, 0) + n_created,
                'fields_backfilled', coalesce((s.stats->>'fields_backfilled')::int, 0) + n_filled,
                'new_on_site',       coalesce((s.stats->>'new_on_site')::int, 0) + n_new)
           || jsonb_build_object('new_products',
                case when jsonb_array_length(coalesce(s.stats->'new_products', '[]'::jsonb)) >= 300
                     then coalesce(s.stats->'new_products', '[]'::jsonb)
                     else coalesce(s.stats->'new_products', '[]'::jsonb) || v_new end),
         updated_at = v_now
   where s.supplier = c_supplier;

  drop table if exists _kr_items;
  drop table if exists _kr_cand;
  drop table if exists _kr_final;

  return jsonb_build_object(
    'page', p_page_number, 'items', n_items, 'matched', n_matched,
    'offers_updated', n_offers, 'offers_created', n_created,
    'fields_backfilled', n_filled, 'new_on_site', n_new, 'price_mode', v_mode);
end;
$$;

-- 4. Close the sweep ----------------------------------------------------------
create or replace function public.key_refresh_finish()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_supplier constant text := 'Key Electric';
  v_state    supplier_refresh_state%rowtype;
  v_now      timestamptz := now();
  v_missing  int;
  v_sample   jsonb;
  v_summary  jsonb;
begin
  select * into v_state from supplier_refresh_state where supplier = c_supplier;
  if v_state.supplier is null or v_state.run_started_at is null then
    return jsonb_build_object('error', 'no sweep in progress');
  end if;

  -- Offers this sweep did NOT find on the site (delisted / renamed / hidden).
  -- Report only — nothing is deactivated.
  select count(*) into v_missing
    from equipment_supplier_offers o
   where o.supplier = c_supplier
     and (o.last_seen_at is null or o.last_seen_at < v_state.run_started_at);

  select coalesce(jsonb_agg(jsonb_build_object('sku', s.supplier_sku, 'description', s.description)), '[]'::jsonb)
    into v_sample
    from (select o.supplier_sku, left(e.description, 120) as description
            from equipment_supplier_offers o
            join equipment_catalog e on e.id = o.catalog_id
           where o.supplier = c_supplier
             and (o.last_seen_at is null or o.last_seen_at < v_state.run_started_at)
           order by e.description
           limit 50) s;

  v_summary := jsonb_build_object(
    'started_at',        v_state.run_started_at,
    'completed_at',      v_now,
    'price_mode',        v_state.price_mode,
    'stats',             v_state.stats,
    'not_seen_on_site',  v_missing,
    'not_seen_sample',   v_sample);

  update supplier_refresh_state
     set last_run_summary = v_summary,
         page_cursor      = 0,
         run_started_at   = null,
         stats            = '{}'::jsonb,
         updated_at       = v_now
   where supplier = c_supplier;

  return v_summary;
end;
$$;

-- 5. Lock the functions down to the service role ------------------------------
revoke execute on function public.key_refresh_ingest_page(int, jsonb) from public, anon, authenticated;
revoke execute on function public.key_refresh_finish() from public, anon, authenticated;
grant execute on function public.key_refresh_ingest_page(int, jsonb) to service_role;
grant execute on function public.key_refresh_finish() to service_role;
