-- ============================================================
-- Phase 2: Discount Codes Management
-- Percentage and fixed-amount discount codes
-- ============================================================

-- ── Enum for discount types ────────────────────────────────────
create type discount_code_type as enum ('percentage', 'fixed_amount');

-- ── discount_codes table ───────────────────────────────────────
create table if not exists public.discount_codes (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,              -- "WELCOME10", "SUMMER20", "BULK50"
  discount_type discount_code_type not null,
  discount_value numeric(10,2) not null,  -- 10 for 10% or 500 for R500 off
  description text,
  max_uses integer,                       -- null = unlimited
  uses_count integer not null default 0,
  min_order_amount_cents integer,         -- minimum order to use code (optional)
  active boolean not null default true,
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_discount_value check (discount_value > 0)
);

-- ── order_discount_codes (audit trail) ──────────────────────────
create table if not exists public.order_discount_codes (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references public.orders(id) on delete cascade,
  discount_code_id uuid not null references public.discount_codes(id),
  discount_amount_cents integer not null, -- calculated at checkout time
  created_at timestamptz not null default now()
);

create index if not exists order_discount_codes_order_id_idx
  on public.order_discount_codes (order_id);

create index if not exists order_discount_codes_discount_code_id_idx
  on public.order_discount_codes (discount_code_id);

-- ── RLS ────────────────────────────────────────────────────────
alter table public.discount_codes enable row level security;
alter table public.order_discount_codes enable row level security;

-- Discount codes: admin can manage, anyone can check validity (no auth)
create policy "Anyone can view active discount codes"
  on public.discount_codes for select
  using (active = true or public.current_role() in ('manager', 'admin'));

create policy "Admin can manage discount codes"
  on public.discount_codes for all
  using (public.current_role() in ('manager', 'admin'));

-- Order discount codes: users see their own, admin sees all
create policy "Users see own order discounts"
  on public.order_discount_codes for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = auth.uid() or public.current_role() in ('manager', 'admin'))
    )
  );

create policy "Users can create discount records during checkout"
  on public.order_discount_codes for insert
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.customer_id = auth.uid()
    )
  );

create policy "Admin can manage order discount codes"
  on public.order_discount_codes for all
  using (public.current_role() in ('manager', 'admin'));

-- ── Update trigger ────────────────────────────────────────────
create or replace function public.set_discount_codes_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_discount_codes_updated_at on public.discount_codes;
create trigger trg_discount_codes_updated_at
before update on public.discount_codes
for each row execute function public.set_discount_codes_updated_at();

-- ── Validation function ────────────────────────────────────────
-- Use in checkout API to validate discount code
create or replace function public.validate_discount_code(
  p_code text,
  p_order_amount_cents integer
) returns table (
  is_valid boolean,
  discount_code_id uuid,
  discount_amount_cents integer,
  error_message text
) language plpgsql stable as $$
declare
  v_discount record;
begin
  select * into v_discount from public.discount_codes
  where code = p_code
    and active = true
    and (max_uses is null or uses_count < max_uses)
    and (valid_from is null or valid_from <= now())
    and (valid_until is null or valid_until > now())
    and (min_order_amount_cents is null or p_order_amount_cents >= min_order_amount_cents)
  limit 1;

  if v_discount is null then
    return query select false, null::uuid, 0, 'Discount code not found or expired'::text;
  else
    -- Calculate discount amount
    if v_discount.discount_type = 'percentage' then
      return query select
        true,
        v_discount.id,
        cast(p_order_amount_cents * v_discount.discount_value / 100.0 as integer),
        null;
    else
      -- fixed amount
      return query select
        true,
        v_discount.id,
        cast(least(v_discount.discount_value * 100, p_order_amount_cents) as integer),
        null;
    end if;
  end if;
end;
$$;

-- ── Example discount codes (optional seed) ─────────────────────
insert into public.discount_codes (code, discount_type, discount_value, description, active)
values
  ('WELCOME10', 'percentage'::discount_code_type, 10, 'Welcome discount for new customers', false),
  ('BULK50', 'fixed_amount'::discount_code_type, 50, 'R50 off bulk orders', false)
on conflict (code) do nothing;
