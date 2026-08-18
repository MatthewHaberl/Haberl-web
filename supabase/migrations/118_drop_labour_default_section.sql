-- ─────────────────────────────────────────────────────────────────────────────
-- 118 — Labour is not a section you seed into a quote.
--
-- The scope builder prices labour in its own block (hourly / day rate / fixed /
-- crew) and scopeToBom emits that as a "Labour" section on the generated quote.
-- Seeding "Labour" into work_types.default_sections therefore handed every new
-- scope quote an empty Labour heading to delete, sitting above the block that
-- was already producing the real line.
--
-- Data only — sections already saved on existing quote_requests.scope are left
-- alone (an empty one contributes nothing to the BOM; the builder drops it on
-- open).
-- ─────────────────────────────────────────────────────────────────────────────

update public.work_types
set default_sections = array_remove(default_sections, 'Labour')
where 'Labour' = any(default_sections);
