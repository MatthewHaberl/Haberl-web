-- Applied to production 2026-08-03 (version 20260803180828) outside the repo.
-- Recovered from supabase_migrations.schema_migrations. See _out_of_band/README.md.

alter table public.quote_requests
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.user_profiles(id);

comment on column public.quote_requests.archived_at is
  'When set, the quote is archived: hidden from the active list, follow-ups and briefing. Null = active. Nothing is stripped — restore is lossless.';
comment on column public.quote_requests.archived_by is
  'Staff user who archived the quote.';

create index if not exists quote_requests_active_idx
  on public.quote_requests (created_at desc)
  where deleted_at is null and archived_at is null;
