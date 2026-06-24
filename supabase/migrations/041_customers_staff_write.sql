-- ============================================================
-- Migration 041: let field workers create/update customers
-- ------------------------------------------------------------
-- Field workers submit site surveys (quote_requests), and the survey form now
-- resolves-or-creates the customer record as part of submission. The 040
-- insert/update policies only allowed manager/admin, which would block a field
-- worker's survey. Broaden insert + update to all staff; delete stays
-- manager/admin only.
-- ============================================================

drop policy if exists "Managers can insert customers" on public.customers;
create policy "Staff can insert customers"
  on public.customers for insert
  with check (public.current_role() in ('field_worker', 'manager', 'admin'));

drop policy if exists "Managers can update customers" on public.customers;
create policy "Staff can update customers"
  on public.customers for update
  using (public.current_role() in ('field_worker', 'manager', 'admin'));
