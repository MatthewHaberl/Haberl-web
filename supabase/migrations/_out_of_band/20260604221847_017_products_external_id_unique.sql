-- Applied to production 2026-06-04 (version 20260604221847) outside the repo.
-- Recovered from supabase_migrations.schema_migrations. See _out_of_band/README.md.

ALTER TABLE products ADD CONSTRAINT products_external_id_unique UNIQUE (external_id);
