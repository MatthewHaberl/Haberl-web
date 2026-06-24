-- 046_ac_protection_catalog.sql
-- AC-side protection products for the AC combiner / DB editor: AC main breakers,
-- RCCBs (new category) and AC SPDs. The DB enclosure itself reuses the existing
-- 'enclosure' Chint DBs. COSTS ARE PLACEHOLDERS — edit on Settings → Catalog.
alter table public.equipment_catalog drop constraint if exists equipment_catalog_category_check;
alter table public.equipment_catalog add constraint equipment_catalog_category_check
  check (category = any (array[
    'inverter','battery','panel','connector','cable','isolator','mounting',
    'enclosure','breaker','fuse','fuseholder','spd','disconnect','rccb','other'
  ]));

insert into public.equipment_catalog
  (category, brand, sku, description, phase, cost_rands, active, sort_order)
values
  ('breaker','Generic','ACMCB-40DP','AC MCB 40A DP (1P+N)','single',85,true,80),
  ('breaker','Generic','ACMCB-63DP','AC MCB 63A DP (1P+N)','single',110,true,81),
  ('breaker','Generic','ACMCB-63TP','AC MCB 63A TP (3P)','three',180,true,82),
  ('breaker','Generic','ACMCB-80TP','AC MCB 80A TP (3P)','three',230,true,83),
  ('rccb','Generic','RCCB-63-DP','RCCB 63A 30mA DP (2P)','single',420,true,90),
  ('rccb','Generic','RCCB-63-4P','RCCB 63A 30mA 4P','three',780,true,91),
  ('rccb','Generic','RCBO-40-DP','RCBO 40A 30mA DP','single',520,true,92),
  ('spd','Generic','ACSPD-T2-1P','AC SPD Type 2 230V (1P+N)','single',380,true,95),
  ('spd','Generic','ACSPD-T2-3P','AC SPD Type 2 400V (3P+N)','three',680,true,96);
