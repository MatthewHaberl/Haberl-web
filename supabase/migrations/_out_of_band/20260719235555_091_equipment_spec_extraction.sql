-- Applied to production 2026-07-19 (version 20260719235555) outside the repo.
-- Recovered from supabase_migrations.schema_migrations. See _out_of_band/README.md.
--
-- ⚠️ INCOMPLETE BY ITS OWN ADMISSION. The recorded migration below says the parser
-- functions and the full-catalog backfill "were applied ahead of this record" and
-- that it only "re-asserts the DDL idempotently". It also references a repo file
-- `supabase/migrations/091_equipment_spec_extraction.sql` that was never committed.
--
-- Consequence: public.extract_equipment_specs(...) exists in production with NO
-- migration defining it anywhere — not in this repo and not in
-- supabase_migrations.schema_migrations. A fresh database rebuilt from migrations
-- alone will NOT have that function, and this file will fail on the first
-- statement. Dump the live definition before relying on a rebuild:
--
--   select pg_get_functiondef(oid) from pg_proc
--   where proname = 'extract_equipment_specs' and pronamespace = 'public'::regnamespace;

-- 091: Structured spec extraction for the equipment catalog.
update public.equipment_catalog
set specs = public.extract_equipment_specs(category, description, sku) || coalesce(specs, '{}'::jsonb)
where category in ('breaker','rccb','spd','disconnect','isolator','fuse','fuseholder','inverter','battery','panel')
  and not (specs ? 'device_type');

update public.equipment_catalog
set phase = specs ->> 'phase'
where category = 'inverter'
  and phase = 'any'
  and specs ->> 'device_type' = 'inverter'
  and specs ->> 'phase' in ('single', 'three');

create or replace function public.tg_extract_equipment_specs()
returns trigger
language plpgsql as $tg$
begin
  new.specs := public.extract_equipment_specs(new.category, new.description, new.sku)
               || coalesce(new.specs, '{}'::jsonb);
  return new;
end;
$tg$;

drop trigger if exists trg_extract_specs on public.equipment_catalog;
create trigger trg_extract_specs
  before insert or update of description, category, sku
  on public.equipment_catalog
  for each row execute function public.tg_extract_equipment_specs();
