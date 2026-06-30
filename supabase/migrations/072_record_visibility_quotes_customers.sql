-- ============================================================
-- Migration 072: extend record-level visibility to Quotes + Customers
-- ------------------------------------------------------------
-- Slice 5 of the record-visibility feature (engine + Leads shipped in 071).
-- Rolls the same owner + share-grant + per-user-scope model into two more
-- sections, and generalises the resolver so each section keeps its OWN
-- historical default (nothing changes for current users until an admin sets
-- someone to a narrower scope via the Users dial).
--
-- Two upgrades to `can_see_record`:
--   1. Staff-only guard — record visibility is an EMPLOYEE concept. A customer
--      login must never be granted access through it (their own data comes from
--      dedicated self-policies like `auth_user_id = auth.uid()`). Without this,
--      a section whose non-manager default is 'all' would leak to customers.
--   2. Per-section non-manager default (`p_field_default`) — passed by each
--      table's policy so the section's history is preserved:
--        • leads  → 'own'  (field workers never had blanket access)
--        • quotes → 'own'  (already scoped by submitted_by)
--        • customers → 'all' (every staff member saw every customer)
--
-- Owner columns are REUSED, not duplicated: quotes.submitted_by and
-- customers.created_by already carry "whose record is this".
-- ============================================================

-- ── 1. resolver: staff-only + per-section default ───────────
-- Replacing the 3-arg signature means dropping the policies that depend on it
-- first, then recreating them against the new 4-arg form (3-arg calls still
-- work via the default). Leads behaviour is byte-for-byte unchanged.
drop policy if exists "Read leads by visibility" on public.leads;
drop policy if exists "Update leads by visibility" on public.leads;
drop function if exists public.can_see_record(text, uuid, uuid);

create or replace function public.can_see_record(
  p_section text,
  p_record_id uuid,
  p_owner uuid,
  p_field_default text default 'own'   -- non-manager default for THIS section
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

  -- Record visibility is staff-only; customer logins are served by their own
  -- self-policies, never by this helper.
  if v_role not in ('field_worker','manager','admin') then
    return false;
  end if;

  -- explicit per-user override wins; else manager/admin = all, else section default
  select scope into v_scope
  from public.user_section_visibility
  where user_id = v_uid and section = p_section;

  if v_scope is null then
    v_scope := case when v_role in ('manager','admin') then 'all' else p_field_default end;
  end if;

  if v_scope = 'all' then
    return true;
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

-- recreate leads policies (3-arg call ⇒ field default 'own', as before)
create policy "Read leads by visibility"
  on public.leads for select
  using (public.can_see_record('leads', id, owner_id));

create policy "Update leads by visibility"
  on public.leads for update
  using (public.can_see_record('leads', id, owner_id))
  with check (public.can_see_record('leads', id, owner_id));

-- ── 2. quotes: owner = submitted_by, default 'own' ──────────
-- Pure upgrade: the old policy already showed a field worker only their own
-- submissions. Now it additionally honours shares + the per-user dial. The
-- INSERT and (admin-only) UPDATE policies are left untouched — quote editing
-- flows are unchanged; sharing a quote grants visibility, not edit rights.
drop policy if exists "Quote requests are visible to submitter and managers" on public.quote_requests;
drop policy if exists "Admins view all quote requests" on public.quote_requests;
drop policy if exists "Customers view own quote requests" on public.quote_requests;

create policy "Read quotes by visibility"
  on public.quote_requests for select
  using (public.can_see_record('quotes', id, submitted_by, 'own'));

-- ── 3. customers: owner = created_by, default 'all' ─────────
-- Preserves "every staff member sees every customer" (default 'all') while
-- letting an admin narrow a specific person to their own book via the dial.
-- The customer-self read (auth_user_id) is kept as a separate OR so a logged-in
-- customer still sees their own record — the helper would (correctly) deny them.
drop policy if exists "Customers visible to staff and self" on public.customers;
create policy "Customers visible to staff and self"
  on public.customers for select
  using (
    auth_user_id = auth.uid()
    or public.can_see_record('customers', id, created_by, 'all')
  );

-- Align update with visibility (default 'all' ⇒ no change today; a narrowed
-- user can only edit what they can see).
drop policy if exists "Staff can update customers" on public.customers;
create policy "Staff can update customers"
  on public.customers for update
  using (public.can_see_record('customers', id, created_by, 'all'))
  with check (public.can_see_record('customers', id, created_by, 'all'));
