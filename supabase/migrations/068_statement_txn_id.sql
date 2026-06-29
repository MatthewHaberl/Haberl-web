-- ============================================================
-- Migration 068: expose the source bank-transaction id on the statement
-- ------------------------------------------------------------
-- Same statement shape as 066, with one addition: every bank-sourced
-- credit/debit row now carries `txn_id` (the bank_transactions.id), so the
-- statement UI can deep-link a payment/charge straight to the Bank
-- Statements page, focused on that exact transaction. Invoice-sourced rows
-- carry txn_id = null (they already link via doc_id).
--
-- Pure additive change to the returned JSON; nothing else moves.
-- ============================================================

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
           t.amount_cents as amt, 'bank'::text as src, t.account_label as ref,
           null::uuid as doc_id, t.id as txn_id
    from public.bank_transactions t
    where t.allocated_customer_id = p_customer_id and t.amount_cents > 0
  ),
  bank_debit as (   -- money OUT allocated to them — they owe us
    select t.txn_date as d, coalesce(nullif(t.description,''),'Charge') as memo,
           -t.amount_cents as amt, 'bank'::text as src, t.account_label as ref,
           null::uuid as doc_id, t.id as txn_id
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
  credits as (  -- in their favour: their payments + what we owe them (reimburse)
    select d, memo, amt, src, ref, doc_id, txn_id from bank_credit
    union all
    select d, memo, amt, src, ref, doc_id, txn_id from alloc_all where direction = 'reimburse'
  ),
  debits as (   -- owed to us: bank money spent on them + charges
    select d, memo, amt, src, ref, doc_id, txn_id from bank_debit
    union all
    select d, memo, amt, src, ref, doc_id, txn_id from alloc_all where direction = 'charge'
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
