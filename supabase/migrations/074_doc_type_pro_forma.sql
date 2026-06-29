-- ============================================================
-- Migration 074: add 'pro_forma' to fin_documents.doc_type
-- ------------------------------------------------------------
-- A pro forma is a preliminary bill that usually precedes the final invoice
-- for the same goods. Labelling it distinctly lets the duplicate detector call
-- out "pro forma vs invoice" and helps avoid billing a customer twice. Widen
-- the check constraint; additive, so existing rows stay valid.
-- ============================================================

alter table public.fin_documents
  drop constraint if exists fin_documents_doc_type_check;

alter table public.fin_documents
  add constraint fin_documents_doc_type_check
  check (doc_type in (
    'supplier_invoice','receipt','sales_invoice','pro_forma','credit_note','bank_statement','other'
  ));
