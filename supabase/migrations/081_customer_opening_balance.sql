-- ============================================================
-- Migration 081: manual opening balance on a customer statement
-- ------------------------------------------------------------
-- The statement is otherwise fully derived from allocated invoices + bank
-- lines. When a customer relationship predates what's tracked in the app, you
-- need to carry a brought-forward figure so the running balance starts from the
-- right place.
--
--   opening_balance_cents : signed. > 0 = they owe us (a debit/brought-forward
--                           charge); < 0 = they are in credit. Default 0.
--   opening_balance_date  : the "as at" date the figure applies from (display
--                           only — the statement folds it in as the first line).
--
-- Page-level only: the statement page adds this to its running balance. The
-- customer_statement RPC is intentionally left untouched (it stays a pure
-- derivation and is co-owned with other work).
-- ============================================================

alter table public.customers
  add column if not exists opening_balance_cents bigint not null default 0,
  add column if not exists opening_balance_date date;

comment on column public.customers.opening_balance_cents is
  'Brought-forward statement balance in cents. >0 = customer owes us; <0 = in credit.';
