-- ── Add 'dessmonitor' (SmartESS / Eybond cloud) to the monitoring brand lists ──
-- New adapter: lib/monitoring/adapters/dessmonitor.ts. Covers inverters that
-- report via an Eybond Wi-Fi Pro datalogger through the SmartESS / WatchPower /
-- EnergyMate apps and the dessmonitor.com web portal (SRNE, PowMr, MUST, etc.).
--
-- Both brand columns carry an inline CHECK that must be widened. The original
-- inline constraints are auto-named <table>_brand_check; drop and re-add named.

-- monitoring_systems.brand (migration 020)
alter table public.monitoring_systems
  drop constraint if exists monitoring_systems_brand_check;
alter table public.monitoring_systems
  add constraint monitoring_systems_brand_check check (brand in (
    'sunsynk','sigenergy','foxess','deye','growatt','victron',
    'goodwe','solax','solis','huawei','dessmonitor','luxpower','local'
  ));

-- monitoring_brand_accounts.brand (migration 057)
alter table public.monitoring_brand_accounts
  drop constraint if exists monitoring_brand_accounts_brand_check;
alter table public.monitoring_brand_accounts
  add constraint monitoring_brand_accounts_brand_check check (brand in (
    'sunsynk','sigenergy','foxess','deye','growatt','victron',
    'goodwe','solax','solis','huawei','dessmonitor','luxpower','local'
  ));
