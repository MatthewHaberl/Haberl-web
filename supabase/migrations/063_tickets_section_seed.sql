-- Seed the 'tickets' section into the permissions matrix (migration 060),
-- admin-only by default — same shape as migration 060's seed. Admins are
-- all-on in-app regardless of stored rows; this just makes the Tickets row
-- render correctly on the Users → Permissions page and lets an admin grant
-- it to managers/field workers.

insert into public.role_permissions (role, section, allowed) values
  ('field_worker'::user_role, 'tickets', false),
  ('manager'::user_role,      'tickets', false),
  ('admin'::user_role,        'tickets', true)
on conflict (role, section) do nothing;
