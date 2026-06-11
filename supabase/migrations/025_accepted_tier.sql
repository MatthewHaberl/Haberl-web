-- Multi-tier quotes: record which tier the customer accepted so the job BOM
-- is seeded from the chosen option instead of always 'recommended'.
alter table public.quote_requests
  add column if not exists accepted_tier text;
