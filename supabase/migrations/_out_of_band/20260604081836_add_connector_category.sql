-- Applied to production 2026-06-04 (version 20260604081836) outside the repo.
-- Recovered from supabase_migrations.schema_migrations. See _out_of_band/README.md.
-- NOTE: superseded by 20260712193028_catalog_category_expansion.sql, which widens
-- this same constraint further. Order between the two matters.

ALTER TABLE equipment_catalog
  DROP CONSTRAINT IF EXISTS equipment_catalog_category_check;

ALTER TABLE equipment_catalog
  ADD CONSTRAINT equipment_catalog_category_check
  CHECK (category = ANY (ARRAY['inverter','battery','panel','connector','cable','isolator','mounting','other']));
