-- Applied to production 2026-07-12 (version 20260712193028) outside the repo.
-- Recovered from supabase_migrations.schema_migrations. See _out_of_band/README.md.
-- Was authored as "093_catalog_category_expansion.sql" — that number is taken in the
-- repo by a different migration, hence the timestamp-based filename here.

-- Extend the equipment_catalog category vocabulary for the Key Electric
-- price-list promotion (P2): general-electrical groups that previously had no
-- home (they were crammed into 'other'). Items in the new categories surface
-- under the "Other / Accessories" tab in catalog admin until they get their own
-- tabs; quote pickers are unaffected (they query specific categories).
--
--   control       contactors, relays, timers, push buttons, PLC/automation
--   meter         kWh/prepaid meters, CTs
--   gland         cable glands + shrouds
--   busbar        busbars, earth/neutral bars, pin combs, insulators
--   socket_switch wiring devices: sockets, switches, cover plates, industrial plugs
--   cable_mgmt    trays, trunking, Cabstrut/strut, ties, markers, sleeving, tape
--   conduit       conduit + fittings (sprague, bends, adaptors)
--   light         luminaires + lamps (classified now, promoted later if wanted)
--
-- SAFETY: constraint widening only — every existing row remains valid.

alter table public.equipment_catalog drop constraint if exists equipment_catalog_category_check;
alter table public.equipment_catalog add constraint equipment_catalog_category_check
  check (category = any (array[
    'inverter', 'battery', 'panel', 'connector', 'cable', 'isolator', 'mounting',
    'enclosure', 'breaker', 'fuse', 'fuseholder', 'spd', 'disconnect', 'rccb',
    'control', 'meter', 'gland', 'busbar', 'socket_switch', 'cable_mgmt', 'conduit',
    'light', 'other'
  ]::text[]));
