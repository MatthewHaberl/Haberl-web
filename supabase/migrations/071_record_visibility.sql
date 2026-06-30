-- ============================================================
-- Migration 071: record-level visibility (owner + share + per-user scope)
-- ------------------------------------------------------------
-- Section access (migration 060, `role_permissions`) answers "can this user
-- open the Leads tab?". This migration adds the *second* layer: once you're in
-- a section, WHICH records do you see?
--
-- The model (reusable across any record-bearing section — Leads first):
--
--   1. OWNER          every record has one owner (the person whose list it shows
--                     in). Manual leads → their capturer (column default
--                     auth.uid()). Website leads → NULL = the "Unassigned" pool,
--                     unless a referrer is resolved server-side.
--   2. SHARE GRANT    `record_grants` — a generic "also let this person in" row.
--                     Sharing Byron's lead to Zacques keeps Byron as owner but
--                     gives Zacques full access to help. This is the "activate
--                     that lead to Zacques" action.
--   3. SCOPE          per user per section: 'own' or 'all'. Stored as an explicit
--                     override in `user_section_visibility`; absent → role
--                     default (manager/admin = all, everyone else = own). This is
--                     the dial exposed in the Users section.
--
-- Resolution (in `can_see_record`, enforced by RLS so it can't leak):
--     visible  ⇔  scope = 'all'  OR  you own it  OR  it's shared to you
-- 'all' subsumes the unassigned pool, so managers/admins keep seeing fresh
-- inbound website leads exactly as before. Purely additive: defaults reproduce
-- today's behaviour until an admin sets someone to 'own'.
-- ============================================================

-- ── 1. generic share grants ─────────────────────────────────
-- One row = "user_id may also see/act on (section, record_id)". Section is a
-- free-text key matching the PORTAL_SECTIONS registry ('leads', 'quotes', …) so
-- the same table serves every section without schema churn.
create table if not exists public.record_grants (
  id         uuid primary key default gen_random_uuid(),
  section    text not null,
  record_id  uuid not null,
  user_id    uuid not null references public.user_profiles(id) on delete cascade,  -- recipient
  granted_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  unique (section, record_id, user_id)
);

create index if not exists record_grants_recipient_idx on public.record_grants (user_id, section);

alter table public.record_grants enable row level security;

-- Recipients see their own grants; managers/admins see and manage all.
drop policy if exists "Read own or managed grants" on public.record_grants;
create policy "Read own or managed grants"
  on public.record_grants for select
  using (user_id = auth.uid() or public.current_role() in ('manager','admin'));

drop policy if exists "Managers manage grants" on public.record_grants;
create policy "Managers manage grants"
  on public.record_grants for all
  using (public.current_role() in ('manager','admin'))
  with check (public.current_role() in ('manager','admin'));

-- ── 2. per-user visibility scope override ───────────────────
-- Absent row → role default. Present row → forces 'own' or 'all' for that user
-- in that section (this is how an admin/manager can be deliberately narrowed to
-- their own records).
create table if not exists public.user_section_visibility (
  user_id    uuid not null references public.user_profiles(id) on delete cascade,
  section    text not null,
  scope      text not null check (scope in ('own','all')),
  updated_at timestamptz not null default now(),
  primary key (user_id, section)
);

alter table public.user_section_visibility enable row level security;

-- A user may read their own scope; admins read everyone's (Users matrix).
drop policy if exists "Read own or admin visibility" on public.user_section_visibility;
create policy "Read own or admin visibility"
  on public.user_section_visibility for select
  using (user_id = auth.uid() or public.current_role() = 'admin');

-- Only admins set scope (same authority that owns role_permissions).
drop policy if exists "Admins manage visibility" on public.user_section_visibility;
create policy "Admins manage visibility"
  on public.user_section_visibility for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- ── 3. visibility resolver ──────────────────────────────────
-- SECURITY DEFINER so RLS policies can consult grants/scope tables the calling
-- user can't read directly. Owner is passed in (not re-queried) so the common
-- case is a cheap comparison; grants/scope are single indexed lookups.
create or replace function public.can_see_record(
  p_section text,
  p_record_id uuid,
  p_owner uuid
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_role  user_role := public.current_role();
  v_scope text;
begin
  if v_uid is null then
    return false;
  end if;

  -- explicit per-user override wins; otherwise role default
  select scope into v_scope
  from public.user_section_visibility
  where user_id = v_uid and section = p_section;

  if v_scope is null then
    v_scope := case when v_role in ('manager','admin') then 'all' else 'own' end;
  end if;

  if v_scope = 'all' then
    return true;          -- subsumes the unassigned (owner is null) pool
  end if;

  -- 'own' scope: your records + anything shared to you
  if p_owner is not null and p_owner = v_uid then
    return true;
  end if;

  return exists (
    select 1 from public.record_grants g
    where g.section = p_section
      and g.record_id = p_record_id
      and g.user_id = v_uid
  );
end;
$$;

-- ── 4. leads: ownership column + visibility-aware RLS ───────
-- Default auth.uid(): manual inserts (user session) self-own; service-role
-- website inserts get NULL (auth.uid() is null under the service role) = the
-- Unassigned pool. Existing rows stay NULL = Unassigned, which managers/admins
-- ('all') already see — so nothing changes for current users.
alter table public.leads
  add column if not exists owner_id uuid references public.user_profiles(id) default auth.uid(),
  add column if not exists referrer_email text;   -- staff email captured at intake (resolved → owner_id server-side)

create index if not exists leads_owner_idx on public.leads (owner_id);

-- Replace the single blanket manager/admin policy with visibility-aware ones.
-- Managers/admins default to 'all' scope, so they still see/manage everything;
-- the difference is that an explicit 'own' override now genuinely narrows them.
drop policy if exists "Managers can manage leads" on public.leads;

create policy "Read leads by visibility"
  on public.leads for select
  using (public.can_see_record('leads', id, owner_id));

create policy "Update leads by visibility"
  on public.leads for update
  using (public.can_see_record('leads', id, owner_id))
  with check (public.can_see_record('leads', id, owner_id));

-- Any staff member may log a lead; owner_id defaults to them.
create policy "Staff can add leads"
  on public.leads for insert
  with check (public.current_role() in ('field_worker','manager','admin'));

-- Deletion stays a manager/admin housekeeping action.
create policy "Managers can delete leads"
  on public.leads for delete
  using (public.current_role() in ('manager','admin'));
