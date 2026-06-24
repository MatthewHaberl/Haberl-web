-- 043_protection_catalog.sql
-- Foundation for product-driven combiner internals + battery wiring: the design
-- sections pick real catalog products (breakers, fuses, holders, SPDs, isolators,
-- disconnects, cables) instead of free text. Adds the new categories to the check
-- constraint and seeds a starter set. COSTS ARE PLACEHOLDERS — confirm and edit on
-- Settings → Catalog. Cable prices ballparked off Key Electric (keyelectric.co.za).
alter table public.equipment_catalog drop constraint if exists equipment_catalog_category_check;
alter table public.equipment_catalog add constraint equipment_catalog_category_check
  check (category = any (array[
    'inverter','battery','panel','connector','cable','isolator','mounting',
    'enclosure','breaker','fuse','fuseholder','spd','disconnect','other'
  ]));

insert into public.equipment_catalog
  (category, brand, sku, description, phase, cost_rands, active, sort_order)
values
  -- DC breakers (MCB)
  ('breaker','Generic','DCMCB-16','DC MCB 16A 1000V 1P','any',95,true,10),
  ('breaker','Generic','DCMCB-25','DC MCB 25A 1000V 1P','any',110,true,11),
  ('breaker','Generic','DCMCB-32','DC MCB 32A 1000V 1P','any',125,true,12),
  ('breaker','Generic','DCMCB-63','DC MCB 63A 1000V 2P','any',180,true,13),
  -- gPV fuses
  ('fuse','Generic','GPV-15','gPV fuse 15A 1000V (10x38)','any',38,true,20),
  ('fuse','Generic','GPV-20','gPV fuse 20A 1000V (10x38)','any',40,true,21),
  ('fuse','Generic','GPV-25','gPV fuse 25A 1000V (10x38)','any',42,true,22),
  -- Fuse holders
  ('fuseholder','Generic','FH-1P','PV fuse holder 1P (10x38)','any',55,true,30),
  ('fuseholder','Generic','FH-2P','PV fuse holder 2P (10x38)','any',95,true,31),
  -- DC SPDs
  ('spd','Generic','SPD-T2','DC SPD Type 2 1000V','any',420,true,40),
  ('spd','Generic','SPD-T12','DC SPD Type 1+2 1000V','any',780,true,41),
  -- DC isolators
  ('isolator','Generic','DCISO-25','DC isolator 1000V 25A','any',180,true,50),
  ('isolator','Generic','DCISO-32','DC isolator 1000V 32A','any',210,true,51),
  ('isolator','Generic','DCISO-63','DC isolator 1000V 63A','any',320,true,52),
  -- Battery disconnects
  ('disconnect','Generic','BDISC-160','Battery disconnect 160A DC','any',650,true,60),
  ('disconnect','Generic','BDISC-250','Battery disconnect 250A DC','any',850,true,61),
  ('disconnect','Generic','BDISC-400','Battery isolator 400A DC','any',1250,true,62),
  -- Cables (per metre) — Key Electric / SA suppliers
  ('cable','Key Electric','CAB-16R','Solar/battery cable 16mm² red (per m)','any',60,true,70),
  ('cable','Key Electric','CAB-16B','Solar/battery cable 16mm² black (per m)','any',60,true,71),
  ('cable','Key Electric','CAB-25','Battery/welding cable 25mm² (per m)','any',85,true,72),
  ('cable','Key Electric','CAB-35','Battery/welding cable 35mm² (per m)','any',115,true,73),
  ('cable','Key Electric','CAB-50','Battery/welding cable 50mm² (per m)','any',160,true,74),
  ('cable','Key Electric','CAB-70','Battery/welding cable 70mm² (per m)','any',225,true,75),
  ('cable','Key Electric','CAB-95','Battery/welding cable 95mm² (per m)','any',300,true,76);
