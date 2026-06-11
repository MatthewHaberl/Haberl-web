-- Phase 1: close the quote loop.
-- Public share tokens + online acceptance on quote_requests, deposit
-- reconciliation on jobs, public leads intake, company settings (banking
-- details for EFT instructions), and a private bucket for proof-of-payment.

-- 1 ── quote_requests: share + acceptance + follow-up tracking
alter table public.quote_requests
  add column if not exists share_token uuid not null default gen_random_uuid(),
  add column if not exists expiry_date date,
  add column if not exists sent_at timestamptz,
  add column if not exists viewed_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists declined_at timestamptz,
  add column if not exists decline_reason text,
  add column if not exists acceptance_name text,
  add column if not exists acceptance_ip text,
  add column if not exists reminder_count integer not null default 0,
  add column if not exists last_reminder_at timestamptz;

create unique index if not exists quote_requests_share_token_idx
  on public.quote_requests (share_token);

-- 2 ── jobs: EFT deposit reconciliation
alter table public.jobs
  add column if not exists deposit_proof_url text,
  add column if not exists deposit_proof_uploaded_at timestamptz,
  add column if not exists deposit_confirmed_at timestamptz,
  add column if not exists deposit_confirmed_by uuid references public.user_profiles(id);

-- 3 ── leads: light public intake (name/phone/suburb). Rows are written
-- server-side with the service role; no anon policies on purpose.
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  suburb text,
  note text,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'converted', 'discarded')),
  quote_request_id uuid references public.quote_requests(id),
  source text not null default 'website',
  created_at timestamptz not null default now(),
  contacted_at timestamptz
);

alter table public.leads enable row level security;

create policy "Managers can manage leads"
  on public.leads for all
  using ("current_role"() in ('manager', 'admin'));

-- 4 ── company_settings: single-row config. Starts with EFT banking details
-- and quote expiry; grows into the full settings extraction in Phase 4.
create table if not exists public.company_settings (
  id boolean primary key default true check (id),
  company_name text not null default 'Haberl Electrical & Solar',
  contact_email text,
  contact_phone text,
  banking jsonb not null default '{}'::jsonb,
  quote_expiry_days integer not null default 30,
  updated_at timestamptz not null default now()
);

alter table public.company_settings enable row level security;

create policy "Staff can read company settings"
  on public.company_settings for select
  using ("current_role"() in ('field_worker', 'manager', 'admin'));

create policy "Admin can manage company settings"
  on public.company_settings for all
  using ("current_role"() = 'admin');

insert into public.company_settings (id, contact_email, contact_phone, banking)
values (
  true,
  'info@haberl.co.za',
  '+27 61 519 3016',
  '{"bank": "", "account_name": "", "account_number": "", "branch_code": "", "account_type": ""}'::jsonb
)
on conflict (id) do nothing;

-- 5 ── payment-proofs bucket: private. No storage policies — all reads and
-- writes go through the service role (uploads via route handler, admin
-- viewing via signed URLs).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;
