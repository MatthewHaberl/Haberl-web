-- ============================================================
-- Migration 083: Budget — plan vs actual, cash flow, commitments, goals
-- ------------------------------------------------------------
-- Adds a budgeting layer on top of the existing finance section. The key
-- design choice: ACTUAL spend is derived from the bank feed (real cash out),
-- by the company category already tagged on transactions — no new data entry
-- for business actuals. Personal spend (no bank feed yet) is entered manually.
--
-- Tables
--   budget_categories     the lines you plan against (business | personal)
--   budget_plans          planned amount per category per month
--   budget_commitments    recurring known costs (subs, insurance, gym…)
--   budget_goals          savings / set-aside targets
--   budget_manual_actuals manual actual spend (personal, or cash not on bank)
--
-- RPCs
--   budget_actuals(from,to)   business spend by company-category by month
--   budget_cashflow(months)   money in/out/net per month, last N months
--   budget_balances()         latest running balance per bank account
--
-- All manager/admin only, matching the rest of finance (RLS via current_role()).
-- ============================================================

-- ── 1. budget_categories ──────────────────────────────────────
create table if not exists public.budget_categories (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null default 'business' check (scope in ('business','personal')),
  kind        text not null default 'expense'  check (kind in ('expense','income')),
  name        text not null,
  -- For business expense lines: the company-allocation category strings that
  -- roll up into this budget line (defaults to {name}). Lets one budget line
  -- aggregate several bank tags, and keeps actuals auto-linked to existing tags.
  match_keys  text[] not null default '{}',
  sort_order  int not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists budget_categories_scope_idx on public.budget_categories (scope) where archived_at is null;

drop trigger if exists budget_categories_touch on public.budget_categories;
create trigger budget_categories_touch before update on public.budget_categories
  for each row execute function public.fin_touch_updated_at();

-- ── 2. budget_plans ───────────────────────────────────────────
create table if not exists public.budget_plans (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.budget_categories(id) on delete cascade,
  month        date not null,                       -- first of month (normalised app-side)
  planned_cents bigint not null default 0,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (category_id, month)
);

create index if not exists budget_plans_month_idx on public.budget_plans (month);

drop trigger if exists budget_plans_touch on public.budget_plans;
create trigger budget_plans_touch before update on public.budget_plans
  for each row execute function public.fin_touch_updated_at();

-- ── 3. budget_commitments ─────────────────────────────────────
create table if not exists public.budget_commitments (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null default 'business' check (scope in ('business','personal')),
  category_id uuid references public.budget_categories(id) on delete set null,
  name        text not null,
  amount_cents bigint not null,
  cadence     text not null default 'monthly'
                check (cadence in ('weekly','monthly','quarterly','annual','once')),
  due_day     int check (due_day between 1 and 31),  -- day-of-month for recurring
  next_due    date,                                  -- explicit next date (annual/once)
  active      boolean not null default true,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists budget_commitments_active_idx on public.budget_commitments (active);

drop trigger if exists budget_commitments_touch on public.budget_commitments;
create trigger budget_commitments_touch before update on public.budget_commitments
  for each row execute function public.fin_touch_updated_at();

-- ── 4. budget_goals ───────────────────────────────────────────
create table if not exists public.budget_goals (
  id           uuid primary key default gen_random_uuid(),
  scope        text not null default 'business' check (scope in ('business','personal')),
  name         text not null,
  target_cents bigint not null,
  saved_cents  bigint not null default 0,
  target_date  date,
  note         text,
  achieved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists budget_goals_touch on public.budget_goals;
create trigger budget_goals_touch before update on public.budget_goals
  for each row execute function public.fin_touch_updated_at();

-- ── 5. budget_manual_actuals ──────────────────────────────────
-- Actual spend that isn't on the business bank feed: personal categories, or
-- cash spend. Keyed to a budget category + month; summed into the actual.
create table if not exists public.budget_manual_actuals (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.budget_categories(id) on delete cascade,
  month        date not null,                       -- first of month
  amount_cents bigint not null,
  note         text,
  created_by   uuid references public.user_profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists budget_manual_actuals_cat_month_idx
  on public.budget_manual_actuals (category_id, month);

drop trigger if exists budget_manual_actuals_touch on public.budget_manual_actuals;
create trigger budget_manual_actuals_touch before update on public.budget_manual_actuals
  for each row execute function public.fin_touch_updated_at();

-- ── 6. RLS: manager / admin only (matches finance) ────────────
alter table public.budget_categories     enable row level security;
alter table public.budget_plans          enable row level security;
alter table public.budget_commitments    enable row level security;
alter table public.budget_goals          enable row level security;
alter table public.budget_manual_actuals enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'budget_categories','budget_plans','budget_commitments',
    'budget_goals','budget_manual_actuals'
  ] loop
    execute format('drop policy if exists "Managers manage %1$s" on public.%1$s', t);
    execute format(
      'create policy "Managers manage %1$s" on public.%1$s for all '
      || 'using (public.current_role() in (''manager'',''admin'')) '
      || 'with check (public.current_role() in (''manager'',''admin''))', t);
  end loop;
end $$;

-- ── 7. budget_actuals: business spend by company-category/month ──
-- Two clean sources, both keyed to the bank transaction's date so the figure
-- is real cash that left the bank:
--   A. explicit company splits (bank_txn_allocations target=company)
--   B. whole transactions tagged company_expense with NO split rows; category
--      from the matched invoice's company allocation, else 'Uncategorised'.
-- Money-out only (parent amount_cents < 0); magnitudes returned positive.
create or replace function public.budget_actuals(
  p_from date default null,
  p_to   date default null
) returns table(month date, category text, spent_cents bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with split_company as (
    select date_trunc('month', t.txn_date)::date as month,
           coalesce(nullif(btrim(ba.category), ''), 'Uncategorised') as category,
           ba.amount_cents as cents
    from public.bank_txn_allocations ba
    join public.bank_transactions t on t.id = ba.txn_id
    where ba.target = 'company'
      and t.amount_cents < 0
      and (p_from is null or t.txn_date >= p_from)
      and (p_to   is null or t.txn_date <= p_to)
  ),
  whole_company as (
    select date_trunc('month', t.txn_date)::date as month,
           coalesce(
             (select nullif(btrim(fa.category), '')
                from public.fin_allocations fa
               where fa.document_id = t.matched_document_id
                 and fa.target = 'company'
               limit 1),
             'Uncategorised') as category,
           (- t.amount_cents) as cents
    from public.bank_transactions t
    where t.txn_type = 'company_expense'
      and t.amount_cents < 0
      and not exists (select 1 from public.bank_txn_allocations ba where ba.txn_id = t.id)
      and (p_from is null or t.txn_date >= p_from)
      and (p_to   is null or t.txn_date <= p_to)
  ),
  unioned as (
    select * from split_company
    union all
    select * from whole_company
  )
  select month, category, sum(cents)::bigint as spent_cents
  from unioned
  group by month, category;
$$;

-- ── 8. budget_cashflow: money in/out/net per month, last N months ──
create or replace function public.budget_cashflow(p_months int default 6)
returns table(month date, money_in bigint, money_out bigint, net bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select date_trunc('month', t.txn_date)::date as month,
         coalesce(sum(t.amount_cents) filter (where t.amount_cents > 0), 0)::bigint as money_in,
         coalesce(sum(t.amount_cents) filter (where t.amount_cents < 0), 0)::bigint as money_out,
         coalesce(sum(t.amount_cents), 0)::bigint as net
  from public.bank_transactions t
  where t.txn_date >= (date_trunc('month', current_date) - ((greatest(p_months,1) - 1) || ' months')::interval)::date
  group by 1
  order by 1;
$$;

-- ── 9. budget_balances: latest running balance per bank account ──
-- Reserves at a glance: the most recent statement balance for each account.
create or replace function public.budget_balances()
returns table(account_label text, as_of date, balance_cents bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (t.account_label)
         t.account_label,
         t.txn_date as as_of,
         t.balance_cents
  from public.bank_transactions t
  where t.balance_cents is not null
  order by t.account_label, t.txn_date desc, t.id desc;
$$;

-- ── 10. seed default categories ───────────────────────────────
-- Business expense lines mirror COMPANY_CATEGORIES used by the allocation UI,
-- so existing bank tags roll up immediately. Personal lines seed the recurring
-- costs from the expense-reduction audit. match_keys default to {name}.
insert into public.budget_categories (scope, kind, name, match_keys, sort_order)
select * from (values
  ('business','expense','Tools',                 array['Tools'],                 10),
  ('business','expense','Consumables',            array['Consumables'],           20),
  ('business','expense','Materials & components', array['Materials & components'],30),
  ('business','expense','Vehicle & fuel',         array['Vehicle & fuel'],        40),
  ('business','expense','Office & admin',         array['Office & admin'],        50),
  ('business','expense','Refreshments',           array['Refreshments'],          60),
  ('business','expense','Subcontractor',          array['Subcontractor'],         70),
  ('business','expense','Other',                  array['Other'],                 80),
  ('personal','expense','Insurance',              array[]::text[],               110),
  ('personal','expense','Gym & fitness',          array[]::text[],               120),
  ('personal','expense','Subscriptions',          array[]::text[],               130),
  ('personal','expense','Bank & fees',            array[]::text[],               140)
) as seed(scope, kind, name, match_keys, sort_order)
where not exists (select 1 from public.budget_categories);
