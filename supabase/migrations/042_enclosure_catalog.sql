-- 042_enclosure_catalog.sql
-- Seed a starter set of DB / PV-combiner enclosures into equipment_catalog so the
-- DC-combiner section can pick a specific DB and auto-populate its enclosure fields.
-- New category 'enclosure' (the column is free text — 'connector' already exists).
-- Enclosure attributes live in notes JSON: {"enclosure":{material,mount,ways,rows,ip}}.
-- COSTS ARE PLACEHOLDER ESTIMATES — confirm against the real Chint price list and
-- edit on Settings → Catalog → Enclosures.

-- Allow the new category (the check constraint enumerates valid categories).
alter table public.equipment_catalog drop constraint if exists equipment_catalog_category_check;
alter table public.equipment_catalog add constraint equipment_catalog_category_check
  check (category = any (array['inverter','battery','panel','connector','cable','isolator','mounting','enclosure','other']));

insert into public.equipment_catalog
  (category, brand, sku, description, phase, cost_rands, active, sort_order, notes)
values
  ('enclosure','Chint','CHINT-DB-6S','Chint 6-way surface DB (plastic)','any',180,true,10,'{"enclosure":{"material":"plastic","mount":"surface","ways":6,"rows":1,"ip":"IP4X"}}'),
  ('enclosure','Chint','CHINT-DB-8S','Chint 8-way surface DB (plastic)','any',220,true,11,'{"enclosure":{"material":"plastic","mount":"surface","ways":8,"rows":1,"ip":"IP4X"}}'),
  ('enclosure','Chint','CHINT-DB-12S','Chint 12-way surface DB (plastic)','any',320,true,12,'{"enclosure":{"material":"plastic","mount":"surface","ways":12,"rows":1,"ip":"IP4X"}}'),
  ('enclosure','Chint','CHINT-DB-18S','Chint 18-way surface DB (plastic)','any',480,true,13,'{"enclosure":{"material":"plastic","mount":"surface","ways":18,"rows":1,"ip":"IP4X"}}'),
  ('enclosure','Chint','CHINT-DB-12F','Chint 12-way flush DB (steel tray)','any',420,true,14,'{"enclosure":{"material":"steel","mount":"flush","ways":12,"rows":1,"ip":"IP30"}}'),
  ('enclosure','Chint','CHINT-DB-18F','Chint 18-way flush DB (steel tray)','any',620,true,15,'{"enclosure":{"material":"steel","mount":"flush","ways":18,"rows":1,"ip":"IP30"}}'),
  ('enclosure','Chint','CHINT-DB-12WP','Chint 12-way weatherproof DB (IP66 poly)','any',650,true,16,'{"enclosure":{"material":"poly","mount":"weatherproof","ways":12,"rows":1,"ip":"IP66"}}'),
  ('enclosure','Chint','CHINT-DB-18WP','Chint 18-way weatherproof DB (IP66 poly)','any',950,true,17,'{"enclosure":{"material":"poly","mount":"weatherproof","ways":18,"rows":1,"ip":"IP66"}}'),
  ('enclosure','Generic','PV-CB-2-1','PV DC combiner 2-in 1-out (IP65, 1000V)','any',1200,true,20,'{"enclosure":{"material":"poly","mount":"weatherproof","ways":4,"rows":1,"ip":"IP65"}}'),
  ('enclosure','Generic','PV-CB-4-2','PV DC combiner 4-in 2-out (IP65, 1000V)','any',1900,true,21,'{"enclosure":{"material":"poly","mount":"weatherproof","ways":8,"rows":1,"ip":"IP65"}}');
