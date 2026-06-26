-- ── monitoring_brand_accounts ─────────────────────────────────
-- Shared, per-brand API credentials reusable across many sites. One brand can
-- have several named accounts (e.g. an installer account + a customer account).
-- A monitoring_system either carries its own `credentials` OR links to one of
-- these via `brand_account_id`; the collector prefers the system's own creds
-- and falls back to the linked account's. Credentials are stored encrypted
-- (AES-256-GCM, MONITORING_CREDENTIALS_KEY) — same format as monitoring_systems.
create table public.monitoring_brand_accounts (
  id           uuid primary key default uuid_generate_v4(),
  brand        text not null check (brand in (
    'sunsynk','sigenergy','foxess','deye','growatt','victron',
    'goodwe','solax','solis','huawei','luxpower','local'
  )),
  name         text not null,
  credentials  jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.monitoring_brand_accounts enable row level security;

-- Staff only — these rows hold (encrypted) secrets; customers never read them.
create policy "Staff can manage brand accounts"
  on public.monitoring_brand_accounts for all
  using (public.current_role() in ('manager', 'admin'));

-- Link a system to a shared account. ON DELETE SET NULL is a safety net; the
-- API blocks deleting an account that is still in use.
alter table public.monitoring_systems
  add column if not exists brand_account_id uuid
    references public.monitoring_brand_accounts(id) on delete set null;

create index if not exists monitoring_systems_brand_account
  on public.monitoring_systems (brand_account_id);
