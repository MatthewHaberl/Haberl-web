-- ============================================================
-- Phase 2: Price Lists Management
-- Support custom pricing tiers per customer
-- ============================================================

-- ── price_lists table ───────────────────────────────────────────
create table if not exists public.price_lists (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,              -- "Standard", "Contractor 10%", "Bulk 15%"
  description text,
  markup_percent integer not null default 30,  -- base markup
  discount_percent integer not null default 0, -- additional discount (0-100)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_markup check (markup_percent >= 0),
  constraint valid_discount check (discount_percent >= 0 and discount_percent <= 100)
);

-- ── customer_price_lists junction ───────────────────────────────
create table if not exists public.customer_price_lists (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.user_profiles(id) on delete cascade,
  price_list_id uuid not null references public.price_lists(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (customer_id, price_list_id)
);

-- ── price_list_overrides (per-product exceptions) ──────────────
create table if not exists public.price_list_overrides (
  id uuid primary key default uuid_generate_v4(),
  price_list_id uuid not null references public.price_lists(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  price_cents integer not null,           -- override price
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (price_list_id, product_id)
);

-- ── RLS ────────────────────────────────────────────────────────
alter table public.price_lists enable row level security;
alter table public.customer_price_lists enable row level security;
alter table public.price_list_overrides enable row level security;

-- Price lists: admin only
create policy "Admin can view price lists"
  on public.price_lists for select
  using (public.current_role() = 'admin');

create policy "Admin can manage price lists"
  on public.price_lists for all
  using (public.current_role() = 'admin');

-- Customer price lists: admin only (users can't see their assignments)
create policy "Admin can view customer price lists"
  on public.customer_price_lists for select
  using (public.current_role() = 'admin');

create policy "Admin can manage customer price lists"
  on public.customer_price_lists for all
  using (public.current_role() = 'admin');

-- Price list overrides: admin only
create policy "Admin can view price list overrides"
  on public.price_list_overrides for select
  using (public.current_role() = 'admin');

create policy "Admin can manage price list overrides"
  on public.price_list_overrides for all
  using (public.current_role() = 'admin');

-- ── Update triggers ────────────────────────────────────────────
create or replace function public.set_price_lists_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_price_lists_updated_at on public.price_lists;
create trigger trg_price_lists_updated_at
before update on public.price_lists
for each row execute function public.set_price_lists_updated_at();

-- ── Default price list ─────────────────────────────────────────
insert into public.price_lists (name, description, markup_percent, discount_percent, active)
values
  ('Standard (30% markup)', 'Default pricing for all customers', 30, 0, true)
on conflict (name) do nothing;
