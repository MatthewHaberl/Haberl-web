-- ============================================================
-- Migration 053: phone-number de-duplication
-- ------------------------------------------------------------
-- Until now customers were only ever de-duplicated on email
-- (the customers_email_lower_key unique index + resolveOrCreateCustomer).
-- Leads and phone-only prospects never carry an email, so every lead
-- conversion / phone-only contact created a brand-new customer, and
-- "079 033 6247" vs "0790336247" read as two different people.
--
-- This adds a canonical phone key — normalize_phone() — plus a generated
-- column on customers and leads, so the app and the DB agree on what
-- "the same number" means. SA numbers fold to the local 0XXXXXXXXX form:
-- +27 / 0027 international prefixes and stray spaces/punctuation all
-- collapse together.
--
-- NB: no UNIQUE constraint is added — duplicates already exist in the
-- data and would block a unique index. De-duplication is enforced in the
-- app (resolveOrCreateCustomer + the Add-customer dialog warning) and the
-- existing duplicates are cleaned up as a separate, deliberate step.
--
-- Caveat: STORED generated columns are NOT recomputed when this function
-- is later replaced. If normalize_phone() ever changes, recompute the
-- columns (e.g. a no-op UPDATE that touches `phone`) and keep
-- lib/customers/phone.ts in lock-step.
-- ============================================================

create or replace function public.normalize_phone(p text)
returns text
language sql
immutable
as $$
  select case
    when regexp_replace(coalesce(p, ''), '\D', '', 'g') = ''      then null
    when regexp_replace(p, '\D', '', 'g') ~ '^27[0-9]{9}$'        then '0' || substr(regexp_replace(p, '\D', '', 'g'), 3)
    when regexp_replace(p, '\D', '', 'g') ~ '^0027[0-9]{9}$'      then '0' || substr(regexp_replace(p, '\D', '', 'g'), 5)
    when regexp_replace(p, '\D', '', 'g') ~ '^[0-9]{9}$'          then '0' || regexp_replace(p, '\D', '', 'g')
    else regexp_replace(p, '\D', '', 'g')
  end
$$;

-- customers: the de-dup key
alter table public.customers
  add column if not exists phone_normalized text
  generated always as (public.normalize_phone(phone)) stored;

create index if not exists customers_phone_normalized_idx
  on public.customers (phone_normalized)
  where phone_normalized is not null;

-- leads: lets the public intake throttle and the "already a customer"
-- match treat spaced / unspaced numbers as the same number.
alter table public.leads
  add column if not exists phone_normalized text
  generated always as (public.normalize_phone(phone)) stored;

create index if not exists leads_phone_normalized_idx
  on public.leads (phone_normalized)
  where phone_normalized is not null;
