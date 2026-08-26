-- ============================================================================
-- Migration 137: the Amperage Electrical board.
-- ----------------------------------------------------------------------------
-- Amperage Electrical is the company Matthew and Zacques are starting together.
-- This is the shared workspace for running it: one list of things to DO, and one
-- list of features they WANT (the same shape as the dashboard's "What's next").
-- Both of them add items, both comment, either one can move an item along.
--
-- One table, two `kind`s, on purpose. A wanted feature and a to-do differ only
-- in how they read, not in what they need — title, detail, priority, status,
-- owner, a comment thread — and an idea graduating into a task should be a
-- `kind` flip, not a copy into a second table with a second comment thread.
--
-- The Claude contract: `for_claude` is the flag a founder ticks to mean "read
-- this and execute it". Claude stamps `actioned_at` (+ `actioned_note`) once the
-- work is done and replies in the thread as author 'claude', so the board itself
-- is the hand-off record and nothing has to be re-explained in chat.
--
-- Access is membership of `founders_participants` (migration 134) — NOT a role
-- and NOT a permissions-matrix section, because this is private between two
-- named people and every admin on the portal would otherwise inherit it.
-- ============================================================================

create table if not exists public.amperage_items (
  id          uuid primary key default gen_random_uuid(),
  -- 'task'    -> something to do
  -- 'feature' -> something wanted, not yet started (the "What's next" list)
  kind        text not null default 'task' check (kind in ('task', 'feature')),
  title       text not null check (length(trim(title)) > 0),
  detail      text not null default '',
  -- One vocabulary for both kinds; the UI relabels it per kind (a feature's
  -- 'todo' reads "Wanted", its 'done' reads "Shipped").
  status      text not null default 'todo'
              check (status in ('todo', 'doing', 'blocked', 'done', 'parked')),
  priority    text not null default 'medium'
              check (priority in ('urgent', 'high', 'medium', 'low')),
  -- Free-text grouping (e.g. 'Registration', 'Branding', 'Portal'). Deliberately
  -- not an enum: the two of them will invent the categories as they go.
  area        text not null default '',
  -- Who is carrying it. Null = nobody has picked it up yet.
  owner_email text references public.founders_participants(email)
              on update cascade on delete set null,
  due_date    date,
  -- "Claude, do this."
  for_claude  boolean not null default false,
  actioned_at timestamptz,
  actioned_note text,
  -- Manual ordering inside a list; ties fall back to priority then age.
  sort_order  integer not null default 0,
  created_by  text not null default '',
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.amperage_items is
  'Amperage Electrical shared board: kind=task (to-do) or kind=feature (wanted). Private to founders_participants.';
comment on column public.amperage_items.for_claude is
  'Ticked by a founder to mean "Claude should action this". Claude stamps actioned_at when done.';

create index if not exists amperage_items_kind_idx   on public.amperage_items (kind, status);
create index if not exists amperage_items_claude_idx on public.amperage_items (for_claude)
  where for_claude and actioned_at is null;

-- === the conversation on an item ============================================
create table if not exists public.amperage_comments (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.amperage_items(id) on delete cascade,
  -- A participant email, or 'claude' when Claude writes back what it did.
  author_email text not null default '',
  body         text not null check (length(trim(body)) > 0),
  created_at   timestamptz not null default now()
);

create index if not exists amperage_comments_item_idx on public.amperage_comments (item_id, created_at);

-- === stamping ===============================================================
-- Authorship is stamped from the session, never trusted from the client, so one
-- founder cannot post or file under the other's name. A service-role write (no
-- auth.uid() — Claude via MCP, or a script) keeps whatever it supplies and falls
-- back to 'claude'.
create or replace function public.amperage_stamp_item()
returns trigger language plpgsql set search_path = public as $fn$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(public.founder_email(), nullif(trim(new.created_by), ''), 'claude');
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;

  -- done_at tracks the status rather than being set by hand.
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.done_at := now();
  elsif new.status <> 'done' then
    new.done_at := null;
  end if;

  return new;
end;
$fn$;

drop trigger if exists amperage_items_stamp on public.amperage_items;
create trigger amperage_items_stamp
  before insert or update on public.amperage_items
  for each row execute function public.amperage_stamp_item();

create or replace function public.amperage_stamp_comment()
returns trigger language plpgsql set search_path = public as $fn$
begin
  new.author_email := coalesce(public.founder_email(), nullif(trim(new.author_email), ''), 'claude');
  return new;
end;
$fn$;

drop trigger if exists amperage_comments_stamp on public.amperage_comments;
create trigger amperage_comments_stamp
  before insert on public.amperage_comments
  for each row execute function public.amperage_stamp_comment();

revoke execute on function public.amperage_stamp_item()    from anon, public;
revoke execute on function public.amperage_stamp_comment() from anon, public;

-- === RLS: the two named participants, and nobody else =======================
-- No per-author narrowing. The whole point is a shared board: either founder may
-- edit, re-prioritise or tick off anything on it. Comments are append-only for
-- founders — you may delete your own, but you cannot rewrite what was said.
alter table public.amperage_items    enable row level security;
alter table public.amperage_comments enable row level security;

drop policy if exists "Founders read the board" on public.amperage_items;
create policy "Founders read the board"
  on public.amperage_items for select using (public.is_founder());

drop policy if exists "Founders add to the board" on public.amperage_items;
create policy "Founders add to the board"
  on public.amperage_items for insert with check (public.is_founder());

drop policy if exists "Founders update the board" on public.amperage_items;
create policy "Founders update the board"
  on public.amperage_items for update using (public.is_founder()) with check (public.is_founder());

drop policy if exists "Founders remove from the board" on public.amperage_items;
create policy "Founders remove from the board"
  on public.amperage_items for delete using (public.is_founder());

drop policy if exists "Founders read comments" on public.amperage_comments;
create policy "Founders read comments"
  on public.amperage_comments for select using (public.is_founder());

drop policy if exists "Founders comment" on public.amperage_comments;
create policy "Founders comment"
  on public.amperage_comments for insert with check (public.is_founder());

drop policy if exists "Founders delete their own comment" on public.amperage_comments;
create policy "Founders delete their own comment"
  on public.amperage_comments for delete
  using (public.is_founder() and author_email = public.founder_email());
