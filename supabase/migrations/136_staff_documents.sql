-- ============================================================================
-- Migration 136: staff_documents — the person's file, not just their pay.
-- ----------------------------------------------------------------------------
-- Migration 112 gave a staff member hours, rates and payslips. What it never
-- gave them was the paperwork every employer actually has to keep and be able
-- to produce: the ID copy, the signed contract, the driver's and wireman's
-- licences, the trade certificate, the bank-confirmation letter, the SARS
-- number, the medical, the induction, the warning letter.
--
-- Today those live in WhatsApp threads and a folder on somebody's laptop. This
-- table puts them on the person, where they are found by looking at the person.
--
-- Two things earn their place beyond "a file with a name":
--   • doc_number  — the ID number / licence number itself, so the common
--                   lookup ("what is his ID number") does not need the file
--                   opened at all.
--   • expires_on  — a wireman's licence, a medical certificate and a work
--                   permit all lapse. The staff page reads this column to warn
--                   BEFORE the day someone is on site without a valid card.
--
-- Payslips are NOT copied in here. They are already rows in `payslips` with
-- their own frozen totals; the Documents tab lists them alongside these files
-- so the one place holds everything, but the record stays where it is issued.
--
-- The files themselves go in the private `staff-docs` bucket. No storage
-- policies — every read is a short-lived signed URL and every write goes
-- through a route handler on the service role, the same pattern as
-- payment-proofs (024) and financial-docs (047).
-- ============================================================================

create table if not exists public.staff_documents (
  id uuid primary key default gen_random_uuid(),

  staff_id uuid not null references public.staff(id) on delete cascade,

  -- What kind of paper this is. Drives the grouping on the Documents tab and
  -- which fields matter: 'id_document' wants a number, the licences want an
  -- expiry, 'contract' wants neither.
  doc_type text not null default 'other' check (doc_type in (
    'id_document',      -- SA ID book/card, passport, asylum/work permit
    'drivers_licence',
    'wireman_licence',  -- wireman's licence / installation electrician registration
    'qualification',    -- trade test, N-certificates, course certificates
    'contract',         -- employment contract, amendments, letters of appointment
    'banking',          -- bank confirmation letter for paying them
    'tax',              -- SARS registration, IRP5, tax directive
    'medical',          -- fitness-to-work / medical certificate
    'safety',           -- induction, PPE issue, toolbox-talk sign-off
    'disciplinary',     -- warnings, hearing outcomes
    'other'
  )),

  -- Free-text label. Defaults to the file name at upload when left blank, so a
  -- row is never nameless.
  title text not null,

  -- The number ON the document — ID number, licence number, SARS number. The
  -- answer to most questions asked of these files, without opening one.
  doc_number text,

  issued_on  date,
  expires_on date,

  notes text,

  -- Object path inside the private `staff-docs` bucket (never a public URL).
  file_url  text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,

  uploaded_by uuid references public.user_profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.staff_documents is
  'Paperwork held on a staff member — IDs, licences, contracts, certificates. Files live in the private staff-docs bucket.';
comment on column public.staff_documents.doc_number is
  'The number printed on the document (ID / licence / SARS), so the usual lookup needs no file opened.';
comment on column public.staff_documents.expires_on is
  'When this document lapses. The staff page warns on anything expiring inside 60 days.';

create index if not exists staff_documents_staff_idx
  on public.staff_documents (staff_id, doc_type);

-- Partial: only documents that actually lapse are ever scanned for expiry.
create index if not exists staff_documents_expiry_idx
  on public.staff_documents (expires_on)
  where expires_on is not null;

drop trigger if exists staff_documents_touch_updated_at on public.staff_documents;
create trigger staff_documents_touch_updated_at before update on public.staff_documents
  for each row execute function public.touch_staff_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Stricter than payslips on purpose. A payslip is the person's own money and
-- they may read it; this table holds warning letters and medicals, so it is
-- manager/admin only in both directions. If staff-facing access is ever wanted
-- it should be per-document (a 'share with them' flag), never wholesale.
alter table public.staff_documents enable row level security;

drop policy if exists staff_documents_manage on public.staff_documents;
create policy staff_documents_manage
  on public.staff_documents for all
  using (public.current_role() in ('manager', 'admin'))
  with check (public.current_role() in ('manager', 'admin'));

-- ── staff-docs bucket: private, 25 MB, images + PDF + Word ──────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-docs',
  'staff-docs',
  false,
  26214400,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;
