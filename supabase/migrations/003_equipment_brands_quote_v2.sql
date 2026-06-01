-- ── Equipment brands (admin-managed list) ─────────────────────
create table public.equipment_brands (
  id         uuid primary key default uuid_generate_v4(),
  category   text not null check (category in ('inverter', 'battery', 'panel')),
  name       text not null,
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(category, name)
);

alter table public.equipment_brands enable row level security;

create policy "Authenticated users can read brands"
  on public.equipment_brands for select
  using (auth.uid() is not null);

create policy "Admin can manage brands"
  on public.equipment_brands for all
  using (public.current_role() = 'admin');

-- Seed brands
insert into public.equipment_brands (category, name, sort_order) values
  ('inverter', 'No preference — AI will recommend', 0),
  ('inverter', 'Sigenergy', 1), ('inverter', 'Sunsynk', 2), ('inverter', 'Deye', 3),
  ('inverter', 'FoxESS', 4), ('inverter', 'Growatt', 5), ('inverter', 'Victron', 6),
  ('inverter', 'GoodWe', 7), ('inverter', 'SolaX', 8), ('inverter', 'LuxPower', 9),
  ('inverter', 'Huawei FusionSolar', 10), ('inverter', 'Solis/Ginlong', 11),
  ('battery',  'No preference — AI will recommend', 0),
  ('battery',  'Sigenergy/SigenStor', 1), ('battery', 'Deye/Dyness', 2),
  ('battery',  'Sunsynk', 3), ('battery', 'FreedomWon', 4), ('battery', 'Pylontech', 5),
  ('battery',  'Hubble', 6), ('battery', 'Solar MD', 7), ('battery', 'BYD', 8),
  ('battery',  'Eenovance', 9), ('battery', 'Photon', 10),
  ('panel',    'No preference — AI will recommend', 0),
  ('panel',    'JA Solar', 1), ('panel', 'Aiko', 2), ('panel', 'LONGi', 3),
  ('panel',    'Trina', 4), ('panel', 'Canadian Solar', 5), ('panel', 'Jinko Solar', 6),
  ('panel',    'ARTsolar', 7), ('panel', 'Risen Energy', 8);

-- ── New columns on quote_requests ────────────────────────────
alter table public.quote_requests
  add column usage_mode       text not null default 'monthly',
  add column monthly_kwh_jan  text, add column monthly_kwh_feb  text,
  add column monthly_kwh_mar  text, add column monthly_kwh_apr  text,
  add column monthly_kwh_may  text, add column monthly_kwh_jun  text,
  add column monthly_kwh_jul  text, add column monthly_kwh_aug  text,
  add column monthly_kwh_sep  text, add column monthly_kwh_oct  text,
  add column monthly_kwh_nov  text, add column monthly_kwh_dec  text,
  add column inverter_brand   text,
  add column battery_brand    text,
  add column panel_brand      text,
  add column target_offgrid_pct integer,
  add column is_amendment              boolean not null default false,
  add column existing_inverter         text,
  add column existing_batteries        text,
  add column existing_panels           text,
  add column existing_monthly_usage    text,
  add column existing_monthly_gen      text,
  add column existing_monthly_saving   text,
  add column amendment_scope           text,
  add column photo_urls       text[] not null default '{}';

-- ── Storage bucket (run separately in SQL editor) ─────────────
-- insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- values ('quote-photos', 'quote-photos', true, 10485760,
--   array['image/jpeg','image/png','image/webp','image/heic','image/heif']);
