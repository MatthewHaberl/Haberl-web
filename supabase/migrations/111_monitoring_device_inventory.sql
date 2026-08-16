-- Installed hardware per monitored system.
--
-- `capacity_kw` on this table is the PV array size (kWp) that someone types in
-- when adding a system. It says nothing about the inverter, and it cannot: a
-- site's inverter rating is a property of the whole bank, not of one unit —
-- Hotel Nieu runs THREE Quattro 48/15000 in parallel (45 kVA / 36 kW), which no
-- single hand-typed number was ever going to capture.
--
-- The brand clouds do enumerate the devices, so these columns hold what we read
-- back from them (see lib/monitoring/devices.ts + each adapter's fetchDevices).
-- Everything here is derived and refreshable — nothing a human types lives in
-- these columns, so a refresh can always overwrite them safely.
alter table monitoring_systems
  add column if not exists inverter_kva      numeric(8,2),   -- total across the bank
  add column if not exists inverter_kw       numeric(8,2),   -- total continuous output
  add column if not exists inverter_count    integer,        -- units in parallel / per phase
  add column if not exists mppt_kw           numeric(8,2),   -- total DC-coupled PV the MPPTs carry
  add column if not exists pv_inverter_count integer,        -- AC-coupled PV inverters
  add column if not exists device_summary    text,           -- "3 x Quattro 48/15000 (3 in parallel on L1)"
  add column if not exists device_inventory  jsonb,          -- full device list as read
  add column if not exists devices_synced_at timestamptz;

comment on column monitoring_systems.inverter_kw is
  'Total continuous inverter output across the whole bank, read from the brand cloud. Distinct from capacity_kw, which is the PV array size in kWp.';
comment on column monitoring_systems.device_inventory is
  'Normalised InventoryDevice[] from the brand cloud (lib/monitoring/devices.ts). Derived — safe to overwrite on refresh.';
