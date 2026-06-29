-- ============================================================
-- Migration 073: add 'credit_note' to fin_documents.doc_type
-- ------------------------------------------------------------
-- A credit note is a supplier/customer document that reverses or reduces a
-- previous invoice. It needs its own document type so it isn't filed as a
-- plain invoice (which would overstate what's owed). Widen the existing check
-- constraint; this is additive, so all existing rows remain valid.
-- ============================================================

alter table public.fin_documents
  drop constraint if exists fin_documents_doc_type_check;

alter table public.fin_documents
  add constraint fin_documents_doc_type_check
  check (doc_type in (
    'supplier_invoice','receipt','sales_invoice','credit_note','bank_statement','other'
  ));
