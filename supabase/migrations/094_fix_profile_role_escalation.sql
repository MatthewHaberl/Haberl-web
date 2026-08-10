-- 091_fix_profile_role_escalation.sql
-- ============================================================================
-- Security fix: close a privilege-escalation hole on public.user_profiles.
--
-- The "Users can update own profile" policy (001_init.sql) is:
--     for update using (id = auth.uid())
-- with no WITH CHECK clause. Postgres therefore lets a user update ANY column of
-- their own row — including `role` — and Supabase grants UPDATE on the table to
-- the `authenticated` role by default. A logged-in customer could run, straight
-- from the browser anon client:
--     update public.user_profiles set role = 'admin' where id = auth.uid();
-- and self-promote to admin, unlocking every manager/admin RLS policy app-wide.
--
-- RLS WITH CHECK can only see the NEW row, not the OLD one, so it cannot express
-- "role must not change". A BEFORE UPDATE trigger is the correct tool: it sees
-- both OLD and NEW and can decide based on the caller.
--
-- Rule enforced: `role` may change only when the caller is already an admin (or a
-- trusted server-side service_role call, where auth.uid() is null — anonymous
-- callers never reach this point because the row is invisible to them under RLS).
-- Every other column on one's own row remains freely editable, so profile edits
-- (name, phone, address) are unaffected. The admin dashboard route
-- (app/api/users/[id]/role) uses the admin's own session, so it keeps working.
-- ============================================================================

create or replace function public.enforce_role_change_is_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only guard the privilege column; all other edits pass through untouched.
  if new.role is distinct from old.role then
    -- Trusted backend (service_role key) has no auth.uid(); allow it. Anonymous
    -- callers can't get here — RLS hides the row from them before the trigger runs.
    if auth.uid() is null then
      return new;
    end if;
    -- Otherwise the caller must currently be an admin. current_role() is
    -- SECURITY DEFINER and reads the caller's own (pre-update) role.
    if public.current_role() <> 'admin' then
      raise exception 'Only administrators can change a user role'
        using errcode = '42501'; -- insufficient_privilege
    end if;
  end if;
  return new;
end;
$$;

-- Never callable directly as an RPC (matches the hardening in migration 027).
revoke execute on function public.enforce_role_change_is_admin() from anon, authenticated, public;

drop trigger if exists trg_enforce_role_change_is_admin on public.user_profiles;
create trigger trg_enforce_role_change_is_admin
  before update on public.user_profiles
  for each row
  execute function public.enforce_role_change_is_admin();
