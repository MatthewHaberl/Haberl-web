-- 087_db_assemblies.sql
-- Reusable DB / combiner "assemblies" for the Quotes-v2 DB Builder (W83).
-- A saved board = a name + a JSONB snapshot of an AcCombiner/DcCombiner (its
-- enclosure + internal components / fedFrom wiring), droppable into any quote.
-- Applied to prod via Supabase MCP 2026-07-01.

create table if not exists public.db_assemblies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'ac' check (kind in ('ac','dc')),
  payload jsonb not null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.db_assemblies enable row level security;

-- Internal, non-sensitive board layouts — any authenticated staff user reads/creates;
-- deletes limited to the creator.
create policy "db_assemblies_auth_select" on public.db_assemblies for select to authenticated using (true);
create policy "db_assemblies_auth_insert" on public.db_assemblies for insert to authenticated with check (true);
create policy "db_assemblies_owner_delete" on public.db_assemblies for delete to authenticated using (created_by = auth.uid());
