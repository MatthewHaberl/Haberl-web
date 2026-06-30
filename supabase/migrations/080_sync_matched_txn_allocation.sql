-- ============================================================
-- Migration 080: invoice allocation → mirror onto the matched bank transaction
-- ------------------------------------------------------------
-- When an invoice/receipt (fin_documents) is allocated to a customer (or to the
-- company) via fin_allocations, and that document is matched to a bank
-- transaction (bank_transactions.matched_document_id), the transaction should
-- inherit the same assignment — so a reconciled payment stops showing as
-- "unallocated" in the bank view. The invoice is the source of truth.
--
-- Rules (the invoice DRIVES its matched transaction; we only ever SET, never
-- auto-clear, so a manual choice is never silently wiped):
--   • exactly one customer on the invoice, no company part → set the
--     transaction's allocated_customer_id to that customer.
--   • company-only invoice → tag the transaction company_expense (clear customer).
--   • no allocation, or a multi-customer split → leave the transaction untouched
--     (a split can't be represented by a single allocated_customer_id).
--
-- Statement safety: customer_statement (migration 072) already suppresses the
-- bank side of any transaction whose matched document carries allocations, so
-- mirroring here never double-counts — it only fixes the bank-view label.
-- ============================================================

create or replace function public.fin_sync_matched_txn(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cust          uuid;
  v_cust_count    int;
  v_company_count int;
begin
  if p_document_id is null then return; end if;

  select count(distinct customer_id) filter (where target = 'customer'),
         count(*)                     filter (where target = 'company')
    into v_cust_count, v_company_count
  from public.fin_allocations
  where document_id = p_document_id;

  if v_cust_count = 1 and v_company_count = 0 then
    -- single customer → that customer owns the matched transaction(s)
    select distinct customer_id into v_cust
      from public.fin_allocations
     where document_id = p_document_id and target = 'customer';

    update public.bank_transactions t
       set allocated_customer_id = v_cust,
           -- only fill the classification when it's still blank; never override
           -- a deliberate one (transfer/other).
           txn_type = case
             when t.txn_type is null or t.txn_type = 'unallocated'
               then case when t.amount_cents >= 0 then 'customer_payment' else 'supplier_payment' end
             else t.txn_type
           end
     where t.matched_document_id = p_document_id
       and t.allocated_customer_id is distinct from v_cust;

  elsif v_company_count > 0 and v_cust_count = 0 then
    -- company-only → book the matched transaction(s) to company overhead
    update public.bank_transactions t
       set allocated_customer_id = null,
           txn_type = 'company_expense'
     where t.matched_document_id = p_document_id
       and (t.allocated_customer_id is not null or coalesce(t.txn_type, '') <> 'company_expense');
  end if;
  -- else: no allocations or an ambiguous multi-customer split → leave as-is.
end;
$$;

revoke execute on function public.fin_sync_matched_txn(uuid) from anon, authenticated, public;

-- Re-sync whenever a document's allocations change.
create or replace function public.fin_alloc_sync_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.fin_sync_matched_txn(old.document_id);
    return old;
  end if;
  perform public.fin_sync_matched_txn(new.document_id);
  if tg_op = 'UPDATE' and new.document_id is distinct from old.document_id then
    perform public.fin_sync_matched_txn(old.document_id);
  end if;
  return new;
end;
$$;

revoke execute on function public.fin_alloc_sync_trg() from anon, authenticated, public;

drop trigger if exists fin_allocations_sync_txn on public.fin_allocations;
create trigger fin_allocations_sync_txn
  after insert or update or delete on public.fin_allocations
  for each row execute function public.fin_alloc_sync_trg();

-- Re-sync when a transaction is (re)matched to a document. Fires only on the
-- matched_document_id column, and the sync writes allocated_customer_id/txn_type
-- (not matched_document_id), so there is no recursion.
create or replace function public.bank_txn_match_sync_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.matched_document_id is not null then
    perform public.fin_sync_matched_txn(new.matched_document_id);
  end if;
  return new;
end;
$$;

revoke execute on function public.bank_txn_match_sync_trg() from anon, authenticated, public;

drop trigger if exists bank_txn_match_sync on public.bank_transactions;
create trigger bank_txn_match_sync
  after update of matched_document_id on public.bank_transactions
  for each row execute function public.bank_txn_match_sync_trg();

-- Backfill: apply the rule to every currently-matched document.
do $$
declare r record;
begin
  for r in
    select distinct matched_document_id as doc
    from public.bank_transactions
    where matched_document_id is not null
  loop
    perform public.fin_sync_matched_txn(r.doc);
  end loop;
end $$;
