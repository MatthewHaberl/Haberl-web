-- 097_harden_security_definer_search_path.sql
-- ============================================================================
-- Hardening: pin search_path on the SECURITY DEFINER helpers the RLS layer (and
-- now the role-change guard in 094) depend on. A mutable search_path on a
-- SECURITY DEFINER function is itself an escalation vector — flagged by the
-- Supabase security advisor (lint 0011_function_search_path_mutable).
--
-- current_role() is load-bearing for 094's trigger and for most RLS policies.
--
-- normalize_phone() keeps its EXACT body from migration 053 — only `set
-- search_path` is added. The body must stay in lock-step with
-- lib/customers/phone.ts and with the STORED generated columns
-- customers.phone_normalized / leads.phone_normalized (which are NOT recomputed
-- when this function is replaced, so the logic must not drift).
-- ============================================================================

create or replace function public.current_role()
returns user_role language sql security definer stable
set search_path = public
as $$
  select role from public.user_profiles where id = auth.uid()
$$;

create or replace function public.normalize_phone(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when regexp_replace(coalesce(p, ''), '\D', '', 'g') = ''      then null
    when regexp_replace(p, '\D', '', 'g') ~ '^27[0-9]{9}$'        then '0' || substr(regexp_replace(p, '\D', '', 'g'), 3)
    when regexp_replace(p, '\D', '', 'g') ~ '^0027[0-9]{9}$'      then '0' || substr(regexp_replace(p, '\D', '', 'g'), 5)
    when regexp_replace(p, '\D', '', 'g') ~ '^[0-9]{9}$'          then '0' || regexp_replace(p, '\D', '', 'g')
    else regexp_replace(p, '\D', '', 'g')
  end
$$;
