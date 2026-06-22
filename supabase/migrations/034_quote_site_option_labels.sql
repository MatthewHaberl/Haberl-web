-- ============================================================
-- Migration 034: site & option labels for the Customer→Site→Option model
-- Additive, nullable. Each quote_requests row is an "option"; these labels
-- let us group by site and name options, killing the "Site 1, Site 1, Site 1"
-- noise without touching the calculator or existing data.
-- ============================================================

alter table public.quote_requests
  add column if not exists site_label   text,   -- e.g. "Home", "Business — Boksburg"
  add column if not exists option_label text;   -- e.g. "Option A — 8 kW hybrid"

comment on column public.quote_requests.site_label is
  'Free-text site/location name within a customer. Falls back to address, then site_number.';
comment on column public.quote_requests.option_label is
  'Free-text name for this option/variant. Falls back to quote_number, then "Option N".';
