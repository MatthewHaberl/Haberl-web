-- 036_quote_tariff_rate.sql
-- Persist the per-quote tariff. The Energy-section tariff was session-only and
-- reset to the municipality default on reload; this makes an adjusted tariff
-- stick to the job until manually changed.
alter table public.quote_requests
  add column if not exists tariff_rate numeric;
