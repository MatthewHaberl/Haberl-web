-- ============================================================
-- Migration 035: intake v2 fields
-- Customer gets its own address + a business toggle (contact person).
-- Usage gets a load-profile preset and an upgrade reason (existing systems).
-- Additive, nullable. The site's address stays in the existing `address` column.
-- ============================================================

alter table public.quote_requests
  add column if not exists customer_address text,                         -- the customer's own address (≠ site address)
  add column if not exists is_business      boolean default false,        -- customer is a business
  add column if not exists contact_name     text,                         -- business contact person
  add column if not exists contact_email    text,
  add column if not exists load_profile     text,                         -- preset: office | 24-7 | evening-home | daytime-home | family | flat
  add column if not exists upgrade_reason   text;                         -- existing systems: higher-usage | fault | other

comment on column public.quote_requests.customer_address is
  'The customer''s own address. The site''s address stays in `address`.';
comment on column public.quote_requests.load_profile is
  'Load-profile preset guiding battery sizing (see wiki: Solar System Audit Rules).';
