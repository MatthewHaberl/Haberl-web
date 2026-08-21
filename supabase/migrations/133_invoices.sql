-- ============================================================================
-- Migration 133: customer invoices, raised from a job.
-- ----------------------------------------------------------------------------
-- Until now the only "invoice" in this system was somebody else's: a supplier
-- document uploaded into Finance and allocated (migration 047). There was no
-- way to bill a customer. A quote said what the work would cost, a deposit was
-- reconciled against a proof of payment, and everything after that was a
-- WhatsApp message.
--
-- An invoice is raised against a JOB, because that is where the work is:
--
--   contract   = what the accepted quote said the job is worth
--   invoiced   = the sum of every invoice on the job that is not void
--   remaining  = contract - invoiced        ← what a final invoice bills
--
-- A job can carry as many invoices as the work takes: a deposit up front, a
-- progress claim when the boards are in, a final one at handover. `kind` is
-- what each one is claiming to be; nothing enforces an order, because real
-- jobs do not run in one.
--
-- Two invariants matter more than the rest:
--
--   1. A DRAFT is editable, an ISSUED invoice is not. Once it goes out it is a
--      financial record, and lines, amounts and the document are frozen by a
--      trigger, not by the UI remembering to disable a button. Getting it
--      wrong is what `void` is for — void it and raise another.
--   2. Amounts are CENTS, integers, and the header total is written from the
--      lines. No screen adds up a float.
--
-- Haberl is not VAT registered (see render-scope-quote's VAT badge), so there
-- is no tax column here on purpose. The day that changes it is a new column
-- and a new line on the document, not a rewrite of this table.
-- ============================================================================

-- ── numbering ───────────────────────────────────────────────────────────────
-- Same shape as quote_sequences (migration 031): atomic per-year counter, and
-- the number is consumed inside a security-definer function so nothing else
-- can write to it.
create table if not exists public.invoice_sequences (
  year        integer primary key,
  next_number integer not null default 1
);

alter table public.invoice_sequences enable row level security;

drop policy if exists "Staff can read invoice sequences" on public.invoice_sequences;
create policy "Staff can read invoice sequences"
  on public.invoice_sequences for select
  using (public.current_role() in ('field_worker', 'manager', 'admin'));

alter table public.company_settings
  add column if not exists invoice_prefix text not null default 'INV',
  -- Days from issue to due date on a new invoice. 0 = due on receipt, which is
  -- how this business has always worked; change it in Settings, not in code.
  add column if not exists invoice_due_days integer not null default 0,
  -- Printed under "Terms" on every invoice unless the invoice overrides it.
  add column if not exists invoice_terms text;

create or replace function public.next_invoice_number()
returns text language plpgsql security definer set search_path = public as $$
declare
  current_year int := extract(year from now())::int;
  seq int;
  prefix text;
begin
  -- RETURNING sees the post-operation row, so the number this call consumed is
  -- always next_number - 1 (a fresh insert lands at 2 and consumes 1).
  insert into public.invoice_sequences (year, next_number)
  values (current_year, 2)
  on conflict (year) do update set next_number = invoice_sequences.next_number + 1
  returning invoice_sequences.next_number - 1
  into seq;

  select coalesce(invoice_prefix, 'INV') into prefix from public.company_settings where id = true;

  return coalesce(prefix, 'INV') || '-' || current_year || '-' || lpad(seq::text, 4, '0');
end;
$$;

revoke execute on function public.next_invoice_number() from anon, public;
grant execute on function public.next_invoice_number() to authenticated;

-- ── invoices ────────────────────────────────────────────────────────────────
create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  invoice_number text unique,

  -- The work. An invoice without a job is not something this system raises,
  -- but deleting a job must not delete the financial record of what was
  -- billed for it — hence set null rather than cascade.
  job_id           uuid references public.jobs(id)           on delete set null,
  quote_request_id uuid references public.quote_requests(id) on delete set null,
  customer_id      uuid references public.customers(id)      on delete set null,

  -- Who it is addressed to, snapshotted. A customer who moves house next year
  -- must not silently rewrite the address on an invoice already sent.
  bill_to_name    text not null,
  bill_to_email   text,
  bill_to_phone   text,
  bill_to_address text,
  -- Where the work was done, when that differs from the billing address.
  site_address    text,

  kind   text not null default 'progress'
    check (kind in ('deposit', 'progress', 'final')),
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'paid', 'void')),

  issue_date date not null default current_date,
  due_date   date,

  -- Free text the customer reads, above the terms.
  notes text,
  terms text,

  -- Written from the lines by recalc_invoice_total(); never set by a caller.
  total_cents       bigint not null default 0,
  amount_paid_cents bigint not null default 0,

  sent_at     timestamptz,
  sent_method text check (sent_method in ('email', 'whatsapp', 'manual')),
  sent_by     uuid references public.user_profiles(id) on delete set null,
  paid_at     timestamptz,
  voided_at   timestamptz,
  voided_by   uuid references public.user_profiles(id) on delete set null,
  void_reason text,

  -- The customer-facing document, frozen when the invoice is issued. The same
  -- discipline as quote_requests.quote_html: what was sent is what is served,
  -- even after rates, catalogs and templates move on.
  document_html text,

  -- Unguessable link for the customer's copy — /i/<token>. Same credential
  -- model as a quote's share_token.
  share_token text not null unique default encode(gen_random_bytes(16), 'hex'),

  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint invoices_bill_to_not_blank check (length(btrim(bill_to_name)) > 0),
  constraint invoices_paid_non_negative check (amount_paid_cents >= 0),
  -- An issued invoice has a number. A draft has not consumed one yet, which is
  -- the whole reason drafts exist.
  constraint invoices_issued_has_number check (status = 'draft' or invoice_number is not null)
);

comment on table public.invoices is
  'A customer invoice raised against a job. Draft is editable; anything else is a frozen financial record.';
comment on column public.invoices.total_cents is
  'Derived from invoice_lines by trigger. Do not write directly.';
comment on column public.invoices.kind is
  'What this invoice claims to be: the deposit, a progress claim, or the final one. Not an order — jobs do not run in one.';

create index if not exists invoices_job_idx      on public.invoices (job_id);
create index if not exists invoices_customer_idx on public.invoices (customer_id, issue_date desc);
create index if not exists invoices_quote_idx    on public.invoices (quote_request_id);
create index if not exists invoices_status_idx   on public.invoices (status);

-- ── invoice_lines ───────────────────────────────────────────────────────────
create table if not exists public.invoice_lines (
  id         uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,

  description text not null,
  -- The smaller print under the description — what a section covers, which
  -- days a progress claim spans.
  detail      text,

  qty              numeric not null default 1,
  unit             text,
  unit_price_cents bigint  not null default 0,
  -- Held rather than computed: a percentage claim is an amount with no honest
  -- qty x price behind it, and rounding one out of the other loses cents.
  amount_cents     bigint  not null default 0,

  -- Where this line came from, so "what is left to invoice" can be answered
  -- against the quote rather than guessed.
  source     text not null default 'manual'
    check (source in ('quote_section', 'quote_line', 'job_material', 'labour', 'percentage', 'manual', 'credit')),
  source_ref text,

  sort_order integer not null default 0,

  constraint invoice_lines_description_not_blank check (length(btrim(description)) > 0)
);

comment on column public.invoice_lines.amount_cents is
  'The line total. Stored, not computed: a percentage claim has no honest qty x price behind it.';
comment on column public.invoice_lines.source is
  'Provenance. ''credit'' is a negative line — a deposit already paid, money back, a discount.';

create index if not exists invoice_lines_invoice_idx on public.invoice_lines (invoice_id, sort_order);

-- ── the header total follows the lines ──────────────────────────────────────
create or replace function public.recalc_invoice_total()
returns trigger language plpgsql set search_path = public as $$
declare
  target uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  update public.invoices i
  set total_cents = coalesce((
        select sum(l.amount_cents) from public.invoice_lines l where l.invoice_id = target
      ), 0),
      updated_at = now()
  where i.id = target;
  return null;
end;
$$;

drop trigger if exists invoice_lines_recalc on public.invoice_lines;
create trigger invoice_lines_recalc
  after insert or update or delete on public.invoice_lines
  for each row execute function public.recalc_invoice_total();

-- ── an issued invoice is frozen ─────────────────────────────────────────────
-- The UI disables the buttons; this is what makes it true. An invoice that has
-- left the building is a record of what was claimed, and correcting it means
-- voiding it and raising another — which is exactly what an accountant expects
-- and what a silently-edited invoice destroys.
create or replace function public.guard_issued_invoice_lines()
returns trigger language plpgsql set search_path = public as $$
declare
  target uuid := coalesce(new.invoice_id, old.invoice_id);
  s text;
begin
  select status into s from public.invoices where id = target;
  if s is not null and s <> 'draft' then
    raise exception 'Invoice % is % — void it and raise a new one rather than editing its lines', target, s
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists invoice_lines_guard on public.invoice_lines;
create trigger invoice_lines_guard
  before insert or update or delete on public.invoice_lines
  for each row execute function public.guard_issued_invoice_lines();

create or replace function public.guard_issued_invoice()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();

  if old.status = 'void' and new.status <> 'void' then
    raise exception 'A voided invoice cannot be brought back — raise a new one'
      using errcode = '42501';
  end if;

  if old.status <> 'draft' then
    -- What an issued invoice is still allowed to change: how it was paid, how
    -- it was sent, and being voided. Everything a customer reads is frozen.
    if new.total_cents is distinct from old.total_cents
       or new.kind          is distinct from old.kind
       or new.issue_date    is distinct from old.issue_date
       or new.due_date      is distinct from old.due_date
       or new.notes         is distinct from old.notes
       or new.terms         is distinct from old.terms
       or new.document_html is distinct from old.document_html
       or new.invoice_number is distinct from old.invoice_number
       or new.bill_to_name  is distinct from old.bill_to_name
       or new.bill_to_email is distinct from old.bill_to_email
       or new.bill_to_address is distinct from old.bill_to_address then
      raise exception 'Invoice % is % — void it and raise a new one rather than editing it', old.id, old.status
        using errcode = '42501';
    end if;
  end if;

  -- Paid is a consequence of the money, not a button: it follows the balance.
  if new.status in ('sent', 'paid') then
    if new.amount_paid_cents >= new.total_cents and new.total_cents > 0 then
      new.status  := 'paid';
      new.paid_at := coalesce(new.paid_at, now());
    else
      new.status  := 'sent';
      new.paid_at := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists invoices_guard on public.invoices;
create trigger invoices_guard
  before update on public.invoices
  for each row execute function public.guard_issued_invoice();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Money: managers and admins, the same line Finance already draws. A field
-- worker on the job does not need to see what the customer is being billed.
-- The customer's own copy is served by the tokenized public page through the
-- service-role client, exactly like a quote — no policy needed for that.
alter table public.invoices      enable row level security;
alter table public.invoice_lines enable row level security;

drop policy if exists "invoices_read" on public.invoices;
create policy "invoices_read" on public.invoices
  for select using (public.current_role() in ('manager', 'admin'));

drop policy if exists "invoices_write" on public.invoices;
create policy "invoices_write" on public.invoices
  for all
  using (public.current_role() in ('manager', 'admin'))
  with check (public.current_role() in ('manager', 'admin'));

drop policy if exists "invoice_lines_read" on public.invoice_lines;
create policy "invoice_lines_read" on public.invoice_lines
  for select using (public.current_role() in ('manager', 'admin'));

drop policy if exists "invoice_lines_write" on public.invoice_lines;
create policy "invoice_lines_write" on public.invoice_lines
  for all
  using (public.current_role() in ('manager', 'admin'))
  with check (public.current_role() in ('manager', 'admin'));

-- Customers read their own invoices in the portal. Only issued ones — a draft
-- is a working document and must never appear in somebody's account.
drop policy if exists "invoices_customer_read" on public.invoices;
create policy "invoices_customer_read" on public.invoices
  for select using (
    status in ('sent', 'paid')
    and customer_id = public.current_customer_id()
  );

drop policy if exists "invoice_lines_customer_read" on public.invoice_lines;
create policy "invoice_lines_customer_read" on public.invoice_lines
  for select using (
    invoice_id in (
      select i.id from public.invoices i
      where i.status in ('sent', 'paid')
        and i.customer_id = public.current_customer_id()
    )
  );
