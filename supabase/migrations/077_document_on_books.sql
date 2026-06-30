-- ============================================================
-- Migration 077: per-document "on my books" classification
-- ------------------------------------------------------------
-- Some documents are kept for reference but belong to another company (e.g.
-- joint work invoiced to Solza) and must NOT count in Haberl's reconciliation.
-- Add a simple per-document flag plus a free-text owner label. Flexible: any
-- document can be flipped on/off the books at any time (e.g. when Haberl
-- actually paid an invoice for someone else).
--
--   on_books   true  = part of my recon (Haberl / Verdure / cash sales)  [default]
--              false = reference only, belongs to someone else, excluded
--   belongs_to free-text owner label shown when not on the books (e.g. 'Solza')
--
-- The customer_statement RPC is updated to exclude reference-only documents
-- (both their own allocations and the bank-side dedup that pointed at them).
-- ============================================================

alter table public.fin_documents
  add column if not exists on_books   boolean not null default true,
  add column if not exists belongs_to text;

create index if not exists fin_documents_on_books_idx on public.fin_documents (on_books);

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
      and not exists (select 1 from public.fin_allocations fa
                      join public.fin_documents fd on fd.id = fa.document_id
                      where fa.document_id = t.matched_document_id and fd.on_books)
  ),
  bank_debit as (
    select t.txn_date as d, coalesce(nullif(t.description,''),'Charge') as memo,
           -t.amount_cents as amt, 'bank'::text as src, t.account_label as ref,
           null::uuid as doc_id, t.id as txn_id
    from public.bank_transactions t
    where t.allocated_customer_id = p_customer_id and t.amount_cents < 0
      and not exists (select 1 from public.bank_txn_allocations s where s.txn_id = t.id)
      and not exists (select 1 from public.fin_allocations fa
                      join public.fin_documents fd on fd.id = fa.document_id
                      where fa.document_id = t.matched_document_id and fd.on_books)
  ),
  split_credit as (
    select t.txn_date as d, coalesce(nullif(t.description,''),'Payment') || ' (split)' as memo,
           a.amount_cents as amt, 'bank'::text as src, t.account_label as ref,
           null::uuid as doc_id, t.id as txn_id
    from public.bank_txn_allocations a
    join public.bank_transactions t on t.id = a.txn_id
    where a.target = 'customer' and a.customer_id = p_customer_id and t.amount_cents > 0
      and not exists (select 1 from public.fin_allocations fa
                      join public.fin_documents fd on fd.id = fa.document_id
                      where fa.document_id = t.matched_document_id and fd.on_books)
  ),
  split_debit as (
    select t.txn_date as d, coalesce(nullif(t.description,''),'Charge') || ' (split)' as memo,
           a.amount_cents as amt, 'bank'::text as src, t.account_label as ref,
           null::uuid as doc_id, t.id as txn_id
    from public.bank_txn_allocations a
    join public.bank_transactions t on t.id = a.txn_id
    where a.target = 'customer' and a.customer_id = p_customer_id and t.amount_cents < 0
      and not exists (select 1 from public.fin_allocations fa
                      join public.fin_documents fd on fd.id = fa.document_id
                      where fa.document_id = t.matched_document_id and fd.on_books)
  ),
  alloc as (
    select a.*, d.supplier_name, d.doc_number, d.doc_date, d.doc_type
    from public.fin_allocations a
    join public.fin_documents d on d.id = a.document_id
    where a.customer_id = p_customer_id and d.on_books
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
