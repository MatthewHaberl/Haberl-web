-- ============================================================
-- Security fix: remove client-supplied role from signup trigger
-- Apply this to any instance that already ran 001_init.sql
-- ============================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (id, email, full_name, phone, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    'customer'  -- never trust client-supplied role; admin promotes via dashboard
  );
  return new;
end;
$$;
