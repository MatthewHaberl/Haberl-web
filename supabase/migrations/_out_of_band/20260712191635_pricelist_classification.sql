-- Applied to production 2026-07-12 (version 20260712191635) outside the repo.
-- Recovered from supabase_migrations.schema_migrations. See _out_of_band/README.md.
-- Was authored as "092_pricelist_classification.sql" — that number is taken in the
-- repo by a different migration, hence the timestamp-based filename here.

-- Classification columns on supplier price-list lines. The P2 classifier stores
-- its verdict on every line (even ones NOT promoted to the catalog), so the
-- price-list browser can filter by guessed category and later bulk-promotions
-- (e.g. lighting) are a flag-flip, not a re-parse.
--
-- SAFETY: additive, nullable columns only.

alter table public.supplier_pricelist_lines
  add column if not exists category_guess text,
  add column if not exists brand_guess    text,
  add column if not exists specs_guess    jsonb not null default '{}'::jsonb;

comment on column public.supplier_pricelist_lines.category_guess is
  'Classifier verdict for this line (equipment_catalog category vocabulary + extended groups like light/control/gland/conduit/cable_mgmt/busbar/socket_switch/meter, or ignored/unknown). Set even when the line is not promoted.';
comment on column public.supplier_pricelist_lines.brand_guess is
  'Manufacturer parsed from the description against a known-brand list. NULL when not confidently recognised.';
comment on column public.supplier_pricelist_lines.specs_guess is
  'Structured attributes parsed from the description (poles, amperage_a, breaking_capacity_ka, curve, voltage_v, current_type, mm2, cores, ...). Copied onto equipment_catalog.specs at promotion.';

create index if not exists supplier_pricelist_lines_catguess_idx
  on public.supplier_pricelist_lines (pricelist_id, category_guess);
