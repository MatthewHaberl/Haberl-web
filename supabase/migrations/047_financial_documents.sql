-- ============================================================
-- Migration 047: financial documents, cost-recharge ledger, bank import
-- ------------------------------------------------------------
-- Foundation for the receipts/invoices reconciliation feature.
--
--   fin_documents     one row per uploaded file (receipt, supplier invoice,
--                     sales invoice, bank statement). Lives in the private
--                     'financial-docs' bucket.
--   fin_line_items    one row per parsed line on a document. This is where
--                     the recon happens: each line is allocated to the
--                     customer (recharged) or to the company (overhead),
--                     or split between the two.
--   bank_transactions imported bank-statement rows. Money-in allocated to a
--                     customer is a payment on their statement; money-out is
--                     matched back to a supplier document.
--
-- The customer statement is derived (a query), not stored:
--   charges  = line items allocated to a customer, at coalesce(recharge,cost)
--   payments = bank money-in allocated to that customer
--   balance  = charges - payments
--
-- Money is stored as integer cents (bigint), matching job_materials.
-- All three tables are manager/admin only — field workers do not see
-- company finances. Customer-facing visibility is gated per-row by
-- visible_to_customer and surfaced later via service-role share pages.
-- ============================================================

-- ── 0. shared updated_at trigger ──────────────────────────────
create or replace function public.fin_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── 1. fin_documents ──────────────────────────────────────────
create table if not exists public.fin_documents (
  id                  uuid primary key default gen_random_uuid(),
  doc_type            text not null default 'other'
    check (doc_type in ('supplier_invoice','receipt','sales_invoice','bank_statement','other')),
  supplier_name       text,
  doc_number          text,                       -- invoice / receipt number
  doc_date            date,
  currency            text not null default 'ZAR',
  total_cents         bigint,                     -- stated total on the doc (cross-check vs sum of lines)
  vat_cents           bigint,                     -- stated VAT, when known
  notes               text,
  customer_id         uuid references public.customers(id) on delete set null,  -- primary customer (whole-doc case)
  job_id              uuid references public.jobs(id) on delete set null,
  file_url            text not null,              -- object path in the financial-docs bucket
  file_name           text,
  mime_type           text,
  file_size           bigint,
  visible_to_customer boolean not null default false,
  ocr_status          text not null default 'none'
    check (ocr_status in ('none','pending','done','failed','manual')),
  ocr_raw             jsonb,                      -- raw extraction payload, kept for audit
  uploaded_by         uuid references public.user_profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists fin_documents_customer_idx on public.fin_documents (customer_id);
create index if not exists fin_documents_job_idx      on public.fin_documents (job_id);
create index if not exists fin_documents_type_idx     on public.fin_documents (doc_type);
create index if not exists fin_documents_date_idx     on public.fin_documents (doc_date);

drop trigger if exists fin_documents_touch on public.fin_documents;
create trigger fin_documents_touch before update on public.fin_documents
  for each row execute function public.fin_touch_updated_at();

-- ── 2. fin_line_items ─────────────────────────────────────────
create table if not exists public.fin_line_items (
  id                  uuid primary key default gen_random_uuid(),
  document_id         uuid not null references public.fin_documents(id) on delete cascade,
  line_no             integer,                    -- order on the source document
  description         text not null default '',
  qty                 numeric(12,3) not null default 1,
  unit_cost_cents     bigint not null default 0,  -- what was actually paid per unit
  line_total_cents    bigint not null default 0,  -- actual cost for the line
  vat_cents           bigint not null default 0,
  category            text,                       -- tool | consumable | component | fuel | refreshment | ...
  allocation          text not null default 'unallocated'
    check (allocation in ('unallocated','customer','company','split')),
  customer_id         uuid references public.customers(id) on delete set null,  -- who it is recharged to
  job_id              uuid references public.jobs(id) on delete set null,
  -- what goes on the customer statement. NULL with allocation='customer'
  -- means "recharge at cost" (= line_total_cents). With allocation='split'
  -- it holds the customer's portion explicitly.
  recharge_cents      bigint,
  visible_to_customer boolean not null default false,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists fin_line_items_document_idx   on public.fin_line_items (document_id);
create index if not exists fin_line_items_customer_idx   on public.fin_line_items (customer_id);
create index if not exists fin_line_items_allocation_idx on public.fin_line_items (allocation);
create index if not exists fin_line_items_job_idx        on public.fin_line_items (job_id);

drop trigger if exists fin_line_items_touch on public.fin_line_items;
create trigger fin_line_items_touch before update on public.fin_line_items
  for each row execute function public.fin_touch_updated_at();

-- ── 3. bank_transactions ──────────────────────────────────────
create table if not exists public.bank_transactions (
  id                    uuid primary key default gen_random_uuid(),
  statement_document_id uuid references public.fin_documents(id) on delete set null,  -- imported statement file
  account_label         text,                     -- 'FNB Cheque', 'FNB Credit Card', ...
  txn_date              date not null,
  description           text not null default '',
  reference             text,
  amount_cents          bigint not null,          -- signed: + money in, - money out
  balance_cents         bigint,                   -- running balance from the statement, if present
  external_id           text,                     -- bank's own id, used for de-dup on re-import
  allocated_customer_id uuid references public.customers(id) on delete set null,
  allocated_job_id      uuid references public.jobs(id) on delete set null,
  matched_document_id   uuid references public.fin_documents(id) on delete set null,  -- links money-out to a supplier doc
  txn_type              text not null default 'unallocated'
    check (txn_type in ('unallocated','customer_payment','supplier_payment','company_expense','transfer','other')),
  reconciled            boolean not null default false,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists bank_transactions_customer_idx  on public.bank_transactions (allocated_customer_id);
create index if not exists bank_transactions_date_idx       on public.bank_transactions (txn_date);
create index if not exists bank_transactions_statement_idx  on public.bank_transactions (statement_document_id);
-- de-dup guard for re-imports that carry a bank-supplied id
create unique index if not exists bank_transactions_external_id_key
  on public.bank_transactions (account_label, external_id)
  where external_id is not null;

drop trigger if exists bank_transactions_touch on public.bank_transactions;
create trigger bank_transactions_touch before update on public.bank_transactions
  for each row execute function public.fin_touch_updated_at();

-- ── 4. RLS: manager / admin only ──────────────────────────────
alter table public.fin_documents     enable row level security;
alter table public.fin_line_items    enable row level security;
alter table public.bank_transactions enable row level security;

create policy "Managers manage fin_documents"
  on public.fin_documents for all
  using (public.current_role() in ('manager','admin'))
  with check (public.current_role() in ('manager','admin'));

create policy "Managers manage fin_line_items"
  on public.fin_line_items for all
  using (public.current_role() in ('manager','admin'))
  with check (public.current_role() in ('manager','admin'));

create policy "Managers manage bank_transactions"
  on public.bank_transactions for all
  using (public.current_role() in ('manager','admin'))
  with check (public.current_role() in ('manager','admin'));

-- ── 5. financial-docs bucket: private. No storage policies — all
-- reads and writes go through the service role (uploads via route
-- handler, viewing via signed URLs), same pattern as payment-proofs.
-- 25 MB to allow multi-page PDF statements; images, PDF, CSV, Excel.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'financial-docs',
  'financial-docs',
  false,
  26214400,
  array[
    'image/jpeg','image/png','image/webp','image/heic',
    'application/pdf',
    'text/csv','application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;
