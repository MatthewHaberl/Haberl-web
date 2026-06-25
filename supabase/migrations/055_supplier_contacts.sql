-- 055_supplier_contacts.sql
-- Multiple contact people per supplier, each with a per-contact "CC on POs" toggle.
-- The supplier's primary email (suppliers.email) stays the PO "To" recipient;
-- any contact flagged cc_on_po is added as CC on the purchase-order email.
-- Additive: nothing reads this table until the PO email route + Suppliers editor
-- are updated, so applying it has no effect on existing behaviour.

create table if not exists public.supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  name text,
  email text,
  phone text,
  role text,
  cc_on_po boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists supplier_contacts_supplier_idx
  on public.supplier_contacts (supplier_id, sort_order);

alter table public.supplier_contacts enable row level security;

create policy "Staff can read supplier contacts"
  on public.supplier_contacts for select
  using ("current_role"() in ('field_worker', 'manager', 'admin'));

create policy "Managers can manage supplier contacts"
  on public.supplier_contacts for all
  using ("current_role"() in ('manager', 'admin'));
