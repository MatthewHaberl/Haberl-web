-- ── Monitoring: inverter settings + optimisation recommendations ───────────────
-- Layer two on top of the read-only telemetry subsystem (migration 020):
--   1. capture the current CONFIGURATION of each plant (work mode, battery SoC
--      limits, export, schedules) — read automatically where the brand cloud API
--      allows it, or entered manually off the platform where it doesn't.
--   2. store optimisation recommendations ("lower the reserve floor to 10% → save
--      ~R420/yr") generated from those settings + measured behaviour, each with a
--      modelled Rand impact, that staff can apply or dismiss.
-- No telemetry tables change. Both tables are staff-managed; customers may read
-- their own (so the customer portal can later show "we recommend…").

-- ── monitoring_settings_snapshots ─────────────────────────────────────────────
-- Append-only history of a system's settings. The newest row per system is the
-- "current settings". `settings` is the normalised InverterSettings shape
-- (lib/monitoring/settings/types.ts); `raw_payload` keeps the brand-native blob
-- for reference/debugging. `source` records how we learnt the value.
create table public.monitoring_settings_snapshots (
  id           uuid primary key default uuid_generate_v4(),
  system_id    uuid not null references public.monitoring_systems(id) on delete cascade,
  captured_at  timestamptz not null default now(),
  source       text not null default 'manual' check (source in ('cloud', 'manual', 'import')),
  settings     jsonb not null default '{}'::jsonb,
  raw_payload  jsonb,
  note         text,
  captured_by  uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

create index monitoring_settings_snapshots_system_time
  on public.monitoring_settings_snapshots (system_id, captured_at desc);

alter table public.monitoring_settings_snapshots enable row level security;

create policy "Staff can manage settings snapshots"
  on public.monitoring_settings_snapshots for all
  using (public.current_role() in ('manager', 'admin'));

create policy "Customers can read own settings snapshots"
  on public.monitoring_settings_snapshots for select
  using (
    system_id in (
      select ms.id from public.monitoring_systems ms
      join public.sites s on s.id = ms.site_id
      where s.customer_id = auth.uid()
    )
  );

-- ── monitoring_recommendations ────────────────────────────────────────────────
-- One row per suggested setting change for a system. Regenerated from the latest
-- snapshot + measured data; the engine upserts on (system_id, code) so a given
-- recommendation type has at most one open row per system. Staff move it through
-- open → applied / dismissed; `current_value`/`suggested_value` are human-readable
-- strings so the UI never has to know the field's type.
create table public.monitoring_recommendations (
  id            uuid primary key default uuid_generate_v4(),
  system_id     uuid not null references public.monitoring_systems(id) on delete cascade,
  code          text not null,                 -- stable rule id, e.g. 'enable_export'
  category      text not null default 'other'  -- battery | export | workmode | schedule | upgrade | other
                check (category in ('battery','export','workmode','schedule','upgrade','other')),
  severity      text not null default 'info'   -- info | opportunity | high
                check (severity in ('info','opportunity','high')),
  title         text not null,
  rationale     text not null,
  current_value   text,
  suggested_value text,
  projected_annual_saving_r       numeric,
  projected_self_consumption_delta_pct numeric,
  status        text not null default 'open' check (status in ('open','applied','dismissed','snoozed')),
  applied_at    timestamptz,
  dismissed_at  timestamptz,
  acted_by      uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (system_id, code)
);

create index monitoring_recommendations_system
  on public.monitoring_recommendations (system_id, status);

alter table public.monitoring_recommendations enable row level security;

create policy "Staff can manage recommendations"
  on public.monitoring_recommendations for all
  using (public.current_role() in ('manager', 'admin'));

create policy "Customers can read own recommendations"
  on public.monitoring_recommendations for select
  using (
    system_id in (
      select ms.id from public.monitoring_systems ms
      join public.sites s on s.id = ms.site_id
      where s.customer_id = auth.uid()
    )
  );
