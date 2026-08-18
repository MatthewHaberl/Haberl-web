-- ── RFQs: the outbound half of the supplier-quote loop (W99) ───────────────────
--
-- 109 gave us the INBOUND half — upload Key's quote, parse it, pull the lines in
-- at the quoted price. This is the half before it: build the list of what we need
-- priced, off the quote's own BOM, and send it to the supplier.
--
-- Two cases it exists for:
--   1. An item on the design with no price and often no part number at all
--      ("M8 stainless nuts and bolts") — it has to be described, not ordered.
--   2. Catalog costs that came off an old price-list import and may have moved
--      since — the whole material list goes back for confirmation before the
--      customer quote is finalised.
--
-- Lines are DESCRIPTIVE, not priced: an RFQ asks, a purchase order (030) tells.
-- Nothing here carries money. The reply comes back as a supplier_quote, which
-- now points at the RFQ it answers (supplier_quotes.rfq_id below).

-- 1. Header — one row per request sent to one supplier -------------------------
create table if not exists public.supplier_rfqs (
  id               uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references public.quote_requests(id) on delete cascade,
  supplier_id      uuid references public.suppliers(id) on delete set null,
  -- Denormalised so a deleted supplier row doesn't erase who we asked.
  supplier_name    text not null default '',
  rfq_number       text not null default '',
  status           text not null default 'draft'
                     check (status in ('draft', 'sent', 'quoted', 'cancelled')),
  -- Free-text note typed above the table ("these are for the Kyalami job…").
  message          text,
  sent_at          timestamptz,
  -- Addresses actually emailed, for the audit trail. Empty for copy/WhatsApp.
  sent_to          text[] not null default '{}',
  -- How it left: email | copy | whatsapp. Null while still a draft.
  sent_via         text check (sent_via in ('email', 'copy', 'whatsapp')),
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);
comment on table public.supplier_rfqs is
  'A request for quotation built off one quote_request''s BOM and sent to one supplier. Lines live in supplier_rfq_lines. The reply arrives as a supplier_quotes row carrying this id in rfq_id.';
comment on column public.supplier_rfqs.sent_via is
  'email = sent by the app through Resend. copy = the text was copied out and sent by hand. whatsapp = handed to the WhatsApp share link. Null while draft.';

create index if not exists supplier_rfqs_request_idx
  on public.supplier_rfqs (quote_request_id, created_at desc);

-- 2. Lines — what we want priced ------------------------------------------------
create table if not exists public.supplier_rfq_lines (
  id           uuid primary key default gen_random_uuid(),
  rfq_id       uuid not null references public.supplier_rfqs(id) on delete cascade,
  line_no      integer not null default 0,
  -- BOM section the line came from ("Earthing", "Batteries"), or '' for a row
  -- typed straight into the RFQ. Groups the printed table.
  section      text not null default '',
  sku          text not null default '',
  description  text not null default '',
  qty          numeric not null default 1 check (qty >= 0),
  unit         text not null default 'ea',
  catalog_id   uuid references public.equipment_catalog(id) on delete set null,
  -- True when we have no part number for it — these print under their own
  -- heading asking the supplier to advise the code, not just the price.
  needs_code   boolean not null default false,
  -- Per-line note to the supplier ("M8 x 40, stainless, with washers").
  note         text,
  created_at   timestamptz not null default now()
);
comment on table public.supplier_rfq_lines is
  'One row per item we are asking a supplier to price. No prices by design — an RFQ asks, a purchase_order tells.';
comment on column public.supplier_rfq_lines.needs_code is
  'No part number known. Prints under the "we don''t have a code for these" heading so the supplier knows to supply one.';

create index if not exists supplier_rfq_lines_rfq_idx
  on public.supplier_rfq_lines (rfq_id, line_no);

-- 3. Close the loop: which RFQ a returned supplier quote answers -----------------
alter table public.supplier_quotes
  add column if not exists rfq_id uuid references public.supplier_rfqs(id) on delete set null;
comment on column public.supplier_quotes.rfq_id is
  'The RFQ this quote came back against, when it was sent from here (W99). Null for a quote that arrived unprompted.';

create index if not exists supplier_quotes_rfq_idx
  on public.supplier_quotes (rfq_id) where rfq_id is not null;

-- 4. RLS — same posture as supplier_quotes (109): an RFQ names what we buy and
-- from whom, so reads are staff-only, never `auth.uid() is not null`.
alter table public.supplier_rfqs enable row level security;
alter table public.supplier_rfq_lines enable row level security;

drop policy if exists "Staff read supplier rfqs" on public.supplier_rfqs;
create policy "Staff read supplier rfqs"
  on public.supplier_rfqs for select
  using (public.current_role() in ('field_worker', 'manager', 'admin'));
drop policy if exists "Managers manage supplier rfqs" on public.supplier_rfqs;
create policy "Managers manage supplier rfqs"
  on public.supplier_rfqs for all
  using (public.current_role() in ('manager', 'admin'))
  with check (public.current_role() in ('manager', 'admin'));

drop policy if exists "Staff read supplier rfq lines" on public.supplier_rfq_lines;
create policy "Staff read supplier rfq lines"
  on public.supplier_rfq_lines for select
  using (public.current_role() in ('field_worker', 'manager', 'admin'));
drop policy if exists "Managers manage supplier rfq lines" on public.supplier_rfq_lines;
create policy "Managers manage supplier rfq lines"
  on public.supplier_rfq_lines for all
  using (public.current_role() in ('manager', 'admin'))
  with check (public.current_role() in ('manager', 'admin'));
