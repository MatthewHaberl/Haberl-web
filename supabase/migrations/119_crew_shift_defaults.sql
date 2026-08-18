-- 119: the crew shift block gets settable defaults.
--
-- "Days on site" and "Hours per day" sit above every crew line on a scope quote
-- and re-price all of them. Until now the opening figures were hardcoded — one
-- day of nine hours, in lib/quotes/scope.ts — so changing the house shift meant
-- a deploy. They join the other labour figures in company_settings, where the
-- hourly rate, day rate and call-out fee already live.
--
-- Nine hours is not an arbitrary default: splitOvertime() in lib/staff/pay.ts
-- starts paying overtime after nine hours in a day, so a day booked onto a quote
-- has to carry nine hours of wages or the quote under-recovers the payslip.
-- Lowering this seeds shorter quoted days; it does NOT move the payroll
-- threshold, which stays at nine.

alter table public.company_settings
  add column if not exists crew_days_default  numeric not null default 1,
  add column if not exists crew_hours_per_day numeric not null default 9;

comment on column public.company_settings.crew_days_default is
  'Opening "Days on site" on a new scope quote''s crew shift block. Half-days allowed.';
comment on column public.company_settings.crew_hours_per_day is
  'Opening "Hours per day" for the crew shift. Also the hr<->day conversion factor on that quote. Payroll overtime still starts at 9h/day.';
