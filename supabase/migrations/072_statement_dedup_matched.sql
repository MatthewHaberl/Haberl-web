-- ============================================================
-- Migration 072: statement dedup across bank ↔ invoice sources
-- ------------------------------------------------------------
-- An expense can be allocated on TWO surfaces: the invoice (fin_allocations)
-- and its bank payment (allocated_customer_id / bank_txn_allocations). If both
-- are allocated, the customer statement would count it twice.
--
-- Rule: when a bank transaction is matched to a document (matched_document_id,
-- set by "Find in bank statement") AND that document carries invoice
-- allocations, the invoice is the source of truth — so we SUPPRESS the bank
-- side for that transaction (both whole-txn and split allocations). Bank
-- transactions with no matched invoice (or whose matched invoice has no
-- allocations) still count as before.
--
-- Only the four bank CTEs change; invoice allocations are untouched.
-- ============================================================

create or replace function public.customer_statement(p_customer_id uuid)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  with
  bank_credit as (
    select t.txn_date as d, coalesce(nullif(t.description,''),'Payment') as memo,
           t.amount_cents as amt, 'bank'::text as src, t.account_label as ref,
           null::uuid as doc_id, t.id as txn_id
    from public.bank_transactions t
    where t.allocated_customer_id = p_customer_id and t.amount_cents > 0
      and not exists (select 1 from public.bank_txn_allocations s where s.txn_id = t.id)
      and not exists (select 1 from public.fin_allocations fa where fa.document_id = t.matched_document_id)
  ),
  bank_debit as (
    select t.txn_date as d, coalesce(nullif(t.description,''),'Charge') as memo,
           -t.amount_cents as amt, 'bank'::text as src, t.account_label as ref,
           null::uuid as doc_id, t.id as txn_id
    from public.bank_transactions t
    where t.allocated_customer_id = p_customer_id and t.amount_cents < 0
      and not exists (select 1 from public.bank_txn_allocations s where s.txn_id = t.id)
      and not exists (select 1 from public.fin_allocations fa where fa.document_id = t.matched_document_id)
  ),
  split_credit as (
    select t.txn_date as d, coalesce(nullif(t.description,''),'Payment') || ' (split)' as memo,
           a.amount_cents as amt, 'bank'::text as src, t.account_label as ref,
           null::uuid as doc_id, t.id as txn_id
    from public.bank_txn_allocations a
    join public.bank_transactions t on t.id = a.txn_id
    where a.target = 'customer' and a.customer_id = p_customer_id and t.amount_cents > 0
      and not exists (select 1 from public.fin_allocations fa where fa.document_id = t.matched_document_id)
  ),
  split_debit as (
    select t.txn_date as d, coalesce(nullif(t.description,''),'Charge') || ' (split)' as memo,
           a.amount_cents as amt, 'bank'::text as src, t.account_label as ref,
           null::uuid as doc_id, t.id as txn_id
    from public.bank_txn_allocations a
    join public.bank_transactions t on t.id = a.txn_id
    where a.target = 'customer' and a.customer_id = p_customer_id and t.amount_cents < 0
      and not exists (select 1 from public.fin_allocations fa where fa.document_id = t.matched_document_id)
  ),
  alloc as (
    select a.*, d.supplier_name, d.doc_number, d.doc_date
    from public.fin_allocations a
    join public.fin_documents d on d.id = a.document_id
    where a.customer_id = p_customer_id
  ),
  alloc_items as (
    select a.direction, coalesce(li.line_total_cents,0) as amt,
           coalesce(nullif(li.description,''),'Line item') as memo,
           coalesce(a.doc_date, a.created_at::date) as d, 'invoice'::text as src,
           coalesce(a.supplier_name, a.doc_number, 'Invoice') as ref,
           a.document_id as doc_id, null::uuid as txn_id
    from alloc a
    join lateral unnest(a.line_item_ids) as lid(id) on true
    join public.fin_line_items li on li.id = lid.id
    where a.basis = 'items'
  ),
  alloc_single as (
    select a.direction, a.amount_cents as amt,
           coalesce(nullif(a.note,''),
             (case a.basis when 'whole' then 'Whole invoice'
                           when 'percent' then a.percent::text || '% of invoice'
                           else 'Invoice amount' end)
             || coalesce(' — ' || a.supplier_name, '')) as memo,
           coalesce(a.doc_date, a.created_at::date) as d, 'invoice'::text as src,
           coalesce(a.supplier_name, a.doc_number, 'Invoice') as ref,
           a.document_id as doc_id, null::uuid as txn_id
    from alloc a where a.basis <> 'items'
  ),
  alloc_all as (select * from alloc_items union all select * from alloc_single),
  credits as (
    select d, memo, amt, src, ref, doc_id, txn_id from bank_credit
    union all select d, memo, amt, src, ref, doc_id, txn_id from split_credit
    union all select d, memo, amt, src, ref, doc_id, txn_id from alloc_all where direction = 'reimburse'
  ),
  debits as (
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
