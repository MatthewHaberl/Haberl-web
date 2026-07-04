-- SANS 10142-1 regulation library.
--
-- Four tables:
--   • sans_documents       — one row per edition (Ed 3.2 in force, Ed 3.03 draft, …)
--   • sans_clauses         — clause tree: ref, title, plain-language summary, tags,
--                             full-text search. Staff-readable.
--   • sans_clause_bodies   — the VERBATIM SABS text, physically separated and
--                             admin-only: SABS copyright means the full text must
--                             never be exposed beyond Matthew's own licensed use.
--   • sans_rules           — machine/checkable design rules distilled from the
--                             standard, keyed to clause refs; the design canvas and
--                             rules pages link through these.
--
-- Clause DATA is loaded separately via service-role SQL (like the 044/045 catalog
-- loads) — this migration is schema + permissions seed only.

create table public.sans_documents (
  id uuid primary key default gen_random_uuid(),
  code text not null,                       -- '10142-1'
  edition text not null,                    -- '3.2', '3.03'
  title text not null,
  status text not null check (status in ('in_force', 'draft', 'superseded')),
  published text,                           -- 'July 2024'
  notes text,
  created_at timestamptz not null default now(),
  unique (code, edition)
);

create table public.sans_clauses (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.sans_documents(id) on delete cascade,
  clause_ref text not null,                 -- '6.2.7.1.1', '3.47', 'D.2.1', 'foreword'
  parent_ref text,                          -- ref of the containing clause, null at top level
  title text,
  kind text not null default 'clause' check (kind in ('section', 'clause', 'definition', 'annex')),
  page_number int,
  plain_summary text,                       -- own-words "for dummies" text — staff-readable
  tags text[] not null default '{}',
  sort_key text not null,                   -- zero-padded path, e.g. '006.002.007.001.001'
  search tsvector generated always as (
    to_tsvector('english',
      coalesce(clause_ref, '') || ' ' || coalesce(title, '') || ' ' ||
      coalesce(plain_summary, ''))
  ) stored,
  created_at timestamptz not null default now(),
  unique (document_id, clause_ref)
);

create index sans_clauses_parent_idx on public.sans_clauses (document_id, parent_ref);
create index sans_clauses_sort_idx   on public.sans_clauses (document_id, sort_key);
create index sans_clauses_tags_idx   on public.sans_clauses using gin (tags);
create index sans_clauses_search_idx on public.sans_clauses using gin (search);

create table public.sans_clause_bodies (
  clause_id uuid primary key references public.sans_clauses(id) on delete cascade,
  body text not null
);

create index sans_clause_bodies_search_idx on public.sans_clause_bodies
  using gin (to_tsvector('english', body));

create table public.sans_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,            -- 'STR-02', 'VD-01', 'AMDT3-01'
  title text not null,
  summary text not null,
  clause_refs text[] not null default '{}',
  category text not null,
  severity text not null check (severity in ('blocker', 'warning', 'info')),
  machine_checkable boolean not null default false,
  implemented_in text,                      -- code pointer, e.g. 'lib/solar/compliance.ts'
  parameters jsonb,
  source text,                              -- 'rules-registry' | 'extraction' | 'amdt3'
  created_at timestamptz not null default now()
);

alter table public.sans_documents      enable row level security;
alter table public.sans_clauses        enable row level security;
alter table public.sans_clause_bodies  enable row level security;
alter table public.sans_rules          enable row level security;

-- Staff read the library metadata, summaries and rules.
create policy "sans_documents_select" on public.sans_documents
  for select using (public.current_role() in ('field_worker', 'manager', 'admin'));

create policy "sans_clauses_select" on public.sans_clauses
  for select using (public.current_role() in ('field_worker', 'manager', 'admin'));

create policy "sans_rules_select" on public.sans_rules
  for select using (public.current_role() in ('field_worker', 'manager', 'admin'));

-- Verbatim standard text: ADMIN ONLY (SABS copyright — licensed copy, personal use).
create policy "sans_clause_bodies_select" on public.sans_clause_bodies
  for select using (public.current_role() = 'admin');

-- No insert/update/delete policies on any of these — writes go through the
-- service role only (content pipeline), same posture as portal_tickets.

-- Permissions-matrix seed: the whole SANS section is admin-only until Matthew
-- opens parts of it to staff (same shape as migration 063's tickets seed).
insert into public.role_permissions (role, section, allowed) values
  ('field_worker'::user_role, 'sans', false),
  ('manager'::user_role,      'sans', false),
  ('admin'::user_role,        'sans', true)
on conflict (role, section) do nothing;
