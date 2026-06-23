-- 039_system_design.sql
-- Single source of truth for the Quotes-v2 Energy-first design canvas. Holds the
-- whole SystemDesign object (energy profile, panel groups, inverter, batteries,
-- earthing, diagram layout) as one JSONB blob that both the section editors and
-- the SLD diagram read and write. Nullable + additive: existing quotes keep
-- working and are hydrated from generated_quote on first open until saved here.
alter table public.quote_requests
  add column if not exists system_design jsonb;
