-- 037_quote_soft_delete.sql
-- Soft-delete for quotes. Hard delete is impossible anyway — jobs, leads,
-- cable_routes and quote_catch_points all FK-reference quote_requests — so the
-- row must persist. On delete the app marks deleted_at/deleted_by and strips the
-- regenerable heavy fields (quote_html, bom_snapshot) to shrink the archived row;
-- generated_quote is kept so an admin can restore it losslessly.
alter table public.quote_requests
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.user_profiles(id);

create index if not exists quote_requests_deleted_at_idx
  on public.quote_requests (deleted_at);
