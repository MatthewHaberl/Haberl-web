-- 121: per-quote switches for the optional customer-document sections.
--
-- "What You're Getting" is the photo strip of catalog-backed kit. It sells a
-- solar system (panels, inverter, battery) but embarrasses a small board swap,
-- where the same panel renders six near-identical photos of breakers and
-- terminal bars — the customer sees the parts list they were never meant to be
-- shopping, and it is the wrong first impression of the price.
--
-- Off is a per-quote decision, not a company default: the same crew sends both
-- kinds of quote in a week. Default true, so every existing quote keeps the
-- document it already has.

alter table public.quote_requests
  add column if not exists show_equipment_photos boolean not null default true;

comment on column public.quote_requests.show_equipment_photos is
  'Render the "What You''re Getting" product-photo panel on the customer quote. Takes effect on the next generate.';
