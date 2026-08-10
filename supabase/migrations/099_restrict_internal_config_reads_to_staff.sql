-- 099_restrict_internal_config_reads_to_staff.sql
-- ============================================================================
-- Follow-up to 098. A sweep for the same over-broad pattern
-- (`using (auth.uid() is not null)`, which every customer login satisfies) found
-- four more tables. None hold cost or margin data — that was 098 — so these are
-- lower severity: internal configuration and operational telemetry with no
-- customer use case.
--
--   equipment_brands       brand vocabulary for the catalog pickers
--   product_research       AI research results per catalog item (incl. rejected
--                          candidates and confidence scores)
--   quote_tier_configs     which inverter/battery/panel we put in each quote tier
--                          for each system size — our recommendation logic
--   supplier_refresh_state price-refresh run cursors, stats and last_run_summary
--
-- Verified before restricting: every reader is a staff-only page or route
-- (settings/brands, quotes-v2/new, settings/catalog research, settings/
-- tier-configs); supplier_refresh_state has no direct reads in the app at all.
-- No customer-facing page touches any of them, so nothing breaks.
-- ============================================================================

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
