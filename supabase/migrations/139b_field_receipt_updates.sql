-- ============================================================
-- Migration 139b: let a field worker correct their own receipt
-- ------------------------------------------------------------
-- 139 gave field workers insert/select/delete on their own
-- receipts but no update, which left no way to add the amount
-- after a batch upload or fix a mistyped shop name.
--
-- The `with check` half repeats the ownership and doc_type
-- predicates on purpose: without it an update could rewrite
-- uploaded_by or doc_type and walk the row out of the fence.
-- Editing stops once the office has allocated the receipt —
-- from then on it is part of the books.
-- ============================================================

drop policy if exists "Field workers fix their own unfiled receipts" on public.fin_documents;
create policy "Field workers fix their own unfiled receipts"
  on public.fin_documents for update
  using (
    public.current_role() = 'field_worker'
    and uploaded_by = auth.uid()
    and doc_type = 'receipt'
    and not exists (
      select 1 from public.fin_allocations a where a.document_id = fin_documents.id
    )
  )
  with check (
    public.current_role() = 'field_worker'
    and uploaded_by = auth.uid()
    and doc_type = 'receipt'
  );
