-- ============================================================
-- Migration 079: dismiss a wrong "existing customer" match on a lead
-- ------------------------------------------------------------
-- The leads inbox flags a lead as an existing customer when its canonical
-- phone (phone_normalized, migration 053) matches a customer on file. That is
-- a false positive when two different people share a number (a spouse, a
-- household, a reused company line). When staff say the match is wrong we store
-- the customer id they rejected here, so the inbox stops badging this lead as
-- that customer and restores the normal "Convert to customer" action.
--
-- Storing the specific customer id (not a boolean) keeps it precise: if the
-- phone later matches a *different* customer, that new match still flags.
-- ============================================================

alter table public.leads
  add column if not exists not_duplicate_customer_id uuid references public.customers(id);
