-- ── monitoring_systems ─────────────────────────────────────────
create table public.monitoring_systems (
  id              uuid primary key default uuid_generate_v4(),
  site_id         uuid references public.sites(id) on delete cascade,
  brand           text not null check (brand in (
    'sunsynk','sigenergy','foxess','deye','growatt','victron',
    'goodwe','solax','solis','huawei','luxpower','local'
  )),
  label           text,
  plant_id        text,
  device_sn       text,
  credentials     jsonb,
  capacity_kw     numeric(8,2),
  battery_kwh     numeric(8,2),
  enabled         boolean not null default true,
  last_polled_at  timestamptz,
  poll_error      text,
  created_at      timestamptz not null default now()
);

alter table public.monitoring_systems enable row level security;

create policy "Staff can manage monitoring systems"
  on public.monitoring_systems for all
  using (public.current_role() in ('manager', 'admin'));

create policy "Customers can read own monitoring systems"
  on public.monitoring_systems for select
  using (
    public.current_role() = 'customer'
    and site_id in (select id from public.sites where customer_id = auth.uid())
  );

-- ── monitoring_readings ────────────────────────────────────────
create table public.monitoring_readings (
  id                uuid primary key default uuid_generate_v4(),
  system_id         uuid not null references public.monitoring_systems(id) on delete cascade,
  recorded_at       timestamptz not null,
  pv_power_w        numeric,
  battery_power_w   numeric,
  grid_power_w      numeric,
  load_power_w      numeric,
  battery_soc_pct   numeric,
  battery_voltage_v numeric,
  grid_frequency_hz numeric,
  inverter_temp_c   numeric,
  pv_strings        jsonb,
  fault_codes       text[],
  device_state      text check (device_state in ('online','offline','fault','standby','unknown')),
  raw_payload       jsonb
);

create index monitoring_readings_system_time
  on public.monitoring_readings (system_id, recorded_at desc);

alter table public.monitoring_readings enable row level security;

create policy "Staff can manage readings"
  on public.monitoring_readings for all
  using (public.current_role() in ('manager', 'admin'));

create policy "Customers can read own readings"
  on public.monitoring_readings for select
  using (
    system_id in (
      select ms.id from public.monitoring_systems ms
      join   public.sites s on s.id = ms.site_id
      where  s.customer_id = auth.uid()
    )
  );

-- ── monitoring_string_baselines ────────────────────────────────
create table public.monitoring_string_baselines (
  system_id        uuid not null references public.monitoring_systems(id) on delete cascade,
  string_index     int  not null,
  hour_of_day      int  not null check (hour_of_day between 0 and 23),
  baseline_power_w numeric,
  updated_at       timestamptz not null default now(),
  primary key (system_id, string_index, hour_of_day)
);

alter table public.monitoring_string_baselines enable row level security;

create policy "Staff can manage string baselines"
  on public.monitoring_string_baselines for all
  using (public.current_role() in ('manager', 'admin'));

-- ── monitoring_alert_rules ─────────────────────────────────────
create table public.monitoring_alert_rules (
  id                  uuid primary key default uuid_generate_v4(),
  system_id           uuid references public.monitoring_systems(id) on delete cascade,
  rule_type           text not null check (rule_type in (
    'offline','string_drop','battery_low','grid_loss','fault_code','export_limit','custom'
  )),
  threshold_pct       numeric,
  threshold_value     numeric,
  window_hours        int not null default 1,
  severity            text not null default 'warning' check (severity in ('info','warning','critical')),
  notify_channels     text[] not null default '{}',
  notify_admin        boolean not null default true,
  notify_customer     boolean not null default false,
  enabled             boolean not null default true,
  created_at          timestamptz not null default now()
);

alter table public.monitoring_alert_rules enable row level security;

create policy "Admin can manage alert rules"
  on public.monitoring_alert_rules for all
  using (public.current_role() = 'admin');

create policy "Manager can read alert rules"
  on public.monitoring_alert_rules for select
  using (public.current_role() = 'manager');

-- ── monitoring_alert_events ────────────────────────────────────
create table public.monitoring_alert_events (
  id               uuid primary key default uuid_generate_v4(),
  rule_id          uuid references public.monitoring_alert_rules(id) on delete set null,
  system_id        uuid not null references public.monitoring_systems(id) on delete cascade,
  triggered_at     timestamptz not null default now(),
  resolved_at      timestamptz,
  message          text not null,
  severity         text not null,
  acknowledged_by  uuid references auth.users(id),
  notification_log jsonb
);

create index monitoring_alert_events_system_time
  on public.monitoring_alert_events (system_id, triggered_at desc);

alter table public.monitoring_alert_events enable row level security;

create policy "Staff can manage alert events"
  on public.monitoring_alert_events for all
  using (public.current_role() in ('manager', 'admin'));

create policy "Customers can read own alert events"
  on public.monitoring_alert_events for select
  using (
    system_id in (
      select ms.id from public.monitoring_systems ms
      join   public.sites s on s.id = ms.site_id
      where  s.customer_id = auth.uid()
    )
  );

-- ── monitoring_system_permissions ─────────────────────────────
create table public.monitoring_system_permissions (
  id                  uuid primary key default uuid_generate_v4(),
  system_id           uuid not null references public.monitoring_systems(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  can_view_live       boolean not null default true,
  can_view_history    boolean not null default true,
  can_view_strings    boolean not null default false,
  can_view_faults     boolean not null default true,
  can_change_mode     boolean not null default false,
  can_change_soc      boolean not null default false,
  can_change_schedule boolean not null default false,
  can_change_export   boolean not null default false,
  can_receive_alerts  boolean not null default false,
  notes               text,
  granted_by          uuid references auth.users(id),
  granted_at          timestamptz not null default now(),
  unique (system_id, user_id)
);

alter table public.monitoring_system_permissions enable row level security;

create policy "Admin can manage permissions"
  on public.monitoring_system_permissions for all
  using (public.current_role() = 'admin');

create policy "Manager can read permissions"
  on public.monitoring_system_permissions for select
  using (public.current_role() = 'manager');

create policy "Customers can read own permissions"
  on public.monitoring_system_permissions for select
  using (user_id = auth.uid());

-- ── Extend sites with geocoding metadata ──────────────────────
alter table public.sites
  add column if not exists geocode_source text check (geocode_source in ('address','inverter','manual')),
  add column if not exists geocoded_at    timestamptz;
