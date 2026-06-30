-- ============================================================
-- Migration 084: per-USER section access overrides
-- ------------------------------------------------------------
-- role_permissions (migration 060) sets which sections a ROLE can open.
-- This table lets an admin override that for ONE person — e.g. block the
-- Finance or Wastage section for Byron specifically, even though his role
-- (or admin status) would otherwise grant it; or grant a single section to
-- someone whose role doesn't have it.
--
--   user_section_permissions(user_id, section) -> allowed
--     row present, allowed = true   -> force ON  (overrides role)
--     row present, allowed = false  -> force OFF (overrides role, incl. admin)
--     no row                        -> follow the role default
--
-- Resolution order in lib/auth/permissions.ts getUserAccess():
--   role default (role_permissions / admin = all)  →  apply per-user overrides
--   →  an admin always keeps the `users` section (so access control is never
--      lost and the portal stays recoverable).
-- ============================================================

create table if not exists public.user_section_permissions (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  section    text        not null,
  allowed    boolean     not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, section)
);

alter table public.user_section_permissions enable row level security;

-- A user must read their OWN overrides (the page guard resolves them);
-- admins read everyone's (to render the Users → person screen).
create policy "Read own or admin reads all section overrides"
  on public.user_section_permissions for select
  using (user_id = auth.uid() or public.current_role() = 'admin');

-- Only admins may set overrides.
create policy "Admins manage section overrides"
  on public.user_section_permissions for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');
