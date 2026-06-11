-- Phase 3: procurement on-platform. Suppliers, purchase orders created from
-- job materials, receiving check-in — plus price staleness on the catalog.

-- 1 ── suppliers
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text,
  email text,
  phone text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.suppliers enable row level security;

create policy "Staff can read suppliers"
  on public.suppliers for select
  using ("current_role"() in ('field_worker', 'manager', 'admin'));

create policy "Managers can manage suppliers"
  on public.suppliers for all
  using ("current_role"() in ('manager', 'admin'));

-- 2 ── purchase orders
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null,
  job_id uuid references public.jobs(id) on delete set null,
  supplier_id uuid references public.suppliers(id),
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'partial', 'received', 'cancelled')),
  expected_date date,
  sent_at timestamptz,
  notes text,
  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists purchase_orders_job_idx on public.purchase_orders (job_id);
create index if not exists purchase_orders_status_idx on public.purchase_orders (status, created_at);

alter table public.purchase_orders enable row level security;

create policy "Staff can read purchase orders"
  on public.purchase_orders for select
  using ("current_role"() in ('field_worker', 'manager', 'admin'));

create policy "Managers can manage purchase orders"
  on public.purchase_orders for all
  using ("current_role"() in ('manager', 'admin'));

-- 3 ── purchase order lines (receiving tracked per line)
create table if not exists public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  job_material_id uuid references public.job_materials(id) on delete set null,
  sku text not null default '',
  description text not null default '',
  qty_ordered numeric not null default 0,
  qty_received numeric not null default 0,
  unit_cost_cents integer not null default 0,
  sort_order integer not null default 0
);

create index if not exists purchase_order_lines_po_idx on public.purchase_order_lines (po_id, sort_order);

alter table public.purchase_order_lines enable row level security;

create policy "Staff can read purchase order lines"
  on public.purchase_order_lines for select
  using ("current_role"() in ('field_worker', 'manager', 'admin'));

create policy "Managers can manage purchase order lines"
  on public.purchase_order_lines for all
  using ("current_role"() in ('manager', 'admin'));

-- 4 ── catalog price staleness: stamp when cost changes
alter table public.equipment_catalog
  add column if not exists price_updated_at timestamptz not null default now();

create or replace function public.bump_price_updated_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cost_rands is distinct from old.cost_rands then
    new.price_updated_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.bump_price_updated_at() from anon, authenticated, public;

drop trigger if exists equipment_price_bump on public.equipment_catalog;
create trigger equipment_price_bump
  before update of cost_rands on public.equipment_catalog
  for each row execute function public.bump_price_updated_at();
