-- Phase 4: settings extraction. Pricing policy moves from code constants to
-- company_settings (multi-tenant keystone), and quote numbering becomes an
-- atomic per-year sequence instead of a row count.

-- 1 ── pricing knobs on company_settings (defaults = current code constants)
alter table public.company_settings
  add column if not exists markup_pct numeric not null default 15,
  add column if not exists coc_fee_rands numeric not null default 1500,
  add column if not exists labour_inverter_per_w numeric not null default 0.25,
  add column if not exists labour_panel_per_w numeric not null default 0.75,
  add column if not exists storey_premium_2 numeric not null default 2000,
  add column if not exists storey_premium_3 numeric not null default 5000,
  add column if not exists tariffs jsonb not null default
    '{"City of Johannesburg": 2.92, "Tshwane": 2.85, "Ekurhuleni": 2.78, "Eskom": 2.65}'::jsonb,
  add column if not exists quote_prefix text not null default 'QUO';

-- 2 ── atomic quote numbering
create table if not exists public.quote_sequences (
  year integer primary key,
  next_number integer not null default 1
);

alter table public.quote_sequences enable row level security;

create policy "Staff can read quote sequences"
  on public.quote_sequences for select
  using ("current_role"() in ('field_worker', 'manager', 'admin'));
-- writes happen only inside next_quote_number() (security definer)

-- Seed from the highest existing QUO-<year>-NNN so numbering continues
insert into public.quote_sequences (year, next_number)
select extract(year from now())::int,
       coalesce(max((regexp_match(quote_number, '(\d+)$'))[1]::int), 0) + 1
from public.quote_requests
where quote_number is not null
on conflict (year) do nothing;

create or replace function public.next_quote_number()
returns text language plpgsql security definer set search_path = public as $$
declare
  current_year int := extract(year from now())::int;
  seq int;
  prefix text;
begin
  -- RETURNING sees the post-operation row, so the number this call consumed
  -- is always next_number - 1 (fresh insert lands at 2 and consumes 1).
  insert into public.quote_sequences (year, next_number)
  values (current_year, 2)
  on conflict (year) do update set next_number = quote_sequences.next_number + 1
  returning quote_sequences.next_number - 1
  into seq;

  select coalesce(quote_prefix, 'QUO') into prefix from public.company_settings where id = true;

  return prefix || '-' || current_year || '-' || lpad(seq::text, 3, '0');
end;
$$;

revoke execute on function public.next_quote_number() from anon, public;
grant execute on function public.next_quote_number() to authenticated;
