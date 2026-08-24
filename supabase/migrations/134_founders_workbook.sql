-- ============================================================================
-- Migration 134: the founders' workbook.
-- ----------------------------------------------------------------------------
-- A private, two-person questionnaire used once, before the electrical company
-- is formed: each founder answers the same 74 questions ALONE, and only when
-- everybody has submitted does anyone see anybody else's answers. The whole
-- value of the exercise is in the questions the two of them answer differently,
-- and that value evaporates the moment one of them can read the other's answer
-- first. So the reveal rule is enforced in RLS, not in the UI:
--
--   • you can always read and edit your own answers, until you submit
--   • you can read another founder's answers only once EVERY participant has
--     submitted — including you
--   • after the reveal, `founders_consensus` is where the two of them write the
--     single agreed answer that becomes the term sheet for the attorney
--
-- Identity is the participant's EMAIL, not a user id, because the second
-- founder may not have a portal account on the day a workbook is seeded. Both
-- named participants are seeded below; the owner can add more from the page.
--
-- Access is deliberately NOT wired to `role_permissions` (lib/auth/sections.ts):
-- every admin would inherit it, and this is private between two named people.
-- Membership of `founders_participants` IS the permission.
-- ============================================================================

-- ── who is in the room ──────────────────────────────────────────────────────
create table if not exists public.founders_participants (
  email        text primary key,
  display_name text not null default '',
  -- The owner seeds the workbook and is the only participant who may add or
  -- remove the others. Exactly one row should carry this.
  is_owner     boolean not null default false,
  -- Set by the participant themselves when they are done answering. Null means
  -- still working; nobody's answers are visible while any of these is null.
  submitted_at timestamptz,
  created_at   timestamptz not null default now()
);

comment on table public.founders_participants is
  'The named people who may use the founders workbook. Email is the identity so a partner can be added before they have an account.';

-- Emails are stored lowercase so the lookup against user_profiles is stable.
create or replace function public.founders_normalise_email()
returns trigger language plpgsql set search_path = public as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists founders_participants_normalise on public.founders_participants;
create trigger founders_participants_normalise
  before insert or update of email on public.founders_participants
  for each row execute function public.founders_normalise_email();

-- The two named participants. Byron and Renate are also admins on this portal,
-- which is exactly why this workbook is not wired to the role matrix.
insert into public.founders_participants (email, display_name, is_owner)
values
  ('matthew@haberl.co.za', 'Matthew Haberl', true),
  ('zacques05@gmail.com',  'Zacques Botha',  false)
on conflict (email) do update set display_name = excluded.display_name;

-- ── helpers ─────────────────────────────────────────────────────────────────
-- The participant email for the signed-in user, or null if they are not one.
-- Security definer because it reads user_profiles across the RLS boundary.
create or replace function public.founder_email()
returns text language sql security definer stable set search_path = public as $$
  select p.email
  from public.founders_participants p
  join public.user_profiles u on lower(u.email) = p.email
  where u.id = auth.uid()
  limit 1
$$;

create or replace function public.is_founder()
returns boolean language sql security definer stable set search_path = public as $$
  select public.founder_email() is not null
$$;

-- The reveal gate. False while anyone is still working, and false for a
-- one-person workbook — there is nothing to compare against yourself.
create or replace function public.founders_all_submitted()
returns boolean language sql security definer stable set search_path = public as $$
  select (select count(*) from public.founders_participants) > 1
     and not exists (select 1 from public.founders_participants where submitted_at is null)
$$;

-- Both of these are SECURITY DEFINER on purpose. They are called from policies
-- ON `founders_participants`, and a policy whose subquery reads its own table
-- re-enters RLS; going through a definer function reads the roster once,
-- outside the policy, and keeps the rules easy to reason about.
create or replace function public.is_workbook_owner()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.founders_participants p
    where p.email = public.founder_email() and p.is_owner
  )
$$;

-- True once you have submitted — the point your own answers become read-only.
create or replace function public.founder_submitted()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.founders_participants p
    where p.email = public.founder_email() and p.submitted_at is not null
  )
$$;

revoke execute on function public.founders_normalise_email() from anon, public;

-- ── answers ─────────────────────────────────────────────────────────────────
create table if not exists public.founders_answers (
  id          uuid primary key default gen_random_uuid(),
  email       text not null references public.founders_participants(email) on update cascade on delete cascade,
  -- Stable question key from lib/founders/questions.ts, e.g. 'B08'. Kept as
  -- text so renumbering the printed list never orphans an answer.
  question_id text not null,
  answer      text not null default '',
  updated_at  timestamptz not null default now(),
  unique (email, question_id)
);

create index if not exists founders_answers_email_idx on public.founders_answers (email);

-- ── the agreed position, written together after the reveal ──────────────────
create table if not exists public.founders_consensus (
  question_id text primary key,
  note        text not null default '',
  decided     boolean not null default false,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.founders_participants enable row level security;
alter table public.founders_answers      enable row level security;
alter table public.founders_consensus    enable row level security;

-- Participants: any founder sees the roster (they need to know who is in and
-- who has submitted). Only the owner may change it; anyone may submit/unsubmit
-- their own row.
drop policy if exists "Founders read the roster" on public.founders_participants;
create policy "Founders read the roster"
  on public.founders_participants for select
  using (public.is_founder());

drop policy if exists "Owner manages the roster" on public.founders_participants;
create policy "Owner manages the roster"
  on public.founders_participants for insert
  with check (public.is_workbook_owner());

drop policy if exists "Owner removes a participant" on public.founders_participants;
create policy "Owner removes a participant"
  on public.founders_participants for delete
  using (public.is_workbook_owner() and email <> public.founder_email());

-- A participant submits or reopens their own row; the owner may also rename a
-- participant they added. `with check` repeats the test so a row cannot be
-- updated into somebody else's name.
drop policy if exists "Founders update their own row" on public.founders_participants;
create policy "Founders update their own row"
  on public.founders_participants for update
  using (email = public.founder_email() or public.is_workbook_owner())
  with check (email = public.founder_email() or public.is_workbook_owner());

-- RLS can say WHICH rows you may update, not which COLUMNS, so on its own the
-- policy above lets a participant set `is_owner` on their own row and take over
-- the roster. A participant may only submit or reopen; everything else on the
-- row belongs to the owner.
create or replace function public.founders_guard_participant()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_workbook_owner() then
    return new;
  end if;
  if new.email        is distinct from old.email
  or new.display_name is distinct from old.display_name
  or new.is_owner     is distinct from old.is_owner
  or new.created_at   is distinct from old.created_at then
    raise exception 'Only the workbook owner can change the roster.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists founders_participants_guard on public.founders_participants;
create trigger founders_participants_guard
  before update on public.founders_participants
  for each row execute function public.founders_guard_participant();

revoke execute on function public.founders_guard_participant() from anon, public;

-- Answers: your own always; everyone else's only after the reveal.
drop policy if exists "Founders read own answers, others after reveal" on public.founders_answers;
create policy "Founders read own answers, others after reveal"
  on public.founders_answers for select
  using (
    email = public.founder_email()
    or (public.is_founder() and public.founders_all_submitted())
  );

-- Writes are yours alone, and stop the moment you submit. Reopening your row
-- (clearing submitted_at) makes them possible again.
drop policy if exists "Founders write their own answers" on public.founders_answers;
create policy "Founders write their own answers"
  on public.founders_answers for insert
  with check (email = public.founder_email() and not public.founder_submitted());

drop policy if exists "Founders edit their own answers" on public.founders_answers;
create policy "Founders edit their own answers"
  on public.founders_answers for update
  using (email = public.founder_email() and not public.founder_submitted())
  with check (email = public.founder_email());

drop policy if exists "Founders delete their own answers" on public.founders_answers;
create policy "Founders delete their own answers"
  on public.founders_answers for delete
  using (email = public.founder_email());

-- Consensus: shared, and only worth writing once the answers are on the table.
drop policy if exists "Founders read the consensus" on public.founders_consensus;
create policy "Founders read the consensus"
  on public.founders_consensus for select
  using (public.is_founder());

drop policy if exists "Founders write the consensus" on public.founders_consensus;
create policy "Founders write the consensus"
  on public.founders_consensus for insert
  with check (public.is_founder() and public.founders_all_submitted());

drop policy if exists "Founders edit the consensus" on public.founders_consensus;
create policy "Founders edit the consensus"
  on public.founders_consensus for update
  using (public.is_founder() and public.founders_all_submitted())
  with check (public.is_founder());

-- ── touch timestamps ────────────────────────────────────────────────────────
create or replace function public.founders_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists founders_answers_touch on public.founders_answers;
create trigger founders_answers_touch
  before update on public.founders_answers
  for each row execute function public.founders_touch();

drop trigger if exists founders_consensus_touch on public.founders_consensus;
create trigger founders_consensus_touch
  before update on public.founders_consensus
  for each row execute function public.founders_touch();

revoke execute on function public.founders_touch() from anon, public;
