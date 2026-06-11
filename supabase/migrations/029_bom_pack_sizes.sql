-- Purchasable pack sizes per BOM SKU (cable drums, conduit sticks, boxes).
-- Keyed by SKU because per-metre BOM lines are calculator items, not
-- equipment_catalog rows. Drives the "Order quantities" view: needed qty →
-- rounded to whole packs, surplus made visible.
create table if not exists public.bom_pack_sizes (
  sku text primary key,
  pack_size numeric not null check (pack_size > 0),
  pack_unit text not null default 'pack',
  updated_at timestamptz not null default now()
);

alter table public.bom_pack_sizes enable row level security;

create policy "Staff can read pack sizes"
  on public.bom_pack_sizes for select
  using ("current_role"() in ('field_worker', 'manager', 'admin'));

create policy "Admin can manage pack sizes"
  on public.bom_pack_sizes for all
  using ("current_role"() = 'admin');

-- Common SA cable drums — adjust to actual supplier packs as confirmed
insert into public.bom_pack_sizes (sku, pack_size, pack_unit) values
  ('CAB-PV-004-BK',  100, 'm drum'),
  ('CAB-PV-004-RD',  100, 'm drum'),
  ('FPW6.0GRN-YELL', 100, 'm drum'),
  ('FPW16.0BLACK',   100, 'm drum')
on conflict (sku) do nothing;
