-- Applied to production 2026-06-16 (version 20260616134239) outside the repo.
-- Recovered from supabase_migrations.schema_migrations. See _out_of_band/README.md.

-- Operating-plan items synced on-demand from the second brain (claude-obsidian recommendations.md).
-- ALLOWLISTED Haberl sections only — BMG / trading / personal data is never written here.
create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  track text not null,
  title text not null,
  priority text not null default 'medium',
  priority_rank int not null default 2,
  status text not null default 'pending',
  source_session date,
  is_published boolean not null default true,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_items_status_check check (status in ('pending','in_progress','done')),
  constraint plan_items_priority_check check (priority in ('urgent','highest','high','medium','low'))
);

comment on table public.plan_items is 'Haberl operating-plan items synced on-demand from the claude-obsidian vault (recommendations.md). Allowlisted Haberl sections only; no BMG/trading/personal data.';

create index plan_items_open_idx on public.plan_items (is_published, status, priority_rank);

alter table public.plan_items enable row level security;

-- Read: any signed-in staff member (matches company_settings / bom_pack_sizes convention).
create policy "Staff can read plan items"
  on public.plan_items for select
  using ("current_role"() = any (array['field_worker'::user_role, 'manager'::user_role, 'admin'::user_role]));

-- Manage: admin only (the sync script writes via the service-role key, which bypasses RLS).
create policy "Admin can manage plan items"
  on public.plan_items for all
  using ("current_role"() = 'admin'::user_role);
