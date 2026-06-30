-- ============================================================
-- Migration 076: add 'supplier_statement' to fin_documents.doc_type
-- ------------------------------------------------------------
-- A supplier statement is a periodic summary of what we owe a supplier (a
-- reference document, distinct from an individual invoice). Add it as its own
-- type. Additive constraint widening, so existing rows stay valid.
-- ============================================================

alter table public.fin_documents
  drop constraint if exists fin_documents_doc_type_check;

alter table public.fin_documents
  add constraint fin_documents_doc_type_check
  check (doc_type in (
    'supplier_invoice','receipt','sales_invoice','pro_forma','credit_note',
    'supplier_statement','bank_statement','other'
  ));
