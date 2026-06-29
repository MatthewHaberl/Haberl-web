-- ============================================================
-- Migration 067: document status + company (Haberl) allocations
-- ------------------------------------------------------------
--  * fin_documents.status — open / unsure / discarded, so an invoice can be
--    flagged when we're not sure it was paid, or set aside without deleting.
--  * fin_allocations gains a 'company' target (allocate to Haberl with a
--    category) alongside the existing per-customer charge/reimburse. To allow
--    that, customer_id and direction become optional and are required only
--    when the allocation targets a customer.
--
-- Bank reconciliation reuses the existing bank_transactions.matched_document_id
-- column — no schema change needed there.
-- ============================================================

alter table public.fin_documents
  add column if not exists status text not null default 'open'
    check (status in ('open', 'unsure', 'discarded'));

create index if not exists fin_documents_status_idx on public.fin_documents (status);

-- allocations: allow company-targeted entries
alter table public.fin_allocations alter column customer_id drop not null;
alter table public.fin_allocations alter column direction  drop not null;
alter table public.fin_allocations add column if not exists target   text not null default 'customer';
alter table public.fin_allocations add column if not exists category text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fin_alloc_target_chk') then
    alter table public.fin_allocations add constraint fin_alloc_target_chk
      check (target in ('customer', 'company'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fin_alloc_shape_chk') then
    alter table public.fin_allocations add constraint fin_alloc_shape_chk
      check (
        (target = 'customer' and customer_id is not null and direction in ('charge','reimburse'))
        or (target = 'company')
      );
  end if;
end $$;
