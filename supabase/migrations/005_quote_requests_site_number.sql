-- Migration 005: add multi-site support to quote requests
-- The quote_requests table already exists in production, so this stays additive.

alter table public.quote_requests
  add column if not exists site_number integer not null default 1;

comment on column public.quote_requests.site_number is
  'Customer site index for multi-site quoting (1 = primary site, 2+ = secondary sites).';
