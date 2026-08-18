-- 122: the running total of a quote that hasn't been generated yet.
--
-- quote_requests.total_amount is only written by /generate, so the list showed a
-- price for one quote in ten — every draft read as blank and you had to open
-- each one to find out which job you were looking at.
--
-- Scope quotes need no column: a scope line stamps its own sell price, so the
-- list derives their total straight from the `scope` JSONB and can never go
-- stale. A solar design stores catalog IDs and nothing else — pricing it needs
-- the 15k-row catalog, which the list page has no business loading. So the
-- canvas writes its own working total here as it saves, the same debounce that
-- writes system_design.
--
-- Nullable on purpose: NULL means "never priced in the canvas", which the list
-- renders as no figure rather than as R0.

alter table public.quote_requests
  add column if not exists working_total_rands numeric;

comment on column public.quote_requests.working_total_rands is
  'Solar-engine draft total (rands, incl. markup) written by the design canvas as it autosaves. Superseded by total_amount once the quote is generated; scope quotes derive theirs from `scope` instead.';
