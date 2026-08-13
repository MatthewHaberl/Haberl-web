-- 107: real labour rates + a team day rate for the non-solar scope engine.
--
-- The W97 scope builder shipped with placeholder rates (R650/hr, R450 call-out).
-- Matthew's actual rates: R750/hr with a one-hour minimum (the call-out fee IS
-- that minimum — labourAmountR does not bill the first hour twice), and
-- R5 500/day for the standard team of four on full-day work.

alter table public.company_settings
  add column if not exists labour_day_rate_rands numeric not null default 5500;

comment on column public.company_settings.labour_day_rate_rands is
  'R/day for the standard on-site team (4 people). Seeds scope labour "daily" mode.';
comment on column public.company_settings.callout_fee_rands is
  'Call-out fee. Also acts as the one-hour minimum: the first hour is covered by this fee.';

update public.company_settings
   set labour_hourly_rate_rands = 750,
       callout_fee_rands        = 750,
       labour_day_rate_rands    = 5500;
