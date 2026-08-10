-- Applied to production 2026-07-09 (version 20260709230600) outside the repo.
-- Recovered from supabase_migrations.schema_migrations. See _out_of_band/README.md.
-- Was authored as "091_supplier_pricelists.sql" — that number is taken in the repo
-- by a different migration, hence the timestamp-based filename here.
--
-- ⚠️ SECURITY NOTE (not fixed here — recorded as applied): the read policies below
-- grant SELECT to ANY authenticated user (`auth.uid() is not null`), which includes
-- customer logins. supplier_pricelist_lines holds list_price, discount_pct and the
-- generated net_price — i.e. supplier buy prices and our account discount. This is
-- the same over-broad pattern already flagged on equipment_catalog and
-- equipment_supplier_offers. Consider narrowing to
-- current_role() in ('field_worker','manager','admin').

-- Weekly supplier price-list imports (first: Key Electric, account HAB001).
--
-- Layer 1 of the two-layer sourcing model: every uploaded price list becomes an
-- immutable snapshot (one batch row + one line row per SKU), diffable week to
-- week (new / price changed / discount changed / removed). The curated quoting
-- layer stays equipment_catalog + equipment_supplier_offers (051/052); lines are
-- linked to catalog items as they match or get promoted, and the offers gain
-- staleness tracking so a SKU that drops off the list stops being quoted at a
-- dead price.
--
-- SAFETY: additive only. New tables + three nullable/defaulted columns on
-- equipment_supplier_offers. No existing behavior changes until scripts write.

-- 1. Import batches ------------------------------------------------------------
create table if not exists public.supplier_pricelists (
  id              uuid primary key default gen_random_uuid(),
  supplier        text not null,
  account_no      text,
  pricelist_name  text,
  list_date       date,
  source_filename text,
  line_count      integer not null default 0,
  status          text not null default 'staged'
                    check (status in ('staged', 'applied', 'discarded')),
  applied_at      timestamptz,
  notes           text,
  created_at      timestamptz not null default now()
);
comment on table public.supplier_pricelists is
  'One row per uploaded supplier price-list file (e.g. the weekly Key Electric customer pricelist). Immutable snapshot header; lines live in supplier_pricelist_lines.';
comment on column public.supplier_pricelists.status is
  'staged = parsed + loaded, not yet pushed to offers. applied = prices pushed to equipment_supplier_offers. discarded = rejected upload kept for audit.';

create index if not exists supplier_pricelists_supplier_idx
  on public.supplier_pricelists (supplier, list_date desc);

-- 2. Price-list lines -----------------------------------------------------------
create table if not exists public.supplier_pricelist_lines (
  id            uuid primary key default gen_random_uuid(),
  pricelist_id  uuid not null references public.supplier_pricelists(id) on delete cascade,
  sku           text not null,
  description   text not null,
  buyout        boolean not null default false,
  list_price    numeric(14,4) not null check (list_price >= 0),
  discount_pct  numeric(6,2) not null default 0 check (discount_pct >= 0 and discount_pct <= 100),
  net_price     numeric(14,4) generated always as
                  (round(list_price * (1 - discount_pct / 100.0), 4)) stored,
  unit_raw      text,
  unit_norm     text,
  qty_per_unit  numeric,
  match_status  text not null default 'unmatched'
                  check (match_status in ('unmatched', 'matched', 'promoted', 'uncategorized', 'ignored')),
  catalog_id    uuid references public.equipment_catalog(id) on delete set null,
  unique (pricelist_id, sku)
);
comment on table public.supplier_pricelist_lines is
  'One row per product line per imported price list. list_price = supplier ex-VAT list; discount_pct = our account discount; net_price = generated ex-VAT buy price. Landed cost basis = net_price x 1.15 (unrecoverable VAT) is applied at offer level, not stored here.';
comment on column public.supplier_pricelist_lines.buyout is
  'True when the supplier flags the line as a buyout (** prefix on Key lists) — not stocked, bought out on demand. Lead-time caution on BOMs/POs.';
comment on column public.supplier_pricelist_lines.unit_norm is
  'Normalised unit of sell: each | metre | pack | coil | other. qty_per_unit carries the pack/length multiple when the raw unit encodes one (e.g. P/5m -> metre x 5).';
comment on column public.supplier_pricelist_lines.match_status is
  'unmatched = not yet processed. matched = linked to an existing catalog item (offer updated). promoted = a new catalog item was created from this line. uncategorized = no category confidently assigned; stays in this layer, never website-enabled. ignored = deliberately skipped (e.g. out-of-scope category).';

create index if not exists supplier_pricelist_lines_sku_idx
  on public.supplier_pricelist_lines (sku);
create index if not exists supplier_pricelist_lines_batch_idx
  on public.supplier_pricelist_lines (pricelist_id, match_status);
create index if not exists supplier_pricelist_lines_catalog_idx
  on public.supplier_pricelist_lines (catalog_id) where catalog_id is not null;

-- 3. Offer staleness + account discount ------------------------------------------
alter table public.equipment_supplier_offers
  add column if not exists discount_pct numeric(6,2),
  add column if not exists last_seen_at timestamptz,
  add column if not exists stale        boolean not null default false;

comment on column public.equipment_supplier_offers.discount_pct is
  'Account discount off the supplier ex-VAT list that produced cost_rands (cost = list x (1 - discount) x 1.15). NULL for offers created before price-list imports.';
comment on column public.equipment_supplier_offers.last_seen_at is
  'When this offer''s SKU was last present on an imported supplier price list. NULL for offers never touched by a price-list import.';
comment on column public.equipment_supplier_offers.stale is
  'True when the SKU disappeared from the supplier''s latest price list — price can no longer be trusted; surfaced for review, excluded from confident costing.';

-- 4. RLS — mirror equipment_supplier_offers (read: authenticated; write: admin) ---
alter table public.supplier_pricelists enable row level security;
alter table public.supplier_pricelist_lines enable row level security;

drop policy if exists "Authenticated can read pricelists" on public.supplier_pricelists;
create policy "Authenticated can read pricelists"
  on public.supplier_pricelists for select using (auth.uid() is not null);
drop policy if exists "Admin can manage pricelists" on public.supplier_pricelists;
create policy "Admin can manage pricelists"
  on public.supplier_pricelists for all
  using ("current_role"() = 'admin'::user_role)
  with check ("current_role"() = 'admin'::user_role);

drop policy if exists "Authenticated can read pricelist lines" on public.supplier_pricelist_lines;
create policy "Authenticated can read pricelist lines"
  on public.supplier_pricelist_lines for select using (auth.uid() is not null);
drop policy if exists "Admin can manage pricelist lines" on public.supplier_pricelist_lines;
create policy "Admin can manage pricelist lines"
  on public.supplier_pricelist_lines for all
  using ("current_role"() = 'admin'::user_role)
  with check ("current_role"() = 'admin'::user_role);
