-- ============================================================
-- Migration 065: customer financial statement (derived)
-- ------------------------------------------------------------
-- Powers the per-customer statement on their profile. The statement is
-- NOT stored — it is derived from allocations made on bank transactions
-- and invoice line items:
--
--   payments = bank money IN allocated to the customer
--   charges  = bank money OUT allocated to the customer
--            + invoice line items allocated to the customer
--              (at recharge_cents when set, else the line cost)
--   balance  = total_charged - total_paid   (positive = customer owes)
--
-- SECURITY INVOKER so the caller's manager/admin RLS still applies.
-- ============================================================

create or replace function public.customer_statement(p_customer_id uuid)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  with pay as (
    select t.txn_date as d,
           coalesce(nullif(t.description, ''), 'Payment') as memo,
           t.amount_cents as amt,
           'bank'::text as src,
           t.account_label as ref,
           t.id as txn_id
    from public.bank_transactions t
    where t.allocated_customer_id = p_customer_id and t.amount_cents > 0
  ),
  bank_charge as (
    select t.txn_date as d,
           coalesce(nullif(t.description, ''), 'Charge') as memo,
           -t.amount_cents as amt,
           'bank'::text as src,
           t.account_label as ref,
           t.id as txn_id
    from public.bank_transactions t
    where t.allocated_customer_id = p_customer_id and t.amount_cents < 0
  ),
  line_charge as (
    select coalesce(d.doc_date, d.created_at::date) as d,
           coalesce(nullif(li.description, ''), d.supplier_name, 'Invoice line') as memo,
           coalesce(li.recharge_cents, li.line_total_cents) as amt,
           'invoice'::text as src,
           coalesce(d.supplier_name, d.doc_number, 'Invoice') as ref,
           li.id as txn_id
    from public.fin_line_items li
    join public.fin_documents d on d.id = li.document_id
    where li.customer_id = p_customer_id and li.allocation = 'customer'
  ),
  charges as (
    select * from bank_charge
    union all
    select * from line_charge
  )
  select json_build_object(
    'payments',      (select coalesce(json_agg(p order by p.d, p.memo), '[]'::json) from pay p),
    'charges',       (select coalesce(json_agg(c order by c.d, c.memo), '[]'::json) from charges c),
    'total_paid',    (select coalesce(sum(amt), 0) from pay),
    'total_charged', (select coalesce(sum(amt), 0) from charges),
    'payment_count', (select count(*) from pay),
    'charge_count',  (select count(*) from charges)
  );
$$;