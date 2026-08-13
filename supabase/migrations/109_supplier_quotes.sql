-- ── Supplier quotes attached to a customer quote (W98) ─────────────────────────
--
-- "Key quote" workflow: upload the supplier's quote PDF against a quote_request,
-- parse it into line items (AI route, with manual entry as the fallback), then
-- pull those lines into the builder sections — scope lines or design.quotedItems —
-- at the quoted price instead of the catalog price.
--
-- Distinct from supplier_pricelists (out-of-band 20260709230600): a price list is
-- a whole-catalog snapshot feeding equipment_supplier_offers; a supplier quote is
-- a one-off, project-specific document whose prices apply to ONE customer quote.
--
-- Pricing convention (locked): lines store the supplier's EX-VAT unit price;
-- landed cost = unit_price_r × 1.15 (unrecoverable VAT) is applied where the line
-- is consumed, same as the offer layer. Sell = landed × markup.

-- 1. Header — one row per uploaded supplier quote document -----------------------
create table if not exists public.supplier_quotes (
  id               uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references public.quote_requests(id) on delete cascade,
  supplier         text not null default '',
  -- Supplier's own quote number, e.g. "Q-48213".
  reference        text,
  quote_date       date,
  source_filename  text,
  -- Object path in the private supplier-quotes bucket. Null for a manual
  -- (typed-in) supplier quote with no document behind it.
  storage_path     text,
  mime_type        text,
  status           text not null default 'uploaded'
                     check (status in ('uploaded', 'parsing', 'parsed', 'failed', 'manual')),
  parse_error      text,
  line_count       integer not null default 0,
  notes            text,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);
comment on table public.supplier_quotes is
  'A supplier''s quote (e.g. Key Electric) uploaded against one quote_request. Lines live in supplier_quote_lines; the original document sits in the private supplier-quotes bucket.';
comment on column public.supplier_quotes.status is
  'uploaded = file stored, not yet parsed. parsing = AI extraction in flight. parsed = lines extracted. failed = extraction failed (add/fix lines manually). manual = typed in with no parse.';

create index if not exists supplier_quotes_request_idx
  on public.supplier_quotes (quote_request_id, created_at desc);

-- 2. Lines — one row per quoted product line -------------------------------------
create table if not exists public.supplier_quote_lines (
  id                uuid primary key default gen_random_uuid(),
  supplier_quote_id uuid not null references public.supplier_quotes(id) on delete cascade,
  line_no           integer not null default 0,
  sku               text not null default '',
  description       text not null default '',
  qty               numeric not null default 1 check (qty >= 0),
  unit              text not null default 'ea',
  -- Supplier EX-VAT unit price (rands). Landed cost = × 1.15 at point of use.
  unit_price_r      numeric(14,4) not null default 0 check (unit_price_r >= 0),
  -- Auto-matched catalog item (by SKU) — informational; the quoted price stays
  -- authoritative for this quote regardless of the catalog cost.
  catalog_id        uuid references public.equipment_catalog(id) on delete set null,
  created_at        timestamptz not null default now()
);
comment on table public.supplier_quote_lines is
  'One row per line on a supplier quote. unit_price_r is the supplier''s ex-VAT price; the ×1.15 unrecoverable-VAT landed cost is applied where the line is pulled into a builder section.';

create index if not exists supplier_quote_lines_quote_idx
  on public.supplier_quote_lines (supplier_quote_id, line_no);
create index if not exists supplier_quote_lines_catalog_idx
  on public.supplier_quote_lines (catalog_id) where catalog_id is not null;

-- 3. RLS — supplier buy prices are staff data (repo 098 posture): reads for staff
-- only, never `auth.uid() is not null`. Writes manager/admin (uploads run through
-- the service role in the API routes; client-side line edits are manager/admin).
alter table public.supplier_quotes enable row level security;
alter table public.supplier_quote_lines enable row level security;

drop policy if exists "Staff read supplier quotes" on public.supplier_quotes;
create policy "Staff read supplier quotes"
  on public.supplier_quotes for select
  using (public.current_role() in ('field_worker', 'manager', 'admin'));
drop policy if exists "Managers manage supplier quotes" on public.supplier_quotes;
create policy "Managers manage supplier quotes"
  on public.supplier_quotes for all
  using (public.current_role() in ('manager', 'admin'))
  with check (public.current_role() in ('manager', 'admin'));

drop policy if exists "Staff read supplier quote lines" on public.supplier_quote_lines;
create policy "Staff read supplier quote lines"
  on public.supplier_quote_lines for select
  using (public.current_role() in ('field_worker', 'manager', 'admin'));
drop policy if exists "Managers manage supplier quote lines" on public.supplier_quote_lines;
create policy "Managers manage supplier quote lines"
  on public.supplier_quote_lines for all
  using (public.current_role() in ('manager', 'admin'))
  with check (public.current_role() in ('manager', 'admin'));

-- 4. supplier-quotes bucket: private. No storage policies — all reads and writes
-- go through the service role (uploads via route handler, viewing via signed
-- URLs), same pattern as financial-docs. PDFs plus photos of paper quotes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'supplier-quotes',
  'supplier-quotes',
  false,
  26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;
