-- 098_restrict_supplier_cost_data_to_staff.sql
-- ============================================================================
-- Security fix: supplier cost / margin data was readable by ANY authenticated
-- user — which includes customer logins.
--
-- Four tables used `using (auth.uid() is not null)` for SELECT, and a customer
-- account satisfies that:
--   equipment_catalog          — cost_rands
--   equipment_supplier_offers  — cost_rands, discount_pct
--   supplier_pricelist_lines   — list_price, discount_pct, generated net_price
--   supplier_pricelists        — price-list batch headers
-- plus db_assemblies, which used `using (true)` for both SELECT and INSERT.
--
-- A customer could read our wholesale buy prices and account discounts straight
-- from the browser client. Restrict all reads to staff.
--
-- ⚠️ APPLY THIS *AFTER* DEPLOYING THE CODE CHANGE IN THE SAME COMMIT.
-- Production currently runs the old shop page, which reads equipment_catalog on
-- the session client. Applying this migration before that deploy would blank the
-- spec/datasheet panel for logged-in customers until the deploy lands. Deploy
-- first, then apply — there is then no gap. (Applying early is safe otherwise:
-- it only removes a read that should never have been granted.)
--
-- Public-shop impact: app/shop/[slug]/page.tsx read equipment_catalog with
-- `select('*')` on the session client for spec/datasheet display. That is changed
-- in the same commit to use the service-role client with an explicit column
-- allowlist (no cost columns) — which also fixes the specs never rendering for
-- logged-out visitors, since anonymous callers never satisfied the old policy.
-- ============================================================================

-- equipment_catalog ----------------------------------------------------------
drop policy if exists "Authenticated users can read equipment catalog" on public.equipment_catalog;
create policy "Staff can read equipment catalog"
  on public.equipment_catalog for select
  using (public.current_role() in ('field_worker', 'manager', 'admin'));

-- equipment_supplier_offers --------------------------------------------------
drop policy if exists "Authenticated can read supplier offers" on public.equipment_supplier_offers;
create policy "Staff can read supplier offers"
  on public.equipment_supplier_offers for select
  using (public.current_role() in ('field_worker', 'manager', 'admin'));

-- supplier price lists -------------------------------------------------------
drop policy if exists "Authenticated can read pricelists" on public.supplier_pricelists;
create policy "Staff can read pricelists"
  on public.supplier_pricelists for select
  using (public.current_role() in ('field_worker', 'manager', 'admin'));

drop policy if exists "Authenticated can read pricelist lines" on public.supplier_pricelist_lines;
create policy "Staff can read pricelist lines"
  on public.supplier_pricelist_lines for select
  using (public.current_role() in ('field_worker', 'manager', 'admin'));

-- db_assemblies --------------------------------------------------------------
-- Internal DB-builder board layouts; `using (true)` let customers read and insert.
drop policy if exists "db_assemblies_auth_select" on public.db_assemblies;
create policy "db_assemblies_staff_select"
  on public.db_assemblies for select
  using (public.current_role() in ('field_worker', 'manager', 'admin'));

drop policy if exists "db_assemblies_auth_insert" on public.db_assemblies;
create policy "db_assemblies_staff_insert"
  on public.db_assemblies for insert
  with check (public.current_role() in ('field_worker', 'manager', 'admin'));
