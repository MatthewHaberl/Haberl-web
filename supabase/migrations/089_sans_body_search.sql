-- Full-text search over the verbatim clause text needs a real tsvector column
-- (PostgREST's textSearch can't target an expression index). Admin-only via the
-- existing RLS policy on the table.

alter table public.sans_clause_bodies
  add column search tsvector generated always as (to_tsvector('english', body)) stored;

drop index if exists public.sans_clause_bodies_search_idx;
create index sans_clause_bodies_search_idx on public.sans_clause_bodies using gin (search);
