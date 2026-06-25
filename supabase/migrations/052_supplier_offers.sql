-- 052_supplier_offers.sql
-- Multi-supplier sourcing: one product (equipment_catalog) can be bought from several
-- suppliers, each with its own price. No duplicate product rows — instead, supplier
-- offers hang off the product, and the product's cost follows the CHEAPEST offer
-- unless an explicit preferred_supplier overrides it.
--
-- SAFETY: back-compatible. A product with NO offers behaves exactly as today
-- (cost_rands stands alone). The cost sync only ever runs for products that have offers.

-- 1. Preferred-supplier override on the product -------------------------------
alter table public.equipment_catalog
  add column if not exists preferred_supplier text;
comment on column public.equipment_catalog.preferred_supplier is
  'Chosen supplier whose offer sets cost_rands. NULL = use the cheapest offer. Only meaningful when the product has rows in equipment_supplier_offers.';

-- 2. Supplier offers ----------------------------------------------------------
create table if not exists public.equipment_supplier_offers (
  id               uuid primary key default gen_random_uuid(),
  catalog_id       uuid not null references public.equipment_catalog(id) on delete cascade,
  supplier         text not null,
  supplier_sku     text,
  cost_rands       numeric(12,2) not null check (cost_rands >= 0),
  list_price_rands numeric(12,2),
  source_url       text,
  in_stock         boolean,
  stock_note       text,
  updated_at       timestamptz not null default now(),
  unique (catalog_id, supplier)
);
comment on table public.equipment_supplier_offers is
  'Per-supplier price/availability for a catalog product. cost_rands is the landed cost basis (supplier list ex-VAT x 1.15); list_price_rands is the supplier ex-VAT list for reference.';

create index if not exists eso_catalog_idx  on public.equipment_supplier_offers(catalog_id);
create index if not exists eso_supplier_idx on public.equipment_supplier_offers(supplier);

-- 3. RLS — mirror equipment_catalog (read: any authenticated; write: admin) ----
alter table public.equipment_supplier_offers enable row level security;
drop policy if exists "Authenticated can read supplier offers" on public.equipment_supplier_offers;
create policy "Authenticated can read supplier offers"
  on public.equipment_supplier_offers for select using (auth.uid() is not null);
drop policy if exists "Admin can manage supplier offers" on public.equipment_supplier_offers;
create policy "Admin can manage supplier offers"
  on public.equipment_supplier_offers for all
  using ("current_role"() = 'admin'::user_role)
  with check ("current_role"() = 'admin'::user_role);

-- 4. Cost sync: cheapest offer, or the preferred supplier's offer -------------
create or replace function public.recompute_catalog_cost(p_catalog_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_cost numeric;
begin
  select o.cost_rands into v_cost
  from public.equipment_supplier_offers o
  join public.equipment_catalog e on e.id = o.catalog_id
  where o.catalog_id = p_catalog_id
    and (e.preferred_supplier is null or o.supplier = e.preferred_supplier)
  order by o.cost_rands asc
  limit 1;

  -- No matching offer (e.g. preferred supplier removed, or no offers at all):
  -- leave cost_rands untouched so offer-less products behave as before.
  if v_cost is not null then
    update public.equipment_catalog
      set cost_rands = v_cost
      where id = p_catalog_id and cost_rands is distinct from v_cost;
  end if;
end $$;

create or replace function public.tg_offer_recompute()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_catalog_cost(old.catalog_id);
    return old;
  end if;
  perform public.recompute_catalog_cost(new.catalog_id);
  return new;
end $$;

drop trigger if exists trg_offer_recompute on public.equipment_supplier_offers;
create trigger trg_offer_recompute
after insert or update or delete on public.equipment_supplier_offers
for each row execute function public.tg_offer_recompute();

create or replace function public.tg_preferred_recompute()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recompute_catalog_cost(new.id);
  return new;
end $$;

-- Fires only when preferred_supplier changes; the resulting cost_rands update does
-- NOT re-fire this trigger (it watches preferred_supplier only), so no recursion.
drop trigger if exists trg_preferred_recompute on public.equipment_catalog;
create trigger trg_preferred_recompute
after update of preferred_supplier on public.equipment_catalog
for each row execute function public.tg_preferred_recompute();
