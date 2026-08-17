-- ============================================================================
-- Migration 113: issuing and reversing a payslip, atomically.
-- ----------------------------------------------------------------------------
-- Creating a payslip is three writes — insert the slip, stamp its time entries,
-- stamp its payments. Done from the browser those are three round-trips, and a
-- failure between them leaves either hours paid twice or a slip with no working
-- behind it. Both are wage errors, so both live in one transaction here.
--
-- The ARITHMETIC is not in here on purpose: gross pay is computed by
-- lib/staff/pay.ts, which is pure and unit-tested. This function only persists
-- the result and claims the rows it was computed from — and refuses if anything
-- has moved underneath it since.
--
-- security invoker (the default): RLS still applies, so only a manager/admin
-- can issue a payslip.
-- ============================================================================

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
  p_payment_ids    uuid[]
) returns uuid
language plpgsql
set search_path = public
as $fn$
declare
  v_payslip_id uuid;
  v_claimed    integer;
  v_expected   integer;
begin
  insert into public.payslips (
    staff_id, reference, period_start, period_end,
    normal_hours, overtime_hours,
    hours_pay_r, piece_pay_r, other_pay_r, gross_pay_r,
    -- No statutory deductions yet, so net is gross. When PAYE/UIF land, the
    -- caller passes them and this line becomes a subtraction.
    deductions_r, net_pay_r,
    status, lines, created_by
  ) values (
    p_staff_id, p_reference, p_period_start, p_period_end,
    coalesce(p_normal_hours, 0), coalesce(p_overtime_hours, 0),
    coalesce(p_hours_pay_r, 0), coalesce(p_piece_pay_r, 0),
    coalesce(p_other_pay_r, 0), coalesce(p_gross_pay_r, 0),
    0, coalesce(p_gross_pay_r, 0),
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

  return v_payslip_id;
end;
$fn$;

comment on function public.create_payslip is
  'Issue a payslip and claim its timesheet entries and payments in one transaction. Rolls back if anything was claimed by another run first.';

-- ----------------------------------------------------------------------------
-- Reversing a run: release the rows so they can be paid on a corrected slip.
-- Entries go back to 'approved' rather than 'submitted' — they were already
-- signed off once, and demoting them would invite a second approval pass.
-- ----------------------------------------------------------------------------
create or replace function public.delete_payslip(p_payslip_id uuid)
returns void
language plpgsql
set search_path = public
as $fn$
declare
  v_status text;
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

  update public.staff_payments
     set payslip_id = null
   where payslip_id = p_payslip_id;

  delete from public.payslips where id = p_payslip_id;
end;
$fn$;

comment on function public.delete_payslip is
  'Reverse a payslip, releasing its entries and payments back to unpaid. Refuses once the slip is marked paid.';
