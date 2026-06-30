-- 086_register_address.sql
-- Capture the address a customer types on the public registration form.
--
-- The signup form now has a Google-autocompleted "Address" field; the value
-- rides along in auth metadata (raw_user_meta_data->>'address'). This migration
-- persists it:
--   1. onto the new user_profiles row, and
--   2. onto the linked customers CRM row (only when that row has no address yet
--      — never clobber a staff-entered address with a self-signup value).
--
-- Additive and exception-safe: the trigger keeps its existing structure so a
-- linking failure can never block account creation.

alter table public.user_profiles
  add column if not exists address text;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_customer_id uuid;
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

  begin
    v_customer_id := nullif(new.raw_user_meta_data->>'customer_id', '')::uuid;
  exception when others then
    v_customer_id := null;
  end;

  if v_customer_id is not null then
    update public.customers
      set auth_user_id = new.id,
          address = coalesce(nullif(address, ''), v_address)
      where id = v_customer_id and auth_user_id is null;
  elsif coalesce(new.email, '') <> '' then
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
