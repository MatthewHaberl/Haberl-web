-- ============================================================
-- Migration 037: structured existing-array capture
-- Stores the existing PV string layout (count, watt, orientation, MPPT group)
-- so the engine can flag bad configurations (e.g. E/W on one MPPT). Additive.
-- ============================================================

alter table public.quote_requests
  add column if not exists existing_array jsonb;

comment on column public.quote_requests.existing_array is
  'Existing PV strings for amendments: [{panels, watt, orientation, mppt}]. Drives live rule checks (ARR-01/02).';
