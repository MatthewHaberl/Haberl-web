-- 049_catalog_pending_flag.sql
-- "To-add" queue for the design canvas. When a designer needs a part that isn't
-- in the catalog yet (e.g. an indicator light), they can quick-add a custom
-- placeholder label NOW. The placeholder is flagged `pending` so it surfaces
-- later in the catalog admin as "needs adding / pricing".
--
-- SAFETY: additive, backward-compatible. `pending` defaults false, so every
-- existing row stays a normal, fully-specified catalog item. Quoting reads
-- `active` (unchanged); the calculator ignores `pending`.

alter table public.equipment_catalog
  add column if not exists pending boolean not null default false;

comment on column public.equipment_catalog.pending is
  'When true, this row is a placeholder created from the design canvas custom quick-add — it still needs a real SKU, cost and spec before it is a usable catalog item. Surfaces in catalog admin as a "to-add" queue. Independent of `active` (quote visibility) and `show_on_store`.';
