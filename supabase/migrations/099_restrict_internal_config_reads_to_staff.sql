-- 099_restrict_internal_config_reads_to_staff.sql
-- Applied to production 2026-08-10 10:28 (version 20260810102840) as
-- `restrict_internal_config_reads_to_staff`, after the review branch that
-- produced 094-098 was cut, so it was the one fix that branch did not capture.
-- Recovered from supabase_migrations.schema_migrations.
--
-- Direct follow-up to 098: the same over-broad `auth.uid() is not null` SELECT
-- policy on four more tables. No cost/margin data here — internal config and
-- telemetry with no customer use case. Every reader was verified staff-only
-- before restricting.

drop policy if exists "Authenticated users can read brands" on public.equipment_brands;
create policy "Staff can read brands"
  on public.equipment_brands for select
  using (public.current_role() in ('field_worker', 'manager', 'admin'));

drop policy if exists "Authenticated users can read product research" on public.product_research;
create policy "Staff can read product research"
  on public.product_research for select
  using (public.current_role() in ('field_worker', 'manager', 'admin'));

drop policy if exists "Authenticated users can read quote tier configs" on public.quote_tier_configs;
create policy "Staff can read quote tier configs"
  on public.quote_tier_configs for select
  using (public.current_role() in ('field_worker', 'manager', 'admin'));

drop policy if exists "Authenticated can read refresh state" on public.supplier_refresh_state;
create policy "Staff can read refresh state"
  on public.supplier_refresh_state for select
  using (public.current_role() in ('field_worker', 'manager', 'admin'));
