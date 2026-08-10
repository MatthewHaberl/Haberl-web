-- 099_quote_versions.sql
-- W56 phase 1 — an immutable record of every quote the customer was actually sent.
--
-- Today a quote can be edited after it's sent, so the numbers a customer saw can
-- drift with no record of what changed. That's a legal and financial integrity
-- problem: a signed quote should be immutable, and a dispute should be settled
-- by looking at what was sent, not by trusting the current state of a row.
--
-- Phase 1 (this migration) closes the evidence gap: on every send, the whole
-- quote state is snapshotted into an append-only version row. Nothing is
-- blocked, nothing existing changes behaviour — the record simply starts
-- existing. Phase 2 adds the read-only lock and the amendment flow on top,
-- which is a portal-wide change and wants browser verification.
--
-- Append-only is enforced in the database, not just in application code: there
-- is no update or delete policy, and a trigger rejects updates outright. A
-- snapshot you can quietly rewrite is not evidence.

create table if not exists public.quote_versions (
  id             uuid primary key default gen_random_uuid(),
  quote_id       uuid not null references public.quote_requests(id) on delete cascade,
  -- 1, 2, 3 … in send order. v1 is the original; each later send is an amendment.
  version        integer not null,

  -- The full state as sent. quote_html is what the customer literally saw.
  quote_html     text,
  system_design  jsonb,
  bom_snapshot   jsonb,
  generated_quote jsonb,
  -- Money, denormalised so a total can be read without parsing the blobs.
  total_amount   bigint,
  deposit_amount bigint,
  tariff_rate    numeric,
  expiry_date    date,

  -- Who sent it, when, and (for an amendment) why.
  sent_at        timestamptz not null default now(),
  sent_by        uuid references auth.users(id) on delete set null,
  amendment_reason text,

  created_at     timestamptz not null default now(),

  unique (quote_id, version)
);

create index if not exists quote_versions_quote_idx on public.quote_versions(quote_id, version desc);

comment on table public.quote_versions is
  'Append-only snapshot of a quote at each send (W56). v1 = original; later rows are amendments. Never updated or deleted — this is the evidence of what the customer was shown.';
comment on column public.quote_versions.amendment_reason is
  'Why this version supersedes the previous one. Null on v1.';

-- ── Append-only enforcement ──────────────────────────────────────────────────
create or replace function public.tg_quote_versions_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'quote_versions is append-only — create a new version instead of editing version % of quote %', old.version, old.quote_id;
end $$;

drop trigger if exists trg_quote_versions_immutable on public.quote_versions;
create trigger trg_quote_versions_immutable
before update on public.quote_versions
for each row execute function public.tg_quote_versions_immutable();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Staff read. Writes happen on the send path via the service-role client, so no
-- insert policy is granted to ordinary sessions — a version row can only be
-- created by the code that actually sends a quote.
alter table public.quote_versions enable row level security;

drop policy if exists "Staff can read quote versions" on public.quote_versions;
create policy "Staff can read quote versions"
  on public.quote_versions for select
  using ("current_role"() in ('admin'::user_role, 'manager'::user_role));

-- ── Pointer on the quote ─────────────────────────────────────────────────────
-- Nullable and unused by existing code paths: purely additive.
alter table public.quote_requests
  add column if not exists current_version integer,
  add column if not exists locked_at timestamptz;

comment on column public.quote_requests.current_version is
  'Highest version in quote_versions for this quote. Null = never sent.';
comment on column public.quote_requests.locked_at is
  'When the quote became read-only (W56 phase 2). Stamped on send; NOT yet enforced by edit guards — phase 1 records only.';
