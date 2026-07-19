-- 093_guard_product_image_functions.sql
-- ============================================================================
-- Security fix: the four SECURITY DEFINER product-image helpers from migration
-- 020 (append_product_image, append_brand_image, remove_product_image,
-- count_matching_products) never had their access restricted. Because they run
-- as the owner they bypass the "Managers can manage products" RLS, and EXECUTE
-- was never revoked — so ANY authenticated user (or anon) could call them via
-- PostgREST RPC and mutate products.images[] (content defacement).
--
-- The admin Product Images UI calls these via the browser (authenticated) client
-- (ProductImageManager.tsx: supabase.rpc(...)), so revoking EXECUTE from
-- `authenticated` would break the feature. Instead, gate each function INTERNALLY
-- to manager/admin (matching the products RLS) and pin search_path. Staff keep
-- working; everyone else gets 42501.
-- ============================================================================

create or replace function public.append_product_image(p_product_id uuid, p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_role() not in ('manager', 'admin') then
    raise exception 'Not authorised to modify product images' using errcode = '42501';
  end if;
  update products
  set images = array_append(images, p_url)
  where id = p_product_id
    and not (p_url = any(images));
end;
$$;

create or replace function public.append_brand_image(p_brand text, p_family text, p_url text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if public.current_role() not in ('manager', 'admin') then
    raise exception 'Not authorised to modify product images' using errcode = '42501';
  end if;
  with updated as (
    update products
    set images = array_append(images, p_url)
    where brand = p_brand
      and (p_family = '' or name ilike '%' || p_family || '%')
      and not (p_url = any(images))
    returning id
  )
  select count(*)::integer into v_count from updated;
  return v_count;
end;
$$;

create or replace function public.remove_product_image(p_url text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if public.current_role() not in ('manager', 'admin') then
    raise exception 'Not authorised to modify product images' using errcode = '42501';
  end if;
  with updated as (
    update products
    set images = array_remove(images, p_url)
    where p_url = any(images)
    returning id
  )
  select count(*)::integer into v_count from updated;
  return v_count;
end;
$$;

create or replace function public.count_matching_products(p_brand text, p_family text)
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  v_count integer;
begin
  if public.current_role() not in ('manager', 'admin') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  select count(*)::integer into v_count
  from products
  where brand = p_brand
    and (p_family = '' or name ilike '%' || p_family || '%');
  return v_count;
end;
$$;
