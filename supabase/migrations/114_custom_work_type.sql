-- 112_custom_work_type.sql — "Custom quote" work type (free-form sections)
--
-- Data-only. A scope-engine type that seeds NO sections: the quote starts blank
-- and you add whatever headings the job needs as you go. Sits last in the
-- picker (sort 8, after ev_charger). DEFAULT_WORK_TYPES in
-- lib/quotes/work-types.ts mirrors this row and must stay in sync.

insert into public.work_types (code, label, engine, job_pipeline, default_sections, description, sort_order) values
  ('custom', 'Custom quote — build your own', 'scope', 'lite', '{}',
   'Start blank and add sections as you go — anything that does not fit the types above.', 8)
on conflict (code) do nothing;
