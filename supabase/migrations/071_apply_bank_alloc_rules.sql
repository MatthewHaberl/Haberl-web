-- ============================================================
-- Migration 071: apply auto-allocation rules
-- ------------------------------------------------------------
-- Sweeps every rule in bank_alloc_rules over the still-loose transactions
-- (no whole-txn customer, no split rows) and applies a match:
--   * customer rule → set the whole-txn allocated_customer_id
--   * company rule  → add a whole-amount company split row (with category)
-- Returns how many transactions each kind touched. SECURITY INVOKER so the
-- caller's manager/admin RLS governs the writes.
-- ============================================================

create or replace function public.apply_bank_alloc_rules()
returns json
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
  n int;
  v_customer int := 0;
  v_company  int := 0;
begin
  for r in select * from public.bank_alloc_rules order by created_at loop
    if r.target = 'customer' then
      update public.bank_transactions t
        set allocated_customer_id = r.customer_id
      where t.allocated_customer_id is null
        and t.description ilike '%' || r.pattern || '%'
        and not exists (select 1 from public.bank_txn_allocations s where s.txn_id = t.id);
      get diagnostics n = row_count;
      v_customer := v_customer + n;
    else
      insert into public.bank_txn_allocations (txn_id, target, category, amount_cents, note)
      select t.id, 'company', r.category, abs(t.amount_cents),
             coalesce(r.note, 'Auto-rule: ' || r.pattern)
      from public.bank_transactions t
      where t.allocated_customer_id is null
        and t.amount_cents <> 0
        and t.description ilike '%' || r.pattern || '%'
        and not exists (select 1 from public.bank_txn_allocations s where s.txn_id = t.id);
      get diagnostics n = row_count;
      v_company := v_company + n;
    end if;
  end loop;
  return json_build_object('customer_applied', v_customer, 'company_applied', v_company);
end;
$$;
