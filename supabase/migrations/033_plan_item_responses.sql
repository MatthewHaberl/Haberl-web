-- 033_plan_item_responses.sql
--
-- The "What's next" command center on the employee dashboard lets the operator
-- reply to each plan item and set their own status. Those replies round-trip back
-- to the second brain (Claude reads them next session), so they must NOT be wiped
-- when sync-plan.mjs re-imports the plan from recommendations.md.
--
-- plan_items was originally created directly via the Supabase MCP and never had a
-- migration file. This migration documents the table (create-if-not-exists for fresh
-- environments) and adds the response columns. It is fully idempotent.

create table if not exists public.plan_items (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  track          text not null,
  title          text not null,
  priority       text not null default 'medium',
  priority_rank  integer not null default 2,
  status         text not null default 'pending',
  source_session date,
  is_published   boolean not null default true,
  synced_at      timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Operator response fields. sync-plan.mjs only upserts the vault-owned columns,
-- so these are preserved across re-syncs.
alter table public.plan_items add column if not exists response          text;
alter table public.plan_items add column if not exists user_status       text;
alter table public.plan_items add column if not exists responded_at      timestamptz;
alter table public.plan_items add column if not exists response_handled  boolean not null default false;

-- user_status is the operator's own status (separate from the vault's `status`,
-- which is owned by recommendations.md). Allowed values only.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'plan_items_user_status_check'
  ) then
    alter table public.plan_items
      add constraint plan_items_user_status_check
      check (user_status is null or user_status in ('todo', 'doing', 'done', 'parked'));
  end if;
end $$;

-- Surfacing unhandled replies fast (what Claude reads next session).
create index if not exists plan_items_unhandled_responses_idx
  on public.plan_items (responded_at)
  where response is not null and response_handled = false;

-- RLS — staff read, admin writes. Idempotent so it is safe on the existing table.
alter table public.plan_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'plan_items'
      and policyname = 'Staff can read plan items'
  ) then
    create policy "Staff can read plan items" on public.plan_items
      for select using (current_role() = any (array['field_worker'::user_role, 'manager'::user_role, 'admin'::user_role]));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'plan_items'
      and policyname = 'Admin can manage plan items'
  ) then
    create policy "Admin can manage plan items" on public.plan_items
      for all using (current_role() = 'admin'::user_role);
  end if;
end $$;
