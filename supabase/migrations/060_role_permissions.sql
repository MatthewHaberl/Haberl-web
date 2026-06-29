-- ============================================================
-- Migration 060: data-driven per-section portal permissions
-- ------------------------------------------------------------
-- Until now, which role could open which employee-portal section was
-- hardcoded (sidebar `roles: [...]` arrays + inline `['manager','admin']`
-- redirects in ~30 pages). This table makes it editable by an admin.
--
--   role_permissions(role, section) -> allowed
--
-- Admin is NOT modelled as removable: the app hard-codes admin = all
-- sections, so admins can never lock themselves out, and the matrix UI
-- locks the admin column on. `customer` is excluded — the customer portal
-- is separate and uniform.
--
-- The seed reproduces the exact pre-migration access for field_worker and
-- manager (admin seeded all-true for completeness; the app ignores stored
-- admin rows anyway), so behaviour is unchanged until an admin edits it.
-- ============================================================

create table if not exists public.role_permissions (
  role       user_role   not null,
  section    text        not null,
  allowed    boolean     not null default false,
  updated_at timestamptz not null default now(),
  primary key (role, section)
);

alter table public.role_permissions enable row level security;

-- Permissions are not secret and every page guard must read them.
create policy "Authenticated users can read permissions"
  on public.role_permissions for select
  using (auth.role() = 'authenticated');

-- Only admins may change them.
create policy "Admins manage permissions"
  on public.role_permissions for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- ── Seed: reproduce historical access ────────────────────────
-- section -> roles that had access before this migration.
insert into public.role_permissions (role, section, allowed)
select r.role,
       s.section,
       (r.role::text = any (s.roles)) as allowed
from (values
  ('dashboard',   array['field_worker','manager','admin']),
  ('briefing',    array['manager','admin']),
  ('leads',       array['manager','admin']),
  ('jobs',        array['field_worker','manager','admin']),
  ('quotes',      array['field_worker','manager','admin']),
  ('procurement', array['manager','admin']),
  ('customers',   array['manager','admin']),
  ('monitoring',  array['manager','admin']),
  ('metrics',     array['manager','admin']),
  ('lead_finder', array['manager','admin']),
  ('wastage',     array['manager','admin']),
  ('finance',     array['manager','admin']),
  ('shop',        array['admin']),
  ('settings',    array['admin']),
  ('users',       array['admin'])
) as s(section, roles)
cross join (values
  ('field_worker'::user_role),
  ('manager'::user_role),
  ('admin'::user_role)
) as r(role)
on conflict (role, section) do nothing;
