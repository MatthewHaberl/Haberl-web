-- 120: a management fee on scope labour.
--
-- Matthew is often on site to drive, supervise and carry the admin without
-- laying a hand on the work — two staff on the tools, him running the job. None
-- of the four labour modes bill that: crew mode prices the people who are
-- working, the day rate is the team's, and the call-out only covers getting a
-- technician to a fault. So the trip, the supervision and the paperwork were
-- being given away on every job he didn't personally work.
--
-- A flat per-job fee, defaulted here and switched off on the quote for the jobs
-- he is physically working (where his own hours already bill).
--
-- It rides INSIDE the single customer-facing "Labour" line — deliberately not a
-- separate "management fee" row, which is the one line item a domestic customer
-- always argues with. Internally it reads as pure margin: it is Matthew's own
-- time, not a wage the business pays out, so it adds to sell and not to cost.

alter table public.company_settings
  add column if not exists management_fee_rands   numeric not null default 750,
  add column if not exists management_fee_default boolean not null default true;

comment on column public.company_settings.management_fee_rands is
  'Flat per-job supervision/admin fee folded into scope labour. Editable per quote.';
comment on column public.company_settings.management_fee_default is
  'Whether new scope quotes open with the management fee switched on.';
