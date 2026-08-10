-- Applied to production 2026-06-02 (version 20260602074812) outside the repo.
-- Recovered from supabase_migrations.schema_migrations. See _out_of_band/README.md.

-- Rename name → brand to match updated code (commit e46a778)
ALTER TABLE public.equipment_brands RENAME COLUMN name TO brand;

-- Drop unused sort_order column
ALTER TABLE public.equipment_brands DROP COLUMN sort_order;

-- Fix unique constraint to reference renamed column
ALTER TABLE public.equipment_brands DROP CONSTRAINT IF EXISTS equipment_brands_category_name_key;
ALTER TABLE public.equipment_brands ADD CONSTRAINT equipment_brands_category_brand_key UNIQUE (category, brand);
