create table if not exists public.quote_tier_configs (
  id uuid primary key default uuid_generate_v4(),
  min_inverter_kw numeric(6,2) not null,
  max_inverter_kw numeric(6,2) not null,
  tier text not null check (tier in ('premium', 'recommended', 'budget')),
  phase text not null default 'any' check (phase in ('single', 'three', 'any')),
  inverter_id uuid not null references public.equipment_catalog(id) on delete restrict,
  battery_id uuid not null references public.equipment_catalog(id) on delete restrict,
  panel_id uuid not null references public.equipment_catalog(id) on delete restrict,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quote_tier_configs_bracket_ck check (min_inverter_kw <= max_inverter_kw),
  constraint quote_tier_configs_unique unique (min_inverter_kw, max_inverter_kw, tier, phase)
);

create index if not exists quote_tier_configs_phase_active_idx
  on public.quote_tier_configs (phase, active, min_inverter_kw, max_inverter_kw, sort_order);

alter table public.quote_tier_configs enable row level security;

create policy "Authenticated users can read quote tier configs"
  on public.quote_tier_configs for select
  using (auth.uid() is not null);

create policy "Admin can manage quote tier configs"
  on public.quote_tier_configs for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

create or replace function public.set_quote_tier_configs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_quote_tier_configs_updated_at on public.quote_tier_configs;
create trigger trg_quote_tier_configs_updated_at
before update on public.quote_tier_configs
for each row
execute function public.set_quote_tier_configs_updated_at();
