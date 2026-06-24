-- 050_canvas_colors.sql
-- Per-company design-canvas circuit colours. The SLD / design canvas reads its
-- circuit colours (PV, Battery, AC, Earth + stripe, Data, Grid) from the brand
-- defaults in lib/solar/canvas-theme.ts; this column lets a company override any of
-- them. Stored as a partial jsonb blob keyed by circuit layer, e.g.
--   { "pv": { "stroke": "#f97316" }, "earth": { "stripe": "#facc15" } }
-- Only the fields a user actually changed are saved; the renderer deep-merges them
-- over the defaults, so unchanged layers/fields keep the brand colours.
--
-- SAFETY: additive, backward-compatible. Nullable with no default — existing rows
-- stay null and the canvas renders the exact brand defaults as before.

alter table public.company_settings
  add column if not exists canvas_colors jsonb;

comment on column public.company_settings.canvas_colors is
  'Per-company design-canvas circuit colour overrides. Partial jsonb keyed by circuit layer (pv/battery/ac/earth/data/grid), each an object of { label?, stroke?, fill?, striped?, stripe? }. Deep-merged over the brand defaults in lib/solar/canvas-theme.ts; null means use the defaults.';
