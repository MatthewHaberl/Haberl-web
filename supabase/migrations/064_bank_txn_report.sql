-- ============================================================
-- Migration 062: bank_transactions reporting RPC
-- ------------------------------------------------------------
-- Powers the Finance → Bank Statements viewer. One stable function
-- returns the headline totals for the current filter plus a per-account
-- breakdown (so the account cards show live counts within the search).
--
-- Row listing itself is a normal paginated select in the page; this RPC
-- only does the aggregates so we never have to pull every row to sum them.
--
-- SECURITY INVOKER: the caller's RLS on bank_transactions still applies,
-- so this stays manager/admin-only just like the table.
-- ============================================================

create or replace function public.bank_txn_report(
  p_account text default null,
  p_q       text default null,
  p_from    date default null,
  p_to      date default null,
  p_dir     text default null   -- 'in' | 'out' | 'all'/null
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
    )
  );
$$;
