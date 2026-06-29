-- ============================================================
-- Migration 066: document allocations (per-line / %/ whole / custom)
-- ------------------------------------------------------------
-- One row per allocation made against an invoice/receipt. Separates the
-- two independent facts about a bill:
--   direction = 'charge'    → the customer owes us (recharge their job)
--   direction = 'reimburse' → we owe the customer (they fronted the cash,
--                             e.g. Damien paid a supplier bill of business stock)
--
-- basis decides how much:
--   'whole'   → the whole document total
--   'percent' → percent of the document total
--   'items'   → the selected line items (line_item_ids); each selected line
--               surfaces as its OWN line on the statement
--   'custom'  → an explicit amount
-- amount_cents always holds the resolved total (computed server-side).
--
-- The per-customer statement (customer_statement) is rebuilt below to fold
-- these in alongside bank allocations.
-- ============================================================

create table if not exists public.fin_allocations (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references public.fin_documents(id) on delete cascade,
  customer_id    uuid not null references public.customers(id) on delete cascade,
  direction      text not null check (direction in ('charge','reimburse')),
  basis          text not null check (basis in ('whole','percent','items','custom')),
  percent        numeric(6,3),
  line_item_ids  uuid[],
  amount_cents   bigint not null,
  note           text,
  created_by     uuid references public.user_profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists fin_allocations_customer_idx on public.fin_allocations (customer_id);
create index if not exists fin_allocations_document_idx on public.fin_allocations (document_id);

drop trigger if exists fin_allocations_touch on public.fin_allocations;
create trigger fin_allocations_touch before update on public.fin_allocations
  for each row execute function public.fin_touch_updated_at();

alter table public.fin_allocations enable row level security;
drop policy if exists "Managers manage fin_allocations" on public.fin_allocations;
create policy "Managers manage fin_allocations"
  on public.fin_allocations for all
  using (public.current_role() in ('manager','admin'))
  with check (public.current_role() in ('manager','admin'));

-- ── rebuilt statement: bank allocations + document allocations ──
create or replace function public.customer_statement(p_customer_id uuid)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  with
  bank_credit as (  -- money IN from them (their payments) — in their favour
    select t.txn_date as d, coalesce(nullif(t.description,''),'Payment') as memo,
           t.amount_cents as amt, 'bank'::text as src, t.account_label as ref, null::uuid as doc_id
    from public.bank_transactions t
    where t.allocated_customer_id = p_customer_id and t.amount_cents > 0
  ),
  bank_debit as (   -- money OUT allocated to them — they owe us
    select t.txn_date as d, coalesce(nullif(t.description,''),'Charge') as memo,
           -t.amount_cents as amt, 'bank'::text as src, t.account_label as ref, null::uuid as doc_id
    from public.bank_transactions t
    where t.allocated_customer_id = p_customer_id and t.amount_cents < 0
  ),
  alloc as (
    select a.*, d.supplier_name, d.doc_number, d.doc_date
    from public.fin_allocations a
    join public.fin_documents d on d.id = a.document_id
    where a.customer_id = p_customer_id
  ),
  alloc_items as (  -- items basis → one row per selected line
    select a.direction,
           coalesce(li.line_total_cents,0) as amt,
           coalesce(nullif(li.description,''),'Line item') as memo,
           coalesce(a.doc_date, a.created_at::date) as d,
           'invoice'::text as src,
           coalesce(a.supplier_name, a.doc_number, 'Invoice') as ref,
           a.document_id as doc_id
    from alloc a
    join lateral unnest(a.line_item_ids) as lid(id) on true
    join public.fin_line_items li on li.id = lid.id
    where a.basis = 'items'
  ),
  alloc_single as ( -- whole / percent / custom → one row
    select a.direction, a.amount_cents as amt,
           coalesce(nullif(a.note,''),
             (case a.basis when 'whole'   then 'Whole invoice'
                           when 'percent' then a.percent::text || '% of invoice'
                           else 'Invoice amount' end)
             || coalesce(' — ' || a.supplier_name, '')) as memo,
           coalesce(a.doc_date, a.created_at::date) as d,
           'invoice'::text as src,
           coalesce(a.supplier_name, a.doc_number, 'Invoice') as ref,
           a.document_id as doc_id
    from alloc a where a.basis <> 'items'
  ),
  alloc_all as (select * from alloc_items union all select * from alloc_single),
  credits as (  -- in their favour: their payments + what we owe them (reimburse)
    select d, memo, amt, src, ref, doc_id from bank_credit
    union all
    select d, memo, amt, src, ref, doc_id from alloc_all where direction = 'reimburse'
  ),
  debits as (   -- owed to us: bank money spent on them + charges
    select d, memo, amt, src, ref, doc_id from bank_debit
    union all
    select d, memo, amt, src, ref, doc_id from alloc_all where direction = 'charge'
  )
  select json_build_object(
    'credits',      (select coalesce(json_agg(c order by c.d, c.memo), '[]'::json) from credits c),
    'debits',       (select coalesce(json_agg(x order by x.d, x.memo), '[]'::json) from debits x),
    'total_credit', (select coalesce(sum(amt),0) from credits),
    'total_debit',  (select coalesce(sum(amt),0) from debits),
    'credit_count', (select count(*) from credits),
    'debit_count',  (select count(*) from debits)
  );
$$;