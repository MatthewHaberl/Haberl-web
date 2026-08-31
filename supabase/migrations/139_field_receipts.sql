-- ============================================================
-- Migration 139: field receipts
-- ------------------------------------------------------------
-- Technicians photograph the slips they collect during the day
-- (hardware shop, fuel, consumables) straight from their phone.
--
-- A field receipt is NOT a new table: it is an ordinary
-- fin_documents row with doc_type = 'receipt', so it drops into
-- the existing finance pipeline — allocation, line items, bank
-- matching — with nothing extra to build on the finance side.
--
-- Two things are new:
--   1. paid_by   — whose money left the till. The one fact the
--                  office cannot recover from the photo, and the
--                  one that decides whether somebody is owed
--                  money back.
--   2. RLS       — a field worker may add a receipt and see the
--                  receipts they added, and nothing else in
--                  fin_documents. Company finances stay closed.
-- ============================================================

-- ── 1. paid_by ────────────────────────────────────────────────
alter table public.fin_documents
  add column if not exists paid_by text not null default 'unknown';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.fin_documents'::regclass
      and conname = 'fin_documents_paid_by_check'
  ) then
    alter table public.fin_documents
      add constraint fin_documents_paid_by_check
      check (paid_by in ('company_card','company_cash','own_money','unknown'));
  end if;
end $$;

-- "my receipts, newest first" is the field worker's whole page.
create index if not exists fin_documents_uploader_idx
  on public.fin_documents (uploaded_by, created_at desc);

-- ── 2. RLS: a field worker's own receipts, and only those ─────
-- The existing "Managers manage fin_documents" policy is FOR ALL;
-- RLS policies are OR'd, so these only ever widen access for the
-- field_worker role and leave manager/admin behaviour untouched.

drop policy if exists "Field workers add their own receipts" on public.fin_documents;
create policy "Field workers add their own receipts"
  on public.fin_documents for insert
  with check (
    public.current_role() = 'field_worker'
    and doc_type = 'receipt'
    and uploaded_by = auth.uid()
  );

drop policy if exists "Field workers read their own receipts" on public.fin_documents;
create policy "Field workers read their own receipts"
  on public.fin_documents for select
  using (
    public.current_role() = 'field_worker'
    and uploaded_by = auth.uid()
  );

-- A blurred photo has to be deletable by the person who took it —
-- but only until the office has allocated it, after which it is
-- part of the books and the manager owns it.
drop policy if exists "Field workers delete their own unfiled receipts" on public.fin_documents;
create policy "Field workers delete their own unfiled receipts"
  on public.fin_documents for delete
  using (
    public.current_role() = 'field_worker'
    and uploaded_by = auth.uid()
    and doc_type = 'receipt'
    and not exists (
      select 1 from public.fin_allocations a where a.document_id = fin_documents.id
    )
  );

-- ── 3. Seed the new section in the permissions matrix ─────────
-- role_permissions is already seeded, so getUserAccess() reads it
-- verbatim: a section with no row here is invisible to that role.
-- Admin is hard-coded all-on and needs no row.
insert into public.role_permissions (role, section, allowed) values
  ('field_worker', 'receipts', true),
  ('manager',      'receipts', true)
on conflict (role, section) do nothing;
