-- 092_signup_link_by_verified_email_only.sql
-- ============================================================================
-- Security fix: stop the signup trigger from trusting a client-supplied
-- customer_id.
--
-- handle_new_user (latest definition in 086_register_address.sql) linked the CRM
-- record via `raw_user_meta_data->>'customer_id'` — a value the client controls
-- on supabase.auth.signUp(). On open self-registration that let an attacker put
-- ANY unclaimed customer's UUID in their signup metadata and bind that customer
-- record to their own login, so current_customer_id() then resolved to the
-- victim — horizontal access to that customer's sites, documents, jobs and
-- monitoring.
--
-- Fix: link ONLY by a matching email. Admin invites already link the record
-- explicitly server-side via the service role (lib/customers/invite.ts) and are
-- addressed to the customer's own email, so email-match still links them; a
-- self-signup with someone else's UUID no longer links anything. Everything else
-- about the trigger (profile insert with hard-coded role='customer', address
-- capture) is preserved from 086.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_address text;
begin
  v_address := nullif(new.raw_user_meta_data->>'address', '');

  insert into public.user_profiles (id, email, full_name, phone, address, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    v_address,
    'customer'  -- never trust client-supplied role; admin promotes via dashboard
  );

  -- Link the CRM customer record ONLY by verified email match. The previous
  -- customer_id-from-metadata branch was removed (see header): it was a
  -- horizontal-takeover vector. Never clobber a staff-entered address.
  if coalesce(new.email, '') <> '' then
    update public.customers
      set auth_user_id = new.id,
          address = coalesce(nullif(address, ''), v_address)
      where auth_user_id is null
        and email is not null
        and lower(email) = lower(new.email);
  end if;

  return new;
end;
$$;
