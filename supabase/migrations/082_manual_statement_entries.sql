-- ============================================================
-- Migration 082: manual statement entries
-- ------------------------------------------------------------
-- The customer statement is otherwise derived from allocated invoices + bank
-- lines. This adds hand-entered lines for things with no document or bank
-- record yet — e.g. "add an invoice to Damien's statement" for extra labour, an
-- agreed adjustment, or a cash payment that never hit the bank.
--
--   direction = 'charge' → they owe us (a debit, like an invoice)
--   direction = 'credit' → in their favour (a payment / credit note / discount)
--   amount_cents is a POSITIVE magnitude; the direction decides the sign.
--
-- Folded into the statement at the page level (the customer_statement RPC stays
-- a pure derivation and is co-owned with other work).
-- ============================================================

create table if not exists public.fin_manual_entries (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers(id) on delete cascade,
  entry_date   date not null default current_date,
  direction    text not null check (direction in ('charge','credit')),
  amount_cents bigint not null check (amount_cents > 0),
  memo         text,
  reference    text,                       -- optional invoice/reference number
  created_by   uuid references public.user_profiles(id),
  created_at   timestamptz not null default now()
);

create index if not exists fin_manual_entries_customer_idx on public.fin_manual_entries (customer_id);

alter table public.fin_manual_entries enable row level security;

drop policy if exists "Managers manage manual entries" on public.fin_manual_entries;
create policy "Managers manage manual entries"
  on public.fin_manual_entries for all
  using (public.current_role() in ('manager','admin'))
  with check (public.current_role() in ('manager','admin'));
