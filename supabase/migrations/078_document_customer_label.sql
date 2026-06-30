-- ============================================================
-- Migration 078: one-off customer label on documents
-- ------------------------------------------------------------
-- A document can be assigned to a real customer (customer_id, which also lets
-- it show in that customer's portal when visible_to_customer is on), OR carry a
-- free-text customer label for once-off / random transactions that aren't a
-- tracked customer. customer_id and visible_to_customer already exist.
-- ============================================================

alter table public.fin_documents
  add column if not exists customer_label text;
