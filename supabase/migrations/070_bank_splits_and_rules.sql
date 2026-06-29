-- ============================================================
-- Migration 070: bank transaction splits, company tagging, and auto-rules
-- ------------------------------------------------------------
-- Three capabilities, one foundation:
--
--   1. SPLIT a single bank transaction across several customers and/or company
--      overhead (e.g. a R10k withdrawal = R3k Damien + R7k company fuel).
--   2. COMPANY tagging: a whole transaction (or a split part) booked to Haberl
--      with a category — feeds the expense view, not a customer statement.
--   3. AUTO-RULES: description patterns that bulk-allocate matching, still-loose
--      transactions in one click.
--
-- Model
-- -----
-- A bank transaction keeps its simple whole-txn fast path
-- (`allocated_customer_id`). The moment it needs more than that, we add rows to
-- `bank_txn_allocations` — and a transaction WITH allocation rows ignores its
-- whole-txn `allocated_customer_id` (so nothing is double-counted).
--
-- Amounts in `bank_txn_allocations` are stored as POSITIVE magnitudes; the
-- direction (payment vs charge) comes from the parent transaction's sign, just
-- like the whole-txn path.
-- ============================================================

-- ── split / company allocations ─────────────────────────────
create table if not exists public.bank_txn_allocations (
  id           uuid primary key default gen_random_uuid(),
  txn_id       uuid not null references public.bank_transactions(id) on delete cascade,
  target       text not null check (target in ('customer','company')),
  customer_id  uuid references public.customers(id) on delete cascade,
  category     text,
  amount_cents bigint not null check (amount_cents > 0),  -- magnitude of this part
  note         text,
  created_by   uuid references public.user_profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint bank_alloc_shape check (
    (target = 'customer' and customer_id is not null) or (target = 'company')
  )
);

create index if not exists bank_txn_allocations_txn_idx on public.bank_txn_allocations (txn_id);
create index if not exists bank_txn_allocations_customer_idx on public.bank_txn_allocations (customer_id);

drop trigger if exists bank_txn_allocations_touch on public.bank_txn_allocations;
create trigger bank_txn_allocations_touch before update on public.bank_txn_allocations
  for each row execute function public.fin_touch_updated_at();

alter table public.bank_txn_allocations enable row level security;
drop policy if exists "Managers manage bank_txn_allocations" on public.bank_txn_allocations;
create policy "Managers manage bank_txn_allocations"
  on public.bank_txn_allocations for all
  using (public.current_role() in ('manager','admin'))
  with check (public.current_role() in ('manager','admin'));

-- ── auto-allocation rules ───────────────────────────────────
create table if not exists public.bank_alloc_rules (
  id          uuid primary key default gen_random_uuid(),
  pattern     text not null,        -- case-insensitive substring of description
  target      text not null check (target in ('customer','company')),
  customer_id uuid references public.customers(id) on delete cascade,
  category    text,
  note        text,
  created_by  uuid references public.user_profiles(id),
  created_at  timestamptz not null default now(),
  constraint bank_rule_shape check (
    (target = 'customer' and customer_id is not null) or (target = 'company')
  )
);

create index if not exists bank_alloc_rules_pattern_idx on public.bank_alloc_rules (pattern);

alter table public.bank_alloc_rules enable row level security;
drop policy if exists "Managers manage bank_alloc_rules" on public.bank_alloc_rules;
create policy "Managers manage bank_alloc_rules"
  on public.bank_alloc_rules for all
  using (public.current_role() in ('manager','admin'))
  with check (public.current_role() in ('manager','admin'));

-- ── statement: fold split allocations alongside the whole-txn path ──
create or replace function public.customer_statement(p_customer_id uuid)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  with
  bank_credit as (  -- whole money IN from them (no split rows) — in their favour
    select t.txn_date as d, coalesce(nullif(t.description,''),'Payment') as memo,
           t.amount_cents as amt, 'bank'::text as src, t.account_label as ref,
           null::uuid as doc_id, t.id as txn_id
    from public.bank_transactions t
    where t.allocated_customer_id = p_customer_id and t.amount_cents > 0
      and not exists (select 1 from public.bank_txn_allocations s where s.txn_id = t.id)
  ),
  bank_debit as (   -- whole money OUT allocated to them (no split rows) — they owe us
    select t.txn_date as d, coalesce(nullif(t.description,''),'Charge') as memo,
           -t.amount_cents as amt, 'bank'::text as src, t.account_label as ref,
           null::uuid as doc_id, t.id as txn_id
    from public.bank_transactions t
    where t.allocated_customer_id = p_customer_id and t.amount_cents < 0
      and not exists (select 1 from public.bank_txn_allocations s where s.txn_id = t.id)
  ),
  split_credit as ( -- their portion of a split money-IN transaction
    select t.txn_date as d,
           coalesce(nullif(t.description,''),'Payment') || ' (split)' as memo,
           a.amount_cents as amt, 'bank'::text as src, t.account_label as ref,
           null::uuid as doc_id, t.id as txn_id
    from public.bank_txn_allocations a
    join public.bank_transactions t on t.id = a.txn_id
    where a.target = 'customer' and a.customer_id = p_customer_id and t.amount_cents > 0
  ),
  split_debit as (  -- their portion of a split money-OUT transaction
    select t.txn_date as d,
           coalesce(nullif(t.description,''),'Charge') || ' (split)' as memo,
           a.amount_cents as amt, 'bank'::text as src, t.account_label as ref,
           null::uuid as doc_id, t.id as txn_id
    from public.bank_txn_allocations a
    join public.bank_transactions t on t.id = a.txn_id
    where a.target = 'customer' and a.customer_id = p_customer_id and t.amount_cents < 0
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
           a.document_id as doc_id, null::uuid as txn_id
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
           a.document_id as doc_id, null::uuid as txn_id
    from alloc a where a.basis <> 'items'
  ),
  alloc_all as (select * from alloc_items union all select * from alloc_single),
  credits as (  -- in their favour: payments (whole + split) + reimburse allocations
    select d, memo, amt, src, ref, doc_id, txn_id from bank_credit
    union all select d, memo, amt, src, ref, doc_id, txn_id from split_credit
    union all select d, memo, amt, src, ref, doc_id, txn_id from alloc_all where direction = 'reimburse'
  ),
  debits as (   -- owed to us: charges (whole + split) + charge allocations
    select d, memo, amt, src, ref, doc_id, txn_id from bank_debit
    union all select d, memo, amt, src, ref, doc_id, txn_id from split_debit
    union all select d, memo, amt, src, ref, doc_id, txn_id from alloc_all where direction = 'charge'
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

-- ── report: customer filter + 'none' aware of split allocations ──
drop function if exists public.bank_txn_report(text, text, date, date, text, text, bigint, bigint);

create or replace function public.bank_txn_report(
  p_account  text default null,
  p_q        text default null,
  p_from     date default null,
  p_to       date default null,
  p_dir      text default null,
  p_customer text default null,   -- 'all'/null | 'none' | <customer uuid>
  p_min      bigint default null,
  p_max      bigint default null
) returns json
language sql
stable
security invoker
set search_path = public
as $$
  with f as (
    select t.*
    from public.bank_transactions t
    where (p_from is null or t.txn_date >= p_from)
      and (p_to   is null or t.txn_date <= p_to)
      and (p_q    is null or p_q = '' or t.description ilike '%' || p_q || '%')
      and (p_dir  is null or p_dir = 'all'
           or (p_dir = 'in'  and t.amount_cents > 0)
           or (p_dir = 'out' and t.amount_cents < 0))
      and (p_customer is null or p_customer = 'all'
           or (p_customer = 'none'
               and t.allocated_customer_id is null
               and not exists (select 1 from public.bank_txn_allocations s
                               where s.txn_id = t.id and s.target = 'customer'))
           or t.allocated_customer_id::text = p_customer
           or exists (select 1 from public.bank_txn_allocations s
                      where s.txn_id = t.id and s.target = 'customer'
                        and s.customer_id::text = p_customer))
      and (p_min is null or abs(t.amount_cents) >= p_min)
      and (p_max is null or abs(t.amount_cents) <= p_max)
  ),
  scoped as (
    select * from f
    where (p_account is null or p_account = 'all' or account_label = p_account)
  )
  select json_build_object(
    'total_count', (select count(*) from scoped),
    'money_in',    (select coalesce(sum(amount_cents) filter (where amount_cents > 0), 0) from scoped),
    'money_out',   (select coalesce(sum(amount_cents) filter (where amount_cents < 0), 0) from scoped),
    'net',         (select coalesce(sum(amount_cents), 0) from scoped),
    'min_date',    (select min(txn_date) from scoped),
    'max_date',    (select max(txn_date) from scoped),
    'accounts',    (
      select coalesce(json_agg(a order by a.label), '[]'::json)
      from (
        select account_label as label,
               count(*)       as n,
               coalesce(sum(amount_cents) filter (where amount_cents > 0), 0) as money_in,
               coalesce(sum(amount_cents) filter (where amount_cents < 0), 0) as money_out,
               coalesce(sum(amount_cents), 0)                                 as net
        from f
        group by account_label
      ) a
    ),
    'all_accounts', (
      select coalesce(json_agg(label order by label), '[]'::json)
      from (select distinct account_label as label from public.bank_transactions where account_label is not null) s
    )
  );
$$;
