alter table public.quote_requests
  add column if not exists generation_method text not null default 'ai'
    check (generation_method in ('ai', 'calculator', 'manual')),
  add column if not exists selected_inverter_id uuid references public.equipment_catalog(id) on delete set null,
  add column if not exists selected_battery_id uuid references public.equipment_catalog(id) on delete set null,
  add column if not exists selected_panel_id uuid references public.equipment_catalog(id) on delete set null,
  add column if not exists selected_battery_qty integer,
  add column if not exists selected_panel_qty integer,
  add column if not exists cable_route_m numeric(8,1),
  add column if not exists storeys_premium_rands integer not null default 0;

comment on column public.quote_requests.generation_method is
  'How the quote was produced: ai, calculator, or manual.';

comment on column public.quote_requests.selected_inverter_id is
  'Catalog item used by the deterministic calculator for the saved quote.';

comment on column public.quote_requests.selected_battery_id is
  'Catalog battery item used by the deterministic calculator for the saved quote.';

comment on column public.quote_requests.selected_panel_id is
  'Catalog panel item used by the deterministic calculator for the saved quote.';

comment on column public.quote_requests.selected_battery_qty is
  'Battery quantity saved alongside a calculated quote.';

comment on column public.quote_requests.selected_panel_qty is
  'Panel quantity saved alongside a calculated quote.';

comment on column public.quote_requests.cable_route_m is
  'Admin-entered cable route length in metres for calculator pricing.';

comment on column public.quote_requests.storeys_premium_rands is
  'Explicit storeys premium persisted with calculator-generated quotes.';
