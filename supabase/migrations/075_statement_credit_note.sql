-- ============================================================
-- Migration 075: credit notes count as credits on the statement
-- ------------------------------------------------------------
-- The customer_statement classified invoice allocations purely by the
-- allocation's direction (charge → owed to us, reimburse → in their favour),
-- ignoring the document type. A credit note (negative total) therefore showed
-- up in "Charged to them" as a confusing negative line.
--
-- Now the statement is doc_type-aware: an allocation on a credit_note document
-- always counts as a credit (in the customer's favour), with the amount negated
-- so a negative-total credit note reduces the balance as a positive credit.
-- Other document types are unchanged (still driven by charge/reimburse). Since
-- the RPC reads doc_type at query time, re-typing a document updates the
-- statement immediately.
--
-- Only the alloc CTEs + credits/debits classification change; the bank-side
-- dedup logic from migration 072 is preserved verbatim.
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
    select a.*, d.supplier_name, d.doc_number, d.doc_date, d.doc_type
    from public.fin_allocations a
    join public.fin_documents d on d.id = a.document_id
    where a.customer_id = p_customer_id
  ),
  alloc_items as (
    select a.direction, a.doc_type, coalesce(li.line_total_cents,0) as amt,
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
    select a.direction, a.doc_type, a.amount_cents as amt,
           coalesce(nullif(a.note,''),
             (case when a.doc_type = 'credit_note' then 'Credit note'
                   when a.basis = 'whole' then 'Whole invoice'
                   when a.basis = 'percent' then a.percent::text || '% of invoice'
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
    union all select d, memo, amt, src, ref, doc_id, txn_id from alloc_all
      where doc_type <> 'credit_note' and direction = 'reimburse'
    -- a credit note reduces what the customer owes: always in their favour,
    -- amount negated so a negative-total credit note becomes a positive credit
    union all select d, memo, -amt as amt, src, ref, doc_id, txn_id from alloc_all
      where doc_type = 'credit_note'
  ),
  debits as (
    select d, memo, amt, src, ref, doc_id, txn_id from bank_debit
    union all select d, memo, amt, src, ref, doc_id, txn_id from split_debit
    union all select d, memo, amt, src, ref, doc_id, txn_id from alloc_all
      where doc_type <> 'credit_note' and direction = 'charge'
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
