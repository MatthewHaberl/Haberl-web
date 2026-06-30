-- ============================================================
-- Migration 073: extend record-level visibility to Procurement
-- ------------------------------------------------------------
-- Same model as 071/072. The record is `purchase_orders`; the owner is the
-- existing `created_by`. Purchase orders were readable by ALL staff, so the
-- non-manager default is 'all' (nothing changes until an admin narrows someone
-- via the Users dial). Write access stays manager/admin, exactly as before —
-- sharing a PO grants visibility, not edit rights.
--
-- `purchase_order_lines` follow their parent PO's visibility so a narrowed user
-- can't read line detail for orders they can't see.
-- ============================================================

-- ── purchase_orders: scope SELECT, preserve manager/admin writes ──
drop policy if exists "Staff can read purchase orders" on public.purchase_orders;
drop policy if exists "Managers can manage purchase orders" on public.purchase_orders;

create policy "Read purchase orders by visibility"
  on public.purchase_orders for select
  using (public.can_see_record('procurement', id, created_by, 'all'));

create policy "Managers add purchase orders"
  on public.purchase_orders for insert
  with check (public.current_role() in ('manager','admin'));

create policy "Managers update purchase orders"
  on public.purchase_orders for update
  using (public.current_role() in ('manager','admin'))
  with check (public.current_role() in ('manager','admin'));

create policy "Managers delete purchase orders"
  on public.purchase_orders for delete
  using (public.current_role() in ('manager','admin'));

-- ── purchase_order_lines: follow parent PO visibility ──
drop policy if exists "Staff can read purchase order lines" on public.purchase_order_lines;
drop policy if exists "Managers can manage purchase order lines" on public.purchase_order_lines;

create policy "Read purchase order lines by parent"
  on public.purchase_order_lines for select
  using (
    exists (
      select 1 from public.purchase_orders po
      where po.id = purchase_order_lines.po_id
        and public.can_see_record('procurement', po.id, po.created_by, 'all')
    )
  );

create policy "Managers manage purchase order lines"
  on public.purchase_order_lines for all
  using (public.current_role() in ('manager','admin'))
  with check (public.current_role() in ('manager','admin'));
