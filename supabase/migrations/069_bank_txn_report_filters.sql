-- ============================================================
-- Migration 069: bank_txn_report — customer + amount filters, account list
-- ------------------------------------------------------------
-- Extends the Bank Statements report RPC so the headline totals and the
-- per-account cards stay in sync with two new filters:
--   * p_customer — 'all' (default/none), 'none' (unallocated only), or a
--                  customer uuid (as text).
--   * p_min / p_max — absolute amount window in CENTS (sign-agnostic; pair
--                  with p_dir for money-in / money-out).
-- Also returns `all_accounts`: every distinct account label regardless of the
-- current filter, so the account dropdown can always offer every account.
--
-- Signature changes, so we drop the old function first.
-- SECURITY INVOKER keeps it manager/admin-only via the caller's RLS.
-- ============================================================

drop function if exists public.bank_txn_report(text, text, date, date, text);

create or replace function public.bank_txn_report(
  p_account  text default null,
  p_q        text default null,
  p_from     date default null,
  p_to       date default null,
  p_dir      text default null,   -- 'in' | 'out' | 'all'/null
  p_customer text default null,   -- 'all'/null | 'none' | <customer uuid>
  p_min      bigint default null, -- absolute cents, lower bound
  p_max      bigint default null  -- absolute cents, upper bound
) returns json
language sql
stable
security invoker
set search_path = public
as $$
  with f as (
    select t.*
    from public.bank_transactions t
    where (p_from is null or t.txn_date >= p_from)
      and (p_to   is null or t.txn_date <= p_to)
      and (p_q    is null or p_q = '' or t.description ilike '%' || p_q || '%')
      and (p_dir  is null or p_dir = 'all'
           or (p_dir = 'in'  and t.amount_cents > 0)
           or (p_dir = 'out' and t.amount_cents < 0))
      and (p_customer is null or p_customer = 'all'
           or (p_customer = 'none' and t.allocated_customer_id is null)
           or t.allocated_customer_id::text = p_customer)
      and (p_min is null or abs(t.amount_cents) >= p_min)
      and (p_max is null or abs(t.amount_cents) <= p_max)
  ),
  scoped as (
    select * from f
    where (p_account is null or p_account = 'all' or account_label = p_account)
  )
  select json_build_object(
    'total_count', (select count(*) from scoped),
    'money_in',    (select coalesce(sum(amount_cents) filter (where amount_cents > 0), 0) from scoped),
    'money_out',   (select coalesce(sum(amount_cents) filter (where amount_cents < 0), 0) from scoped),
    'net',         (select coalesce(sum(amount_cents), 0) from scoped),
    'min_date',    (select min(txn_date) from scoped),
    'max_date',    (select max(txn_date) from scoped),
    'accounts',    (
      select coalesce(json_agg(a order by a.label), '[]'::json)
      from (
        select account_label as label,
               count(*)       as n,
               coalesce(sum(amount_cents) filter (where amount_cents > 0), 0) as money_in,
               coalesce(sum(amount_cents) filter (where amount_cents < 0), 0) as money_out,
               coalesce(sum(amount_cents), 0)                                 as net
        from f
        group by account_label
      ) a
    ),
    'all_accounts', (
      select coalesce(json_agg(label order by label), '[]'::json)
      from (select distinct account_label as label from public.bank_transactions where account_label is not null) s
    )
  );
$$;
