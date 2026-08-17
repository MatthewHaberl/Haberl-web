-- ============================================================================
-- Migration 115: advances and deductions actually come off the pay.
-- ----------------------------------------------------------------------------
-- 112 recorded advances and deductions but never subtracted them, and 113's
-- create_payslip hard-coded deductions_r to 0. A slip that shows gross while
-- an advance is outstanding tells the person being paid the wrong number, so
-- both halves close here.
--
-- The hard case is an advance BIGGER than the week it lands in. A payslip
-- cannot ask somebody for money, so the recovery stops at zero and the rest
-- carries: `recovered_r` is how much of a row earlier slips already took, and
-- `payslip_id` is now only stamped once a row is fully recovered. Anything
-- with a balance keeps appearing in the next pay run until it is settled.
--
-- The arithmetic still lives in lib/staff/pay.ts (pure, unit-tested) — this
-- function only persists what it decided and claims the rows it was computed
-- from, refusing if anything moved underneath it.
-- ============================================================================

alter table public.staff_payments
  add column if not exists recovered_r numeric not null default 0;

comment on column public.staff_payments.recovered_r is
  'Advances/deductions: how much earlier payslips have already recovered. The row keeps carrying until recovered_r = amount_r, at which point payslip_id names the slip that settled it.';

-- Nobody may recover more than was advanced. The guarded UPDATE below is the
-- only writer; this is the backstop against a hand-run correction.
alter table public.staff_payments
  drop constraint if exists staff_payments_recovered_within_amount;
alter table public.staff_payments
  add constraint staff_payments_recovered_within_amount
  check (recovered_r >= 0 and recovered_r <= amount_r);

-- ----------------------------------------------------------------------------
-- create_payslip, now with the deduction pass.
--
-- Dropped rather than replaced: the signature grows two parameters, and
-- `create or replace` would leave the 13-argument version behind as an
-- overload that every existing call is ambiguous against. The new parameters
-- default, so a browser still holding the old bundle issues gross-only slips
-- for the few minutes between this migration and the deploy rather than
-- failing outright.
-- ----------------------------------------------------------------------------
drop function if exists public.create_payslip(
  uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, uuid[], uuid[]
);

create or replace function public.create_payslip(
  p_staff_id       uuid,
  p_reference      text,
  p_period_start   date,
  p_period_end     date,
  p_normal_hours   numeric,
  p_overtime_hours numeric,
  p_hours_pay_r    numeric,
  p_piece_pay_r    numeric,
  p_other_pay_r    numeric,
  p_gross_pay_r    numeric,
  p_lines          jsonb,
  p_entry_ids      uuid[],
  p_payment_ids    uuid[],
  p_deductions_r   numeric default 0,
  -- [{ "paymentId": uuid, "amountR": numeric }] — what this slip takes back
  -- off each outstanding advance or deduction.
  p_recoveries     jsonb   default '[]'::jsonb
) returns uuid
language plpgsql
set search_path = public
as $fn$
declare
  v_payslip_id uuid;
  v_claimed    integer;
  v_expected   integer;
  v_deductions numeric := coalesce(p_deductions_r, 0);
  v_gross      numeric := coalesce(p_gross_pay_r, 0);
  v_rec        record;
begin
  -- Net pay is a payment, never a demand. If the caller asks to recover more
  -- than was earned, the split it computed is wrong and none of this should
  -- be written.
  if v_deductions > v_gross then
    raise exception 'Deductions (%) exceed gross pay (%) — a payslip cannot pay a negative amount.',
      v_deductions, v_gross;
  end if;

  insert into public.payslips (
    staff_id, reference, period_start, period_end,
    normal_hours, overtime_hours,
    hours_pay_r, piece_pay_r, other_pay_r, gross_pay_r,
    -- Advances and deductions recovered here. PAYE/UIF/SDL remain out of
    -- scope by Matthew's decision, so this is not a statutory net.
    deductions_r, net_pay_r,
    status, lines, created_by
  ) values (
    p_staff_id, p_reference, p_period_start, p_period_end,
    coalesce(p_normal_hours, 0), coalesce(p_overtime_hours, 0),
    coalesce(p_hours_pay_r, 0), coalesce(p_piece_pay_r, 0),
    coalesce(p_other_pay_r, 0), v_gross,
    v_deductions, v_gross - v_deductions,
    'finalised', coalesce(p_lines, '[]'::jsonb), auth.uid()
  )
  returning id into v_payslip_id;

  -- Claim the timesheet entries. `payslip_id is null` is the race guard: if a
  -- second pay run grabbed them while this one was being reviewed, fewer rows
  -- update than were asked for and the whole thing rolls back rather than
  -- quietly paying half a week.
  v_expected := coalesce(array_length(p_entry_ids, 1), 0);
  if v_expected > 0 then
    update public.time_entries
       set payslip_id = v_payslip_id,
           status     = 'paid'
     where id = any (p_entry_ids)
       and staff_id = p_staff_id
       and payslip_id is null;
    get diagnostics v_claimed = row_count;

    if v_claimed <> v_expected then
      raise exception
        'Timesheet changed while this pay run was open (% of % entries still available). Reload and run it again.',
        v_claimed, v_expected;
    end if;
  end if;

  -- Earnings — piece work, bonuses, allowances — are claimed outright.
  v_expected := coalesce(array_length(p_payment_ids, 1), 0);
  if v_expected > 0 then
    update public.staff_payments
       set payslip_id = v_payslip_id
     where id = any (p_payment_ids)
       and staff_id = p_staff_id
       and payslip_id is null;
    get diagnostics v_claimed = row_count;

    if v_claimed <> v_expected then
      raise exception
        'Payments changed while this pay run was open (% of % still available). Reload and run it again.',
        v_claimed, v_expected;
    end if;
  end if;

  -- Advances and deductions are claimed only as far as this slip could afford.
  -- `amount_r - recovered_r >= the amount asked` is the same race guard one
  -- level down: two runs cannot both take the last R500 off an advance,
  -- because the second reads the first's committed balance and fails its row
  -- count.
  for v_rec in
    select (x->>'paymentId')::uuid                as payment_id,
           coalesce((x->>'amountR')::numeric, 0)  as amount_r
      from jsonb_array_elements(coalesce(p_recoveries, '[]'::jsonb)) x
  loop
    continue when v_rec.amount_r <= 0;

    update public.staff_payments
       set recovered_r = recovered_r + v_rec.amount_r,
           -- A settled row stops carrying and belongs to this slip; a partly
           -- recovered one stays unclaimed so the next run still finds it.
           payslip_id  = case when recovered_r + v_rec.amount_r >= amount_r
                              then v_payslip_id
                              else payslip_id end
     where id = v_rec.payment_id
       and staff_id = p_staff_id
       and payslip_id is null
       and kind in ('advance', 'deduction')
       and amount_r - recovered_r >= v_rec.amount_r;
    get diagnostics v_claimed = row_count;

    if v_claimed <> 1 then
      raise exception
        'An advance or deduction changed while this pay run was open (%). Reload and run it again.',
        v_rec.payment_id;
    end if;
  end loop;

  return v_payslip_id;
end;
$fn$;

comment on function public.create_payslip is
  'Issue a payslip and claim its timesheet entries, earnings and advance recoveries in one transaction. Rolls back if anything was claimed by another run first.';

-- ----------------------------------------------------------------------------
-- Reversing a run also has to hand back what it recovered.
--
-- The slip's own frozen `lines` are the record of that: every deduction line
-- carries the staff_payments row it came off and the amount it took, so a
-- reversal restores exactly that balance — including the partial recoveries
-- nothing else in the schema remembers.
-- ----------------------------------------------------------------------------
create or replace function public.delete_payslip(p_payslip_id uuid)
returns void
language plpgsql
set search_path = public
as $fn$
declare
  v_status text;
  v_rec    record;
begin
  select status into v_status from public.payslips where id = p_payslip_id;
  if v_status is null then
    raise exception 'Payslip not found';
  end if;
  if v_status = 'paid' then
    raise exception 'This payslip is marked as paid — mark it unpaid before deleting it';
  end if;

  update public.time_entries
     set payslip_id = null,
         status     = 'approved'
   where payslip_id = p_payslip_id;

  for v_rec in
    select (l->>'paymentId')::uuid               as payment_id,
           coalesce((l->>'amountR')::numeric, 0) as amount_r
      from public.payslips p
      cross join lateral jsonb_array_elements(coalesce(p.lines, '[]'::jsonb)) l
     where p.id = p_payslip_id
       and l->>'kind' in ('advance', 'deduction')
       and l->>'paymentId' is not null
  loop
    update public.staff_payments
       set recovered_r = greatest(0, recovered_r - v_rec.amount_r)
     where id = v_rec.payment_id;
  end loop;

  update public.staff_payments
     set payslip_id = null
   where payslip_id = p_payslip_id;

  delete from public.payslips where id = p_payslip_id;
end;
$fn$;

comment on function public.delete_payslip is
  'Reverse a payslip: release its entries, unclaim its earnings and give every advance back the balance this slip recovered. Refuses once the slip is marked paid.';
