-- ── Customer soft-delete (archive) ───────────────────────────────
-- Admins can "delete" a customer by archiving it: the record and all
-- attached history (sites, quotes, jobs, financials) are preserved, but
-- the customer drops off the active list. Fully reversible (restore).
--
-- We deliberately avoid a hard DELETE: sites.customer_id cascades through
-- jobs → checklists → monitoring (migration 040 + 001), so a hard delete
-- would silently destroy real business records. Archiving is safe.

alter table public.customers
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.user_profiles(id);

comment on column public.customers.archived_at is
  'When set, the customer is soft-deleted (archived) and hidden from the active list. Null = active.';
comment on column public.customers.archived_by is
  'Staff user (admin) who archived the customer.';

-- Partial index: the active list filters on archived_at is null, so keep
-- that path indexed.
create index if not exists customers_active_idx
  on public.customers (created_at desc) where archived_at is null;
